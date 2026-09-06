/* Foaia de stil a paginii oaspetelui e un template literal dintr-un fisier
 * .js, iar asta are o capcana care s-a inchis peste mine de cinci ori in
 * proiectul asta: un backtick scris intr-un comentariu CSS inchide sirul.
 * Rezultatul nu e o eroare care sa spuna asta, ci un 500 pe modul sau un
 * mesaj despre un punct si virgula lipsa, la sute de linii distanta.
 *
 * Fisierul nu e importat de niciun alt test — se incarca doar in main.jsx,
 * la rulare — deci pana acum nimic din suita nu-l atingea.
 *
 * DE CE IMPORTUL E DINAMIC, in fiecare test, si nu sus de tot: un import
 * obisnuit se rezolva inaintea oricarui test, deci un sir rupt facea
 * fisierul intreg sa nu porneasca, si tocmai testul care ar fi numit cauza
 * nu mai apuca sa ruleze. Verificat: cu backtick pus intentionat, suita
 * cadea cu o eroare de parsare si fara niciun cuvant despre backticks.
 * Asa, verificarea pe sursa merge oricum, iar mesajul ei ajunge la om.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/* Citit de pe disc, nu prin import.meta.url: vitest nu da mereu o adresa de
   tip file: pentru fisierul de test, iar fileURLToPath cade cu „The URL
   must be of scheme file". Radacina proiectului e directorul din care
   ruleaza vitest. */
const SURSA = readFileSync("src/guest/styles.js", "utf8");
const BT = String.fromCharCode(96);
const CAP = "export const STILURI = " + BT;

const interiorulSirului = () => {
  const de = SURSA.indexOf(CAP);
  if (de < 0) throw new Error("Nu am gasit inceputul foii de stil in sursa.");
  return SURSA.slice(de + CAP.length, SURSA.lastIndexOf(BT));
};

describe("foaia de stil, verificata pe sursa", () => {
  it("nu are backticks în interior", () => {
    const vinovate = interiorulSirului().split("\n")
      .map((rand, i) => (rand.includes(BT) ? `${i + 1}: ${rand.trim()}` : null))
      .filter(Boolean);
    expect(
      vinovate,
      "un backtick închide șirul — scrie numele proprietății simplu, fără ele",
    ).toEqual([]);
  });

  /* Numarul de acolade trebuie sa fie egal. E verificarea cea mai ieftina
     care prinde o foaie taiata la mijloc. */
  it("are acoladele în echilibru", () => {
    const corp = interiorulSirului();
    expect((corp.match(/{/g) || []).length).toBe((corp.match(/}/g) || []).length);
  });
});

describe("foaia de stil, încărcată", () => {
  it("se importă fără să crape", async () => {
    const { STILURI } = await import("./guest/styles.js");
    expect(typeof STILURI).toBe("string");
    expect(STILURI.length).toBeGreaterThan(1000);
  });

  it("conține regulile de care depinde pagina", async () => {
    const { STILURI } = await import("./guest/styles.js");
    for (const bucata of [".g-hero", ".g-usa", ".g-cod", ".g-scurtatura",
                          ".g-fereastra", ".g-vreme", ".g-leg", ".g-atractie"]) {
      expect(STILURI).toContain(bucata);
    }
  });

  /* Cardul inchis are culorile scrise ca valori, nu ca jetoane, tocmai
     fiindca --ivory si --charcoal se inverseaza in tema de noapte. Daca
     cineva le „curata" inapoi in jetoane, textul devine negru pe negru pe
     telefoanele cu tema intunecata — o greseala care nu se vede la lumina
     zilei si de care afli de la un oaspete. */
  it("nu ia culorile cardului închis din jetoane", async () => {
    const { STILURI } = await import("./guest/styles.js");
    const hero = STILURI.slice(STILURI.indexOf(".g-hero{"));
    const regula = hero.slice(0, hero.indexOf("}"));
    expect(regula).not.toContain("var(--ivory)");
    expect(regula).not.toContain("var(--charcoal)");
  });
});
