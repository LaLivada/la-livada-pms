import { describe, it, expect } from "vitest";
import {
  laOraLocala, expirareCod, randeazaSablon, decideActiuneAcces, decalajFus,
} from "./lib/acces.js";

/* Ora locala se citeste inapoi in fusul hotelului, nu in cel al masinii pe
   care ruleaza testul — altfel testul ar trece pe laptopul din Romania si
   ar pica in CI, care ruleaza pe UTC. */
const oraRo = (d) => new Intl.DateTimeFormat("ro-RO", {
  timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit",
}).format(d);
const ziRo = (d) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
}).format(d);

describe("expirarea codului de acces", () => {
  it("expira la 11:30 in ziua plecarii, cu setarile implicite", () => {
    // Plecare pe 23 august, ora din rezervare irelevanta: conteaza ZIUA.
    const e = expirareCod("2026-08-23T11:00:00+03:00");
    expect(ziRo(e)).toBe("2026-08-23");
    expect(oraRo(e)).toBe("11:30");
  });

  it("nu are 11:30 scris de mana: gratia si ora de plecare sunt separate", () => {
    // Cazul din brief-ul initial: plecare la 12:00 => expirare 12:30.
    expect(oraRo(expirareCod("2026-08-23T11:00:00+03:00", { oraPlecare: 12 }))).toBe("12:30");
    // Gratie de 45 de minute, fara sa umble nimeni prin cod.
    expect(oraRo(expirareCod("2026-08-23T11:00:00+03:00", { grateMinute: 45 }))).toBe("11:45");
    // Gratie care trece peste ora: 11:00 + 90 = 12:30, reportat de Date.
    expect(oraRo(expirareCod("2026-08-23T11:00:00+03:00", { grateMinute: 90 }))).toBe("12:30");
  });

  it("da aceeasi ora locala vara si iarna, desi decalajul UTC difera", () => {
    const vara  = expirareCod("2026-07-15T11:00:00+03:00");
    const iarna = expirareCod("2026-12-15T11:00:00+02:00");
    expect(oraRo(vara)).toBe("11:30");
    expect(oraRo(iarna)).toBe("11:30");
    // Dovada ca nu e o coincidenta: momentele UTC chiar difera cu o ora.
    expect(vara.getUTCHours()).toBe(8);    // 11:30 EEST = 08:30 UTC
    expect(iarna.getUTCHours()).toBe(9);   // 11:30 EET  = 09:30 UTC
  });

  it("trece corect peste noaptea schimbarii orei", () => {
    // Romania trece la ora de iarna in ultima duminica din octombrie 2026 (25).
    // O plecare fix in acea zi e cazul in care o constanta de fus ar gresi.
    const e = expirareCod("2026-10-25T11:00:00+03:00");
    expect(ziRo(e)).toBe("2026-10-25");
    expect(oraRo(e)).toBe("11:30");
  });

  it("decalajul fusului e calculat, nu presupus", () => {
    expect(decalajFus(new Date("2026-07-15T00:00:00Z"))).toBe(3 * 3600_000);
    expect(decalajFus(new Date("2026-12-15T00:00:00Z"))).toBe(2 * 3600_000);
  });

  it("laOraLocala pastreaza ziua reperului, nu o muta cu fusul", () => {
    // 23 august 21:00 UTC = 24 august 00:00 in Romania. Ziua de referinta
    // trebuie sa fie cea locala (24), nu cea UTC (23).
    const e = laOraLocala("2026-08-23T21:00:00Z", 11, 30);
    expect(ziRo(e)).toBe("2026-08-24");
  });
});

describe("sablonul mesajului", () => {
  const valori = {
    guest_name: "Ion Popescu", hotel_name: "Complex La Livada",
    room_number: "204", access_code: "583921",
    valid_from: "20 august 2026, 15:00", valid_until: "23 august 2026, 11:30",
  };

  it("inlocuieste toate variabilele", () => {
    const t = randeazaSablon(
      "{{guest_name}} · {{room_number}} · {{access_code}} · {{valid_until}}", valori);
    expect(t).toBe("Ion Popescu · 204 · 583921 · 23 august 2026, 11:30");
  });

  it("accepta spatii in interiorul acoladelor", () => {
    expect(randeazaSablon("{{ access_code }}", valori)).toBe("583921");
  });

  it("nu lasa {{...}} in mesajul trimis oaspetelui pentru variabile lipsa", () => {
    // Un cod cu "{{telefon}}" in text ar arata a aplicatie stricata.
    expect(randeazaSablon("Sunati la {{telefon}}.", valori)).toBe("Sunati la .");
  });

  it("nu se sufoca pe sablon gol sau lipsa", () => {
    expect(randeazaSablon("", valori)).toBe("");
    expect(randeazaSablon(null, valori)).toBe("");
  });
});

describe("cand trebuie resincronizat codul", () => {
  const baza = {
    id: "r1", roomId: "cam1", status: "checkedin",
    checkin: "2026-08-20T12:00:00Z", checkout: "2026-08-23T08:00:00Z",
  };

  it("nu face nimic daca nu s-a schimbat nimic relevant", () => {
    expect(decideActiuneAcces(baza, { ...baza, notes: "alta nota" })).toBe(null);
  });

  it("revoca la anulare si la no-show", () => {
    expect(decideActiuneAcces(baza, { ...baza, status: "cancelled" })).toBe("revoke");
    expect(decideActiuneAcces(baza, { ...baza, status: "noshow" })).toBe("revoke");
  });

  it("regenereaza cand se schimba camera", () => {
    expect(decideActiuneAcces(baza, { ...baza, roomId: "cam2" })).toBe("reissue");
  });

  it("regenereaza cand se schimba plecarea", () => {
    expect(decideActiuneAcces(baza, { ...baza, checkout: "2026-08-25T08:00:00Z" }))
      .toBe("reissue");
  });

  it("regenereaza cand se schimba sosirea", () => {
    expect(decideActiuneAcces(baza, { ...baza, checkin: "2026-08-21T12:00:00Z" }))
      .toBe("reissue");
  });

  it("anularea are prioritate fata de o schimbare de camera", () => {
    // Altfel am genera un cod nou pe camera noua pentru o rezervare moarta.
    expect(decideActiuneAcces(baza, { ...baza, roomId: "cam2", status: "cancelled" }))
      .toBe("revoke");
  });

  it("nu decide nimic fara ambele stari", () => {
    expect(decideActiuneAcces(null, baza)).toBe(null);
    expect(decideActiuneAcces(baza, null)).toBe(null);
  });
});
