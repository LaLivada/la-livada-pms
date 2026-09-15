/* Aritmetica pe zile a calendarului pe ani (lib/evenimente-an.js). Momentele
 * sunt scrise in UTC, asteptarile in ziua de la Vaslui: un eveniment de
 * toata ziua e stocat ca miezul noptii local (21:00Z vara, 22:00Z iarna),
 * iar DTEND e exclusiv. Node are ICU complet, deci formatele ro-RO sunt
 * cele din browser. */
import { describe, it, expect } from "vitest";
import {
  MAX_ZILE_EVENIMENT, cheieZi, descriereMoment, fereastraAnului, grupeazaPeZile, luniAnului,
  numarPeLuni, titluZi, zileleEvenimentului,
} from "./lib/evenimente-an.js";

const ev = (p) => ({ id: "x", calendar_id: "c", rezumat: "t", incepe: null, se_termina: null, toata_ziua: false, recurent: false, ...p });

describe("zileleEvenimentului", () => {
  it("toata ziua, o zi: miezul noptii local → exact ziua aceea", () => {
    expect(zileleEvenimentului(ev({ incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-05T21:00:00Z", toata_ziua: true })))
      .toEqual(["2027-06-05"]);
  });
  it("toata ziua, 5–7 iunie: DTEND exclusiv pe 8 → trei zile, nu patru", () => {
    expect(zileleEvenimentului(ev({ incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-07T21:00:00Z", toata_ziua: true })))
      .toEqual(["2027-06-05", "2027-06-06", "2027-06-07"]);
  });
  it("cu ora, se termina fix la miezul noptii: ramane o singura zi", () => {
    expect(zileleEvenimentului(ev({ incepe: "2027-06-05T15:00:00Z", se_termina: "2027-06-05T21:00:00Z" })))
      .toEqual(["2027-06-05"]);
  });
  it("cu ora, peste noapte si peste an: doua zile", () => {
    expect(zileleEvenimentului(ev({ incepe: "2027-12-31T18:00:00Z", se_termina: "2028-01-01T02:00:00Z" })))
      .toEqual(["2027-12-31", "2028-01-01"]);
  });
  it("fara sfarsit, sau cu sfarsitul inaintea inceputului: o zi", () => {
    expect(zileleEvenimentului(ev({ incepe: "2027-06-05T09:00:00Z" }))).toEqual(["2027-06-05"]);
    expect(zileleEvenimentului(ev({ incepe: "2027-06-05T09:00:00Z", se_termina: "2027-06-05T08:00:00Z" }))).toEqual(["2027-06-05"]);
  });
  it("peste trecerea la ora de vara (28 martie 2027) numara zilele corect", () => {
    expect(zileleEvenimentului(ev({ incepe: "2027-03-26T22:00:00Z", se_termina: "2027-03-29T21:00:00Z", toata_ziua: true })))
      .toEqual(["2027-03-27", "2027-03-28", "2027-03-29"]);
  });
  it("un eveniment absurd de lung e taiat la MAX_ZILE_EVENIMENT", () => {
    const zile = zileleEvenimentului(ev({ incepe: "2026-12-31T22:00:00Z", se_termina: "2027-12-31T22:00:00Z", toata_ziua: true }));
    expect(zile).toHaveLength(MAX_ZILE_EVENIMENT);
    expect(zile[0]).toBe("2027-01-01");
    expect(zile[zile.length - 1]).toBe("2027-01-31");
  });
  it("fara inceput sau cu inceput invalid: nimic", () => {
    expect(zileleEvenimentului(ev({}))).toEqual([]);
    expect(zileleEvenimentului(ev({ incepe: "candva" }))).toEqual([]);
  });
});

describe("grupeazaPeZile / numarPeLuni", () => {
  const ordine = (id) => ({ c1: 0, c2: 1 })[id] ?? 9;
  it("tine doar zilele din an si sorteaza: toata ziua, apoi ora, apoi ordinea salii, apoi titlul", () => {
    const lista = [
      ev({ id: "A", calendar_id: "c2", rezumat: "A", incepe: "2027-06-05T09:00:00Z", se_termina: "2027-06-05T12:00:00Z" }),
      ev({ id: "B", calendar_id: "c2", rezumat: "B", incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-05T21:00:00Z", toata_ziua: true }),
      ev({ id: "C", calendar_id: "c1", rezumat: "C", incepe: "2027-06-05T07:00:00Z", se_termina: "2027-06-05T08:00:00Z" }),
      ev({ id: "D", calendar_id: "c1", rezumat: "D", incepe: "2027-06-05T09:00:00Z", se_termina: "2027-06-05T10:00:00Z" }),
      ev({ id: "E", calendar_id: "c1", rezumat: "E", incepe: "2026-06-05T09:00:00Z", se_termina: "2026-06-05T10:00:00Z" }),
    ];
    const peZile = grupeazaPeZile(lista, 2027, ordine);
    expect([...peZile.keys()]).toEqual(["2027-06-05"]);
    expect(peZile.get("2027-06-05").map((e) => e.id)).toEqual(["B", "C", "D", "A"]);
  });
  it("un eveniment peste granita de luna se numara o data in fiecare din cele doua luni", () => {
    const lista = [
      ev({ id: "R", incepe: "2027-06-30T18:00:00Z", se_termina: "2027-07-01T02:00:00Z" }),
      ev({ id: "S", incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-07T21:00:00Z", toata_ziua: true }),
    ];
    const peZile = grupeazaPeZile(lista, 2027);
    expect(peZile.get("2027-06-30").map((e) => e.id)).toEqual(["R"]);
    expect(peZile.get("2027-07-01").map((e) => e.id)).toEqual(["R"]);
    const peLuni = numarPeLuni(peZile);
    expect(peLuni[5]).toBe(2);
    expect(peLuni[6]).toBe(1);
    expect(peLuni.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("luniAnului / cheieZi", () => {
  it("2027: ianuarie incepe vineri (4 casute goale, saptamana de luni), februarie are 28; 2028 are 29", () => {
    const luni = luniAnului(2027);
    expect(luni).toHaveLength(12);
    expect(luni[0]).toEqual({ luna: 1, nume: "ianuarie", zile: 31, decalaj: 4 });
    expect(luni[1].zile).toBe(28);
    expect(luniAnului(2028)[1].zile).toBe(29);
    expect(luni.map((l) => l.zile).reduce((a, b) => a + b, 0)).toBe(365);
  });
  it("cheieZi completeaza cu zero", () => {
    expect(cheieZi(2027, 6, 5)).toBe("2027-06-05");
  });
});

describe("fereastraAnului", () => {
  it("o zi in plus de fiecare parte, in ora hotelului (+2 iarna)", () => {
    expect(fereastraAnului(2027)).toEqual({ de: "2026-12-30T22:00:00.000Z", la: "2028-01-01T22:00:00.000Z" });
  });
});

describe("titluZi / descriereMoment", () => {
  it("titlul zilei e in romana, cu ziua saptamanii si anul", () => {
    expect(titluZi("2027-06-05")).toBe("sâmbătă, 5 iunie 2027");
  });
  it("toata ziua: „toată ziua” pentru o zi, intervalul de date pentru mai multe", () => {
    expect(descriereMoment(ev({ incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-05T21:00:00Z", toata_ziua: true }))).toBe("toată ziua");
    expect(descriereMoment(ev({ incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-07T21:00:00Z", toata_ziua: true }))).toBe("5 iun. – 7 iun.");
  });
  it("cu ora: orele in ora hotelului; peste noapte si datele", () => {
    expect(descriereMoment(ev({ incepe: "2027-06-05T09:00:00Z", se_termina: "2027-06-05T15:00:00Z" }))).toBe("12:00–18:00");
    expect(descriereMoment(ev({ incepe: "2027-12-31T18:00:00Z", se_termina: "2028-01-01T02:00:00Z" }))).toBe("31 dec. 20:00 – 1 ian. 04:00");
    expect(descriereMoment(ev({ incepe: "2027-06-05T09:00:00Z" }))).toBe("12:00");
    expect(descriereMoment(ev({}))).toBe("");
  });
});
