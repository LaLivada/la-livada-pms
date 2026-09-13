/* Aplicarea evenimentelor Realtime peste starea din browser —
 * src/lib/schimbari-live.js (faza 2, A6 + B3 din docs/audit-2026-09.md). */
import { describe, it, expect } from "vitest";
import {
  aplicaSchimbareRezervare, aplicaSchimbareStatusCamera, ceLipseste,
  esteMaiVechi, urmaritorAbonament, coadaEvenimente, ASTEPTARE_CANAL_MS,
} from "./lib/schimbari-live.js";

const rand = (extra = {}) => ({
  id: "r1", room_id: "r1001", guest_id: "g1", group_id: null,
  checkin: "2026-09-20T11:00:00+00:00", checkout: "2026-09-22T08:00:00+00:00",
  status: "confirmed", adults: 2, children: 0, price_override: null, booked_price: 300,
  source: "direct", tags: null, notes: null, occupant_last_name: "Pop", occupant_first_name: "Ana",
  occupant_phone: null, messages: null, seeded: false, billing_customer_id: null,
  guest_code: "abc", updated_at: "2026-09-14T10:00:00+00:00", ...extra,
});

describe("aplicaSchimbareRezervare — INSERT / UPDATE / DELETE dupa id", () => {
  it("o rezervare noua se adauga, in forma aplicatiei", () => {
    const s = aplicaSchimbareRezervare({ reservations: [], blocks: [] }, { tip: "INSERT", nou: rand(), vechi: null });
    expect(s.reservations).toHaveLength(1);
    expect(s.reservations[0]).toMatchObject({ id: "r1", roomId: "r1001", guestId: "g1", status: "confirmed", updatedAt: "2026-09-14T10:00:00+00:00", guestCode: "abc" });
    expect(s.blocks).toEqual([]);
  });

  it("o modificare inlocuieste randul pe pozitia lui", () => {
    const init = { reservations: [{ id: "r0" }, { id: "r1", status: "confirmed", updatedAt: "2026-09-14T10:00:00+00:00" }, { id: "r2" }], blocks: [] };
    const s = aplicaSchimbareRezervare(init, { tip: "UPDATE", nou: rand({ status: "checkedin", updated_at: "2026-09-14T10:05:00+00:00" }), vechi: { id: "r1" } });
    expect(s.reservations.map((r) => r.id)).toEqual(["r0", "r1", "r2"]);
    expect(s.reservations[1].status).toBe("checkedin");
  });

  it("un eveniment mai vechi decat ce e in browser NU se aplica", () => {
    const init = { reservations: [{ id: "r1", status: "checkedin", updatedAt: "2026-09-14T10:05:00+00:00" }], blocks: [] };
    const s = aplicaSchimbareRezervare(init, { tip: "UPDATE", nou: rand({ status: "confirmed", updated_at: "2026-09-14T10:00:00+00:00" }), vechi: { id: "r1" } });
    expect(s).toBe(init);
  });

  it("ecoul propriei salvari (aceeasi stampila) se aplica — aduce guest_code si restul de pe server", () => {
    const init = { reservations: [{ id: "r1", status: "confirmed", updatedAt: "2026-09-14T10:00:00+00:00", guestCode: "" }], blocks: [] };
    const s = aplicaSchimbareRezervare(init, { tip: "UPDATE", nou: rand(), vechi: { id: "r1" } });
    expect(s.reservations[0].guestCode).toBe("abc");
  });

  it("stergerea scoate randul; a unui id necunoscut lasa starea neatinsa (identitate)", () => {
    const init = { reservations: [{ id: "r1" }, { id: "r2" }], blocks: [] };
    const s = aplicaSchimbareRezervare(init, { tip: "DELETE", nou: null, vechi: { id: "r1" } });
    expect(s.reservations.map((r) => r.id)).toEqual(["r2"]);
    expect(aplicaSchimbareRezervare(init, { tip: "DELETE", nou: null, vechi: { id: "r9" } })).toBe(init);
  });

  it("un blocaj (source = blocaj) merge in lista de blocaje, nu in rezervari", () => {
    const s = aplicaSchimbareRezervare({ reservations: [], blocks: [] },
      { tip: "INSERT", nou: rand({ id: "b1", source: "blocaj", notes: "renovare", guest_id: null }), vechi: null });
    expect(s.reservations).toEqual([]);
    expect(s.blocks).toEqual([{ id: "b1", roomId: "r1001", start: "2026-09-20T11:00:00+00:00", end: "2026-09-22T08:00:00+00:00", reason: "renovare" }]);
    const sters = aplicaSchimbareRezervare(s, { tip: "DELETE", nou: null, vechi: { id: "b1" } });
    expect(sters.blocks).toEqual([]);
  });

  it("camerista primeste vederea de ocupare, fara nume si fara pret", () => {
    const s = aplicaSchimbareRezervare({ reservations: [], blocks: [] }, { tip: "INSERT", nou: rand(), vechi: null }, true);
    expect(s.reservations[0]).toEqual({
      id: "r1", roomId: "r1001", checkin: "2026-09-20T11:00:00+00:00", checkout: "2026-09-22T08:00:00+00:00",
      status: "confirmed", source: "direct", notes: "", tags: [], messages: [],
    });
    expect(s.reservations[0].guestId).toBeUndefined();
  });

  it("un eveniment fara id, sau lipsa, lasa starea neatinsa", () => {
    const init = { reservations: [], blocks: [] };
    expect(aplicaSchimbareRezervare(init, { tip: "INSERT", nou: {}, vechi: null })).toBe(init);
    expect(aplicaSchimbareRezervare(init, null)).toBe(init);
  });
});

describe("ceLipseste — oaspetele si grupul unei rezervari sosite de pe alta tableta", () => {
  it("cere doar ce nu e in browser", () => {
    const r = { guestId: "g1", groupId: "gr1" };
    expect(ceLipseste(r, { guests: [], groups: [] })).toEqual({ guestIds: ["g1"], groupIds: ["gr1"] });
    expect(ceLipseste(r, { guests: [{ id: "g1" }], groups: [{ id: "gr1" }] })).toEqual({ guestIds: [], groupIds: [] });
    expect(ceLipseste({ guestId: null, groupId: null }, {})).toEqual({ guestIds: [], groupIds: [] });
  });
});

describe("aplicaSchimbareStatusCamera — harta de curatenie", () => {
  const ev = (status, changed_at = "2026-09-14T10:00:00+00:00") => ({
    tip: "UPDATE", nou: { room_id: "r1001", status, changed_at, changed_by: "u1", changed_by_name: "Carmen" }, vechi: { room_id: "r1001" },
  });

  it("pune statusul, cu cine si cand", () => {
    const hk = aplicaSchimbareStatusCamera({ r1002: { status: "clean" } }, ev("dirty"));
    expect(hk).toEqual({ r1002: { status: "clean" }, r1001: { status: "dirty", updatedAt: "2026-09-14T10:00:00+00:00", deCine: "Carmen" } });
  });

  it("un eveniment mai vechi nu da ecranul inapoi", () => {
    const init = { r1001: { status: "clean", updatedAt: "2026-09-14T10:05:00+00:00", deCine: "Carmen" } };
    expect(aplicaSchimbareStatusCamera(init, ev("dirty", "2026-09-14T10:00:00+00:00"))).toBe(init);
    expect(aplicaSchimbareStatusCamera(init, ev("dirty", "2026-09-14T10:05:00+00:00")).r1001.status).toBe("dirty");
  });

  it("stergerea (camera stearsa) scoate intrarea", () => {
    const init = { r1001: { status: "clean" }, r1002: { status: "dirty" } };
    expect(aplicaSchimbareStatusCamera(init, { tip: "DELETE", nou: null, vechi: { room_id: "r1001" } })).toEqual({ r1002: { status: "dirty" } });
    expect(aplicaSchimbareStatusCamera(init, { tip: "DELETE", nou: null, vechi: { room_id: "r9" } })).toBe(init);
  });
});

describe("esteMaiVechi", () => {
  it("compara momente, nu siruri — formatele PostgREST si Realtime difera", () => {
    expect(esteMaiVechi("2026-09-14T10:00:00Z", "2026-09-14T10:00:00.5+00:00")).toBe(true);
    expect(esteMaiVechi("2026-09-14T13:00:00+03:00", "2026-09-14T10:00:00Z")).toBe(false);
    expect(esteMaiVechi(undefined, "2026-09-14T10:00:00Z")).toBe(false);
    expect(esteMaiVechi("2026-09-14T10:00:00Z", undefined)).toBe(false);
  });
});

describe("urmaritorAbonament — cand porneste incarcarea si cand se reincarca", () => {
  it("abonarea venita la timp porneste; re-abonarea dupa o intrerupere reincarca", () => {
    const la = urmaritorAbonament();
    expect(la("SUBSCRIBED")).toBe("porneste");
    expect(la("CLOSED")).toBe(null);
    expect(la("CHANNEL_ERROR")).toBe(null);
    expect(la("SUBSCRIBED")).toBe("reincarca");
    expect(la("SUBSCRIBED")).toBe("reincarca");
  });

  it("fara Realtime porneste oricum (asteptare / eroare), iar abonarea intarziata reincarca", () => {
    expect(urmaritorAbonament()("asteptare")).toBe("porneste");
    expect(urmaritorAbonament()("TIMED_OUT")).toBe("porneste");
    const la = urmaritorAbonament();
    expect(la("CHANNEL_ERROR")).toBe("porneste");
    expect(la("asteptare")).toBe(null);
    expect(la("SUBSCRIBED")).toBe("reincarca");
    expect(ASTEPTARE_CANAL_MS).toBe(4000);
  });
});

describe("coadaEvenimente — evenimentele din timpul unei incarcari se rejoaca dupa", () => {
  it("in afara unei incarcari nu retine nimic", () => {
    const c = coadaEvenimente();
    expect(c.inCurs).toBe(false);
    expect(c.retine({ tip: "INSERT" })).toBe(false);
    expect(c.termina()).toEqual([]);
  });

  it("in timpul incarcarii retine, la sfarsit le da inapoi in ordine si se goleste", () => {
    const c = coadaEvenimente();
    c.incepe();
    expect(c.inCurs).toBe(true);
    expect(c.retine({ n: 1 })).toBe(true);
    expect(c.retine({ n: 2 })).toBe(true);
    expect(c.termina()).toEqual([{ n: 1 }, { n: 2 }]);
    expect(c.inCurs).toBe(false);
    expect(c.retine({ n: 3 })).toBe(false);
  });
});
