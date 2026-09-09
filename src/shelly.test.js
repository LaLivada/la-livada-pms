/* Cele doua functii pure din providerul Shelly. Restul fisierului vorbeste
 * cu reteaua, deci nu se poate testa aici; astea doua au fost extrase
 * anume ca sa se poata.
 *
 * De ce merita testate tocmai ele:
 *
 * `citesteIesire` a avut un defect real, prins cand s-a aflat montajul: un
 * Shelly Pro 4PM raspunde O SINGURA DATA per dispozitiv, cu toate cele
 * patru canale inauntru, iar prima versiune citea mereu canalul 0. La un
 * refresh, toate cele patru canale ar fi primit starea canalului 0 — cu
 * boilerul pornit, interfata ar fi aratat si prizele pornite.
 *
 * `faraCheie` e ultima poarta inainte ca un text de eroare sa ajunga in
 * `device_commands.detail` sau la browser. Shelly cere `auth_key` in QUERY
 * STRING, deci cheia care controleaza toate releele contului apare in orice
 * mesaj care citeaza URL-ul. O regresie aici scrie cheia in baza de date.
 */
import { describe, it, expect } from "vitest";
import { citesteIesire, citesteConsum, faraCheie } from "../supabase/functions/device-provider/providers/shelly.ts";

describe("citesteIesire — canalul cerut, nu primul gasit", () => {
  /* Forma reala a unui Pro 4PM: iesirile fizice 1-4 sunt `switch:0`..
     `switch:3` in API. Aici iluminatul exterior (iesirea 1 = switch:0) e
     oprit, boilerul (iesirea 2 = switch:1) e pornit. */
  const PRO_4PM = {
    "switch:0": { output: false },
    "switch:1": { output: true },
    "switch:2": { output: false },
    "switch:3": { output: true },
  };

  it("citeste fiecare canal separat", () => {
    expect(citesteIesire(PRO_4PM, 0)).toBe(false);
    expect(citesteIesire(PRO_4PM, 1)).toBe(true);
    expect(citesteIesire(PRO_4PM, 2)).toBe(false);
    expect(citesteIesire(PRO_4PM, 3)).toBe(true);
  });

  it("nu intoarce starea canalului 0 pentru celelalte canale", () => {
    // Exact regresia de evitat: canalul 0 oprit, canalul 1 pornit.
    expect(citesteIesire(PRO_4PM, 1)).not.toBe(citesteIesire(PRO_4PM, 0));
  });

  it("accepta si forma `switchN`, fara doua puncte", () => {
    expect(citesteIesire({ switch1: { output: true } }, 1)).toBe(true);
    expect(citesteIesire({ switch1: { output: false } }, 1)).toBe(false);
  });

  it("accepta forma Gen1 cu `relays[N].ison`", () => {
    const gen1 = { relays: [{ ison: false }, { ison: true }] };
    expect(citesteIesire(gen1, 0)).toBe(false);
    expect(citesteIesire(gen1, 1)).toBe(true);
  });

  it("cade pe `false`, nu pe exceptie, cand forma e necunoscuta", () => {
    // Un status nerecunoscut trebuie sa apara ca "Oprit" in interfata, nu
    // sa rupa refresh-ul intregului lot de dispozitive.
    expect(citesteIesire(null, 0)).toBe(false);
    expect(citesteIesire(undefined, 0)).toBe(false);
    expect(citesteIesire("pornit", 0)).toBe(false);
    expect(citesteIesire({ altceva: 1 }, 0)).toBe(false);
    expect(citesteIesire(PRO_4PM, 9)).toBe(false);
  });
});

describe("faraCheie — cheia de cont nu pleaca mai departe", () => {
  it("ascunde cheia dintr-un URL citat intr-o eroare", () => {
    const brut = "fetch a esuat la https://shelly-103-eu.shelly.cloud/v2/devices/api/get?auth_key=abc123SECRET";
    const curat = faraCheie(brut);
    expect(curat).not.toContain("abc123SECRET");
    expect(curat).toContain("auth_key=***");
  });

  it("ascunde cheia si cand urmeaza alti parametri", () => {
    expect(faraCheie("...?auth_key=abc123&id=xy")).toBe("...?auth_key=***&id=xy");
  });

  it("ascunde toate aparitiile, nu doar prima", () => {
    const curat = faraCheie("unu auth_key=aaa doi auth_key=bbb");
    expect(curat).not.toMatch(/aaa|bbb/);
  });

  it("lasa neatins un text fara cheie", () => {
    const mesaj = "Dispozitivul e offline — verifica alimentarea.";
    expect(faraCheie(mesaj)).toBe(mesaj);
  });
});

describe("citesteConsum — contorul Pro 3EM pe trei faze", () => {
  /* Forma documentata pentru Gen2: un obiect `em:0` cu chei pe litere.
     Puterea vine in WATI de la Shelly. */
  const PRO_3EM = {
    "em:0": {
      a_act_power: 812.4, a_current: 3.54, a_voltage: 231.2,
      b_act_power: 903.1, b_current: 3.91, b_voltage: 230.8,
      c_act_power: 715.9, c_current: 3.12, c_voltage: 232.0,
      total_act_power: 2431.4, total_current: 10.57,
    },
  };

  it("numeste fazele R, S, T in ordinea a, b, c", () => {
    const c = citesteConsum(PRO_3EM);
    expect(c.faze.map((f) => f.nume)).toEqual(["R", "S", "T"]);
    expect(c.faze[0].a).toBeCloseTo(3.54, 2);
    expect(c.faze[1].a).toBeCloseTo(3.91, 2);
    expect(c.faze[2].a).toBeCloseTo(3.12, 2);
  });

  it("intoarce kW, nu W — conversia se face o singura data, aici", () => {
    const c = citesteConsum(PRO_3EM);
    expect(c.faze[0].kw).toBeCloseTo(0.8124, 4);
    expect(c.totalKw).toBeCloseTo(2.4314, 4);
  });

  it("prefera totalul raportat de dispozitiv sumei fazelor", () => {
    // 2431.4 nu e exact suma (812.4+903.1+715.9 = 2431.4 aici, deci il
    // fortam sa difere ca sa se vada care a fost ales).
    const c = citesteConsum({ "em:0": { ...PRO_3EM["em:0"], total_act_power: 9999 } });
    expect(c.totalKw).toBeCloseTo(9.999, 3);
  });

  it("cade pe suma fazelor cand dispozitivul nu raporteaza un total", () => {
    const fara = { ...PRO_3EM["em:0"] };
    delete fara.total_act_power;
    delete fara.total_current;
    const c = citesteConsum({ "em:0": fara });
    expect(c.totalKw).toBeCloseTo((812.4 + 903.1 + 715.9) / 1000, 4);
    expect(c.totalA).toBeCloseTo(3.54 + 3.91 + 3.12, 2);
  });

  it("accepta si forma Gen1 cu tabloul `emeters`", () => {
    const c = citesteConsum({
      emeters: [
        { power: 500, current: 2.2, voltage: 230 },
        { power: 600, current: 2.6, voltage: 231 },
        { power: 700, current: 3.0, voltage: 229 },
      ],
    });
    expect(c.faze.map((f) => f.nume)).toEqual(["R", "S", "T"]);
    expect(c.totalKw).toBeCloseTo(1.8, 4);
  });

  it("intoarce null cand raspunsul nu contine un contor", () => {
    // Un releu obisnuit trece prin aceeasi functie la refresh-ul in loturi.
    expect(citesteConsum({ "switch:0": { output: true } })).toBeNull();
    expect(citesteConsum(null)).toBeNull();
    expect(citesteConsum("ceva")).toBeNull();
  });

  it("pune zero, nu NaN, pe o faza cu valori lipsa", () => {
    // O cifra lipsa e mai onesta decat una inventata; NaN ar fi ajuns pe
    // ecran ca „NaN kW".
    const c = citesteConsum({ "em:0": { a_act_power: 1000, a_current: 4.3 } });
    expect(c.faze[1].kw).toBe(0);
    expect(c.faze[2].a).toBe(0);
    expect(Number.isFinite(c.totalKw)).toBe(true);
  });
});
