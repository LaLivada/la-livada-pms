import { describe, it, expect } from "vitest";
import { statisticiLuna, statisticiProtocol, statisticiDinSql, inceputDeLuna, zileInLuna } from "./lib/rapoarte.js";

/* Septembrie 2026, 30 de zile, in ora locala — exact cum le construieste
   si ecranul (setDate(1), setHours(0)). */
const LUNA = new Date(2026, 8, 1);
const zi = (d, h = 14) => new Date(2026, 8, d, h).toISOString();

const core = {
  rooms: [
    { id: "t1", type: "tiny", capacity: 2 },
    { id: "t2", type: "tiny", capacity: 2 },
    { id: "l1", type: "loft", capacity: 2 },
  ],
  rates: { base: { tiny: 350, loft: 450, tinySingle: 0, loftSingle: 0, adultSupplement: 0, childSupplement: 0 }, seasons: [] },
};

const rezervari = [
  // 3 nopti in luna, pret inghetat 300 -> 100/noapte
  { id: "a", roomId: "t1", checkin: zi(10), checkout: zi(13, 12), status: "checkedout", source: "direct", bookedPrice: 300 },
  // 3 nopti (30 aug, 31 aug, 1 sept) din care doar ultima e in septembrie —
  // ziua plecarii (2 sept) nu e noapte vanduta; pret manual 450 -> 150/noapte
  { id: "b", roomId: "l1", checkin: new Date(2026, 7, 30, 14).toISOString(), checkout: zi(2, 12), status: "checkedout", source: "site", priceOverride: 450 },
  // anulata: nu conteaza nicaieri
  { id: "c", roomId: "t2", checkin: zi(5), checkout: zi(8, 12), status: "cancelled", source: "direct", bookedPrice: 900 },
  // protocol: statistica separata, 2 nopti in luna, valoare 700 -> 350/noapte
  { id: "d", roomId: "t2", checkin: zi(20), checkout: zi(22, 12), status: "protocol", source: "direct", bookedPrice: 700 },
  // camera care nu exista: numara la ocupare, nu la venit (ca in ecran)
  { id: "e", roomId: "zzz", checkin: zi(15), checkout: zi(16, 12), status: "confirmed", source: "phone", bookedPrice: 100 },
];

describe("statisticiLuna", () => {
  const s = statisticiLuna(rezervari, core, LUNA);

  it("numara noptile din luna, fara ziua plecarii si fara anulate/protocol", () => {
    expect(s.roomNights).toBe(3 + 1 + 1);
    expect(s.capacity).toBe(3 * 30);
    expect(s.occupancy).toBe(Math.round((5 / 90) * 100));
  });

  it("venitul e cota pe noapte din pretul real, doar pe noptile din luna si doar pe camere existente", () => {
    expect(s.revenue).toBe(300 + 150);
    expect(s.adr).toBe(450 / 5);
    expect(s.revpar).toBe(450 / 90);
  });

  it("pe zile: ziua 10 are o camera, ziua 13 (plecare) niciuna, ziua 1 are loftul", () => {
    const pe = Object.fromEntries(s.perDay.map((p) => [p.day, p]));
    expect(pe[10]).toEqual({ day: 10, occ: 1, rev: 100 });
    expect(pe[12].occ).toBe(1);
    expect(pe[13].occ).toBe(0);
    expect(pe[1]).toEqual({ day: 1, occ: 1, rev: 150 });
    expect(s.maxOcc).toBe(1);
    expect(s.perDay).toHaveLength(30);
  });

  it("pe tip: tiny 3 nopti din 60, loft 1 din 30", () => {
    expect(s.byType).toEqual([
      { type: "tiny", nights: 3, cap: 60, pct: 5 },
      { type: "loft", nights: 1, cap: 30, pct: 3 },
    ]);
  });

  it("pe sursa: rezervarile care ating luna, cu totalul intreg al fiecareia, sortate dupa numar", () => {
    const surse = Object.fromEntries(s.bySource.map((x) => [x.key, x]));
    expect(Object.keys(surse).sort()).toEqual(["direct", "phone", "site"]);
    expect(surse.direct.count).toBe(1);
    expect(surse.direct.rev).toBe(300);
    expect(surse.site.rev).toBe(450);
    expect(surse.phone.rev).toBe(100);
    expect(surse.direct.pct).toBe(33);
  });

  it("o luna goala nu imparte la zero", () => {
    const gol = statisticiLuna([], core, LUNA);
    expect(gol.occupancy).toBe(0);
    expect(gol.adr).toBe(0);
    expect(gol.bySource).toEqual([]);
    expect(gol.maxOcc).toBe(1);
  });
});

describe("statisticiProtocol", () => {
  it("numara doar protocolul: sejururi, nopti in luna, valoare pe acele nopti", () => {
    expect(statisticiProtocol(rezervari, core, LUNA)).toEqual({ count: 1, nights: 2, value: 700 });
  });

  it("un protocol care intra in luna doar cu o noapte aduce doar cota ei", () => {
    const r = [{ id: "p", roomId: "t1", checkin: new Date(2026, 7, 30, 14).toISOString(), checkout: zi(2, 12), status: "protocol", bookedPrice: 900 }];
    expect(statisticiProtocol(r, core, LUNA)).toEqual({ count: 1, nights: 1, value: 300 });
  });
});

/* Ce intoarce `raport_luna` pentru aceleasi rezervari de mai sus (agregatele
   brute, fara procente si fara etichete) trebuie sa dea, prin
   statisticiDinSql, exact ce da statisticiLuna. Camera inexistenta „zzz" nu
   poate exista in baza (FK), deci fixture-ul SQL n-o are: aici e verificata
   doar traducerea, paritatea cu baza reala e in scripts/paritate-raport.mjs. */
describe("statisticiDinSql", () => {
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const occ = day === 1 || (day >= 10 && day <= 12) || day === 15 ? 1 : 0;
    const rev = day === 1 ? 150 : (day >= 10 && day <= 12) ? 100 : 0;
    return { day, occ, rev };
  });
  const raport = {
    zile: 30, roomNights: 5, revenue: "450.00", capacity: 90, perDay,
    byType: [{ type: "tiny", nights: 3, cap: 60 }, { type: "loft", nights: 1, cap: 30 }],
    bySource: [{ key: "direct", count: 1, rev: 300 }, { key: "phone", count: 1, rev: 100 }, { key: "site", count: 1, rev: "450" }],
    protocol: { count: 1, nights: 2, value: 700 },
  };
  const ref = statisticiLuna(rezervari, core, LUNA);

  it("da aceleasi cifre derivate ca statisticiLuna: ocupare, ADR, RevPAR, pe tip, pe sursa", () => {
    const { luna, protocol } = statisticiDinSql(raport);
    expect(luna.occupancy).toBe(ref.occupancy);
    expect(luna.adr).toBe(ref.adr);
    expect(luna.revpar).toBe(ref.revpar);
    expect(luna.maxOcc).toBe(ref.maxOcc);
    expect(luna.byType).toEqual(ref.byType);
    expect(luna.bySource).toEqual(ref.bySource);
    expect(luna.perDay).toEqual(ref.perDay);
    expect(protocol).toEqual(statisticiProtocol(rezervari, core, LUNA));
  });

  it("o sursa necunoscuta listei intra la numitor, dar nu pe ecran", () => {
    const { luna } = statisticiDinSql({ ...raport, bySource: [{ key: "direct", count: 1, rev: 300 }, { key: "zzz", count: 3, rev: 0 }] });
    expect(luna.bySource).toEqual([{ key: "direct", label: "Direct", count: 1, rev: 300, pct: 25 }]);
  });

  it("un raspuns lipsa sau gol da luna goala, fara impartiri la zero", () => {
    for (const r of [null, undefined, {}, { perDay: null, bySource: null }]) {
      const { luna, protocol } = statisticiDinSql(r);
      expect(luna).toMatchObject({ roomNights: 0, revenue: 0, capacity: 0, occupancy: 0, adr: 0, revpar: 0, maxOcc: 1, perDay: [], bySource: [] });
      expect(protocol).toEqual({ count: 0, nights: 0, value: 0 });
    }
  });
});

describe("inceputDeLuna / zileInLuna", () => {
  it("luna curenta, la miezul noptii, ziua 1; decalajul merge inapoi si peste an", () => {
    const acum = new Date(2026, 0, 15, 13, 45);
    expect(inceputDeLuna(0, acum)).toEqual(new Date(2026, 0, 1));
    expect(inceputDeLuna(-1, acum)).toEqual(new Date(2025, 11, 1));
    expect(inceputDeLuna(2, acum)).toEqual(new Date(2026, 2, 1));
  });
  it("numarul de zile respecta luna, inclusiv februarie bisect", () => {
    expect(zileInLuna(new Date(2026, 8, 1))).toBe(30);
    expect(zileInLuna(new Date(2028, 1, 1))).toBe(29);
    expect(zileInLuna(new Date(2026, 1, 1))).toBe(28);
  });
});
