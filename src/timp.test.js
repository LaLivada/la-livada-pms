/* Timpul hotelului — src/lib/timp.js.
 *
 * Toate asteptarile sunt momente UTC scrise explicit, ca testele sa spuna
 * acelasi lucru pe orice masina: faza 2 (B6 din docs/audit-2026-09.md) cere
 * ca „ziua" sa fie cea de la Vaslui indiferent de fusul browserului, iar un
 * test care ar folosi `new Date(2026, 8, 14)` (miezul noptii LOCAL) ar trece
 * pe o tableta din Romania si ar minti pe orice altceva. CI ruleaza suita si
 * cu TZ=America/New_York exact din motivul asta.
 */
import { describe, it, expect } from "vitest";
import {
  FUS_HOTEL, ZI_MS, partiLocale, decalajFus, dinPartiLocale, laOraLocala,
  dataLocala, textLocal, ziLocala, adaugaZile, zileIntre, esteAceeasiZi,
  momentLocal, adaugaZileLaData, inceputDeLuna, sfarsitDeLuna, zileInLuna,
  ziuaSaptamanii, esteWeekend,
} from "./lib/timp.js";

const utc = (s) => new Date(s).toISOString();

describe("partiLocale — componentele orei de la Vaslui", () => {
  it("citeste anul, luna, ziua si ora in fusul hotelului, nu in cel al masinii", () => {
    // 13 septembrie 21:30 UTC = 14 septembrie 00:30 la Vaslui (EEST, +3).
    expect(partiLocale("2026-09-13T21:30:15Z")).toEqual({
      an: 2026, luna: 9, zi: 14, ore: 0, minute: 30, secunde: 15, ziSapt: 1,
    });
  });

  it("iarna decalajul e +2", () => {
    expect(partiLocale("2026-12-31T22:30:00Z")).toMatchObject({ an: 2027, luna: 1, zi: 1, ore: 0, minute: 30, ziSapt: 5 });
  });

  it("o data invalida da null, nu NaN-uri imprastiate", () => {
    expect(partiLocale("nimic")).toBeNull();
    expect(partiLocale(NaN)).toBeNull();
  });

  it("decalajul fusului e calculat, nu presupus (mutat din acces.js)", () => {
    expect(decalajFus(new Date("2026-07-15T00:00:00Z"))).toBe(3 * 3600_000);
    expect(decalajFus(new Date("2026-12-15T00:00:00Z"))).toBe(2 * 3600_000);
    expect(FUS_HOTEL).toBe("Europe/Bucharest");
    expect(ZI_MS).toBe(86400000);
  });
});

describe("dinPartiLocale — de la ora de perete la moment", () => {
  it("14:00 la Vaslui in septembrie e 11:00 UTC", () => {
    expect(utc(dinPartiLocale(2026, 9, 14, 14, 0))).toBe("2026-09-14T11:00:00.000Z");
  });

  it("14:00 la Vaslui in decembrie e 12:00 UTC", () => {
    expect(utc(dinPartiLocale(2026, 12, 14, 14, 0))).toBe("2026-12-14T12:00:00.000Z");
  });

  it("ziua 32 se reporteaza singura in luna urmatoare (ca Date.UTC)", () => {
    expect(utc(dinPartiLocale(2026, 1, 32, 0, 0))).toBe("2026-01-31T22:00:00.000Z");
  });

  it("laOraLocala pastreaza ziua reperului, nu o muta cu fusul (mutat din acces.js)", () => {
    // 23 august 21:00 UTC = 24 august 00:00 la Vaslui.
    expect(utc(laOraLocala("2026-08-23T21:00:00Z", 11, 30))).toBe("2026-08-24T08:30:00.000Z");
  });

  it("laOraLocala reporteaza minutele peste 59 (gratia se aduna la ora de plecare)", () => {
    expect(utc(laOraLocala("2026-08-24T08:00:00Z", 11, 90))).toBe("2026-08-24T09:30:00.000Z");
  });
});

describe("ziLocala — miezul noptii de la Vaslui", () => {
  it("vara: ziua incepe la 21:00 UTC in seara dinainte", () => {
    expect(utc(ziLocala("2026-09-13T21:30:00Z"))).toBe("2026-09-13T21:00:00.000Z");
    expect(utc(ziLocala("2026-09-14T20:59:00Z"))).toBe("2026-09-13T21:00:00.000Z");
  });

  it("iarna: la 22:00 UTC", () => {
    expect(utc(ziLocala("2026-12-15T10:00:00Z"))).toBe("2026-12-14T22:00:00.000Z");
  });

  it("in ziua trecerii la ora de vara miezul noptii e inca pe +2", () => {
    // 29 martie 2026: ceasul sare la 03:00 -> 04:00 (01:00 UTC).
    expect(utc(ziLocala("2026-03-29T12:00:00Z"))).toBe("2026-03-28T22:00:00.000Z");
  });

  it("in ziua trecerii la ora de iarna miezul noptii e inca pe +3", () => {
    // 25 octombrie 2026: 04:00 -> 03:00 (01:00 UTC).
    expect(utc(ziLocala("2026-10-25T12:00:00Z"))).toBe("2026-10-24T21:00:00.000Z");
  });

  it("dataLocala scrie AAAA-LL-ZZ, comparabil ca text si cu o coloana `date`", () => {
    expect(dataLocala("2026-09-13T21:30:00Z")).toBe("2026-09-14");
    expect(dataLocala("2026-09-13T20:30:00Z")).toBe("2026-09-13");
    expect(dataLocala("aiurea")).toBe("");
  });

  it("textLocal e valoarea unui <input type=datetime-local>, in ora hotelului", () => {
    expect(textLocal("2026-09-14T11:00:00Z")).toBe("2026-09-14T14:00");
    expect(textLocal("2026-12-14T12:05:00Z")).toBe("2026-12-14T14:05");
  });
});

describe("adaugaZile / zileIntre — aritmetica pe zile, cu schimbarea orei", () => {
  it("adaugaZile pastreaza ora de perete peste trecerea la ora de vara", () => {
    // 28 martie 14:00 EET (12:00Z) + 1 zi = 29 martie 14:00 EEST (11:00Z), nu 15:00.
    expect(utc(adaugaZile("2026-03-28T12:00:00Z", 1))).toBe("2026-03-29T11:00:00.000Z");
  });

  it("adaugaZile pastreaza ora de perete peste trecerea la ora de iarna", () => {
    expect(utc(adaugaZile("2026-10-24T11:00:00Z", 1))).toBe("2026-10-25T12:00:00.000Z");
  });

  it("adaugaZile cu numar negativ si peste granita de an", () => {
    expect(utc(adaugaZile("2027-01-01T10:00:00Z", -1))).toBe("2026-12-31T10:00:00.000Z");
  });

  it("zileIntre numara zile calendaristice, nu multipli de 24h", () => {
    // 23:30 -> 00:30 (Vaslui) e o zi, desi a trecut o ora.
    expect(zileIntre("2026-09-13T20:30:00Z", "2026-09-13T21:30:00Z")).toBe(1);
    // peste trecerea la ora de vara: 2 zile, nu 1,96.
    expect(zileIntre("2026-03-28T12:00:00Z", "2026-03-30T11:00:00Z")).toBe(2);
    expect(zileIntre("2026-09-14T11:00:00Z", "2026-09-14T11:00:00Z")).toBe(0);
    expect(zileIntre("2026-09-14T11:00:00Z", "2026-09-13T11:00:00Z")).toBe(-1);
  });

  it("esteAceeasiZi judeca dupa ziua de la Vaslui", () => {
    expect(esteAceeasiZi("2026-09-13T20:59:00Z", "2026-09-13T21:01:00Z")).toBe(false);
    expect(esteAceeasiZi("2026-09-13T21:01:00Z", "2026-09-14T20:59:00Z")).toBe(true);
  });
});

describe("momentLocal — ce vine din <input> e ora hotelului", () => {
  it("datetime-local fara fus se citeste ca ora de la Vaslui", () => {
    expect(utc(momentLocal("2026-09-14T14:00"))).toBe("2026-09-14T11:00:00.000Z");
    expect(utc(momentLocal("2026-12-14T14:00"))).toBe("2026-12-14T12:00:00.000Z");
    expect(utc(momentLocal("2026-09-14T14:00:30"))).toBe("2026-09-14T11:00:30.000Z");
  });

  it("o data simpla e miezul noptii de la Vaslui, nu UTC (cum ar face new Date)", () => {
    expect(utc(momentLocal("2026-09-14"))).toBe("2026-09-13T21:00:00.000Z");
  });

  it("un sir cu fus explicit ramane ce este", () => {
    expect(utc(momentLocal("2026-09-14T11:00:00Z"))).toBe("2026-09-14T11:00:00.000Z");
    expect(utc(momentLocal("2026-09-14T14:00:00+03:00"))).toBe("2026-09-14T11:00:00.000Z");
    expect(utc(momentLocal("2026-09-14T11:00:00.000Z"))).toBe("2026-09-14T11:00:00.000Z");
  });

  it("un Date sau un numar trec neatinse; gunoiul da o data invalida", () => {
    const d = new Date("2026-09-14T11:00:00Z");
    expect(momentLocal(d).getTime()).toBe(d.getTime());
    expect(momentLocal(d.getTime()).getTime()).toBe(d.getTime());
    expect(Number.isNaN(momentLocal("").getTime())).toBe(true);
    expect(Number.isNaN(momentLocal("2026-13-45T99:99").getTime())).toBe(true);
  });

  it("dus-intors cu textLocal", () => {
    expect(textLocal(momentLocal("2026-10-25T03:30"))).toBe("2026-10-25T03:30");
    expect(textLocal(momentLocal("2026-07-01T09:15"))).toBe("2026-07-01T09:15");
  });
});

describe("adaugaZileLaData — pe sirul de data, fara ora si fara fus", () => {
  it("trece peste luna si peste an bisect", () => {
    expect(adaugaZileLaData("2026-02-27", 3)).toBe("2026-03-02");
    expect(adaugaZileLaData("2028-02-28", 1)).toBe("2028-02-29");
    expect(adaugaZileLaData("2026-12-31", 1)).toBe("2027-01-01");
    expect(adaugaZileLaData("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("lunile — la miezul noptii de la Vaslui", () => {
  const acum = new Date("2026-09-13T21:30:00Z"); // 14 septembrie 00:30 la Vaslui

  it("inceputDeLuna e 1 ale lunii, ora 00:00 la Vaslui", () => {
    expect(utc(inceputDeLuna(0, acum))).toBe("2026-08-31T21:00:00.000Z");
    expect(utc(inceputDeLuna(-1, acum))).toBe("2026-07-31T21:00:00.000Z");
    expect(utc(inceputDeLuna(-9, acum))).toBe("2025-11-30T22:00:00.000Z"); // decembrie 2025, +2
  });

  it("sfarsitDeLuna e 1 ale lunii urmatoare", () => {
    const sept = inceputDeLuna(0, acum);
    expect(utc(sfarsitDeLuna(sept))).toBe("2026-09-30T21:00:00.000Z");
    expect(zileInLuna(sept)).toBe(30);
    expect(zileInLuna(inceputDeLuna(-7, acum))).toBe(28); // februarie 2026
    expect(zileInLuna(inceputDeLuna(1, acum))).toBe(31);  // octombrie, cu schimbarea orei inauntru
  });
});

describe("sirurile fara fus si ziua saptamanii", () => {
  it("partiLocale citeste un sir fara fus ca ora hotelului, nu a masinii", () => {
    expect(partiLocale("2026-09-14T14:00")).toMatchObject({ zi: 14, ore: 14, minute: 0 });
    expect(dataLocala("2026-09-14")).toBe("2026-09-14");
    expect(zileIntre("2026-09-14T14:00", "2026-09-16T11:00")).toBe(2);
  });

  it("ziuaSaptamanii si esteWeekend judeca dupa ziua de la Vaslui", () => {
    // 13 septembrie 2026 e duminica; la 21:30 UTC la Vaslui e deja luni 14.
    expect(ziuaSaptamanii("2026-09-13T21:30:00Z")).toBe(1);
    expect(esteWeekend("2026-09-13T21:30:00Z")).toBe(false);
    expect(esteWeekend("2026-09-12T21:30:00Z")).toBe(true);
    expect(Number.isNaN(ziuaSaptamanii("x"))).toBe(true);
  });
});
