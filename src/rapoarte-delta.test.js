/* Rapoarte (faza 3, C6): delta fata de aceeasi luna a anului trecut si
 * exportul CSV — logica pura din lib/rapoarte.js.
 *
 * Ce s-ar strica tacut: un „+∞ %" cand anul trecut era 0; ocuparea in
 * procente relative („+25 %" pentru 12 → 15); o luna dinaintea aplicatiei
 * aratata ca „−100 %"; un nume de sursa cu „;" care rupe CSV-ul.
 */
import { describe, it, expect } from "vitest";
import { deltaFata, deltaRaport, csvRaport, numeFisierRaport, statisticiDinSql } from "./lib/rapoarte.js";

describe("deltaFata", () => {
  it("bani: procent fata de anul trecut, cu semn tipografic", () => {
    expect(deltaFata(1200, 1000)).toEqual({ semn: 1, text: "+20 %" });
    expect(deltaFata(900, 1000)).toEqual({ semn: -1, text: "−10 %" });
    expect(deltaFata(1000, 1000)).toEqual({ semn: 0, text: "±0 %" });
  });
  it("ocupare: puncte procentuale, nu procent relativ", () => {
    expect(deltaFata(15, 12, { puncte: true })).toEqual({ semn: 1, text: "+3 pp" });
    expect(deltaFata(40, 55, { puncte: true })).toEqual({ semn: -1, text: "−15 pp" });
  });
  /* Testul care conteaza: fara baza nu exista procent. */
  it("fara baza anul trecut nu inventeaza un procent", () => {
    expect(deltaFata(500, 0)).toEqual({ semn: 0, text: "—", faraBaza: true });
    expect(deltaFata(0, 0)).toEqual({ semn: 0, text: "—", faraBaza: true });
  });
});

const RAPORT = {
  roomNights: 60, revenue: 12000, capacity: 480,
  perDay: [{ day: 1, occ: 2, rev: 400 }, { day: 2, occ: 3, rev: 500 }],
  byType: [{ type: "tiny", nights: 50, cap: 420 }, { type: "loft", nights: 10, cap: 60 }],
  bySource: [{ key: "direct", count: 10, rev: 8000 }, { key: "booking", count: 4, rev: 4000 }],
  protocol: { count: 1, nights: 2, value: 600 },
};

describe("deltaRaport", () => {
  it("cele patru carduri, din statisticile celor doua luni", () => {
    const acum = statisticiDinSql(RAPORT).luna;
    const anTrecut = statisticiDinSql({ ...RAPORT, roomNights: 48, revenue: 10000 }).luna;
    const d = deltaRaport(acum, anTrecut);
    expect(d.ocupare).toEqual({ semn: 1, text: "+3 pp" }); // 13 % fata de 10 %
    expect(d.venit).toEqual({ semn: 1, text: "+20 %" });
    expect(d.adr).toEqual({ semn: -1, text: "−4 %" });     // 200 fata de 208
    expect(d.revpar).toEqual({ semn: 1, text: "+20 %" });
  });
  it("o luna fara nimic anul trecut nu e „0 %”, e necunoscuta", () => {
    const acum = statisticiDinSql(RAPORT).luna;
    expect(deltaRaport(acum, statisticiDinSql(null).luna)).toBeNull();
    expect(deltaRaport(acum, null)).toBeNull();
  });
});

describe("csvRaport", () => {
  const stat = statisticiDinSql(RAPORT);
  const csv = csvRaport(stat, { an: 2026, luna: 9 });
  const linii = csv.split("\n");

  it("are luna, zilele, totalul, sursele, tipurile si protocolul, cu „;”", () => {
    expect(linii[0]).toBe("luna;2026-09");
    expect(linii[2]).toBe("zi;camere_ocupate;venit_lei");
    expect(linii[3]).toBe("1;2;400");
    expect(linii[4]).toBe("2;3;500");
    expect(linii[6]).toBe("camere_nopti;capacitate;ocupare_pct;venit_lei;adr_lei;revpar_lei");
    expect(linii[7]).toBe("60;480;13;12000;200;25");
    expect(linii[9]).toBe("sursa;rezervari;venit_lei;procent");
    expect(linii[10]).toBe("Direct;10;8000;71");
    expect(csv).toMatch(/tip_camera;camere_nopti;capacitate;ocupare_pct\nTiny house;50;420;12\n/);
    expect(csv).toMatch(/protocol_sejururi;protocol_nopti;protocol_valoare_lei\n1;2;600\n$/);
  });

  it("aceleasi cifre ca pe ecran, nimic recalculat", () => {
    expect(linii[7].split(";")[2]).toBe(String(stat.luna.occupancy));
  });

  it("o valoare cu „;” sau ghilimele e pusa intre ghilimele", () => {
    const cuSursa = statisticiDinSql({ ...RAPORT, bySource: [{ key: "direct", count: 1, rev: 1 }] });
    cuSursa.luna.bySource[0].label = 'Di;rect "X"';
    expect(csvRaport(cuSursa, { an: 2026, luna: 9 })).toMatch(/"Di;rect ""X""";1;1;100/);
  });

  it("fara protocol nu apare tabelul lui", () => {
    const fara = statisticiDinSql({ ...RAPORT, protocol: { count: 0 } });
    expect(csvRaport(fara, { an: 2026, luna: 9 })).not.toMatch(/protocol/);
  });

  it("numele fisierului are anul si luna cu doua cifre", () => {
    expect(numeFisierRaport(2026, 9)).toBe("raport-2026-09.csv");
  });
});
