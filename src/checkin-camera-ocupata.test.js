/* Garda „camera e inca ocupata" de la check-in.
 *
 * Motivul punctual: pe 9 septembrie 2026, receptia nu mai putea caza o
 * rezervare fiindca ALTA rezervare, complet in viitor, era deja „checkedin"
 * pe aceeasi camera. Garda compara doar `blocker.checkout > res.checkin` —
 * jumatate dintr-un test de suprapunere.
 *
 * Jumatatea aia lipsa n-a deranjat cat timp check-in-ul se putea face doar
 * in ziua sosirii: atunci o rezervare „checkedin" era mereu una in curs,
 * deci mereu inaintea celei pe care voiai s-o cazezi. De cand cazarea e
 * permisa cu 14 zile inainte (ZILE_CHECKIN_DEVREME), o rezervare intreaga
 * din viitor poate fi deja „checkedin", si atunci jumatatea lipsa o
 * transforma in blocaj pentru orice sosire dinaintea ei.
 *
 * Testele de aici verifica AMBELE capete ale suprapunerii, nu doar cazul
 * care a fost raportat.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn().mockResolvedValue({ ok: true }),
}));

const { doCheckIn } = await import("./features/rezervari.jsx");

/* Camera fara yala: altfel doCheckIn ar cere si un cod de acces, ceea ce
   n-are legatura cu ce se verifica aici. */
const CORE = {
  rooms: [{ id: "r1001", name: "1001", type: "tiny", capacity: 2 },
          { id: "r1002", name: "1002", type: "tiny", capacity: 2 }],
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ana" },
           { id: "g2", lastName: "Ionescu", firstName: "Dan" }],
};

const zi = (n) => new Date(2026, 8, n, 14, 0, 0).toISOString();

function rezervare(over = {}) {
  return {
    id: "r-noua", roomId: "r1001", guestId: "g1", status: "confirmed",
    checkin: zi(10), checkout: zi(12), adults: 2, children: 0, ...over,
  };
}

let updateReservations;
beforeEach(() => {
  updateReservations = vi.fn().mockResolvedValue(true);
  /* Ceasul fixat pe 9 septembrie: sosirea de pe 10 intra in fereastra de
     check-in devreme, deci `canCheckIn` nu e cel care refuza in testele de
     mai jos — se testeaza doar garda de camera ocupata. */
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));
});

describe("doCheckIn — o rezervare viitoare nu blocheaza una dinaintea ei", () => {
  it("permite cazarea cand cealalta rezervare incepe DUPA ce se termina asta", async () => {
    // Bug-ul raportat: 20-25 „checkedin" bloca 10-12, in aceeasi camera.
    const viitoare = rezervare({
      id: "r-viitoare", guestId: "g2", status: "checkedin",
      checkin: zi(20), checkout: zi(25),
    });
    const noua = rezervare();

    const r = await doCheckIn(noua, [viitoare, noua], updateReservations, CORE);

    expect(r).toBe(true);
    expect(updateReservations).toHaveBeenCalledTimes(1);
    const salvate = updateReservations.mock.calls[0][0];
    expect(salvate.find((x) => x.id === "r-noua").status).toBe("checkedin");
  });

  it("refuza cand perioadele chiar se suprapun", async () => {
    const suprapusa = rezervare({
      id: "r-suprapusa", guestId: "g2", status: "checkedin",
      checkin: zi(8), checkout: zi(14),
    });
    const noua = rezervare();

    const r = await doCheckIn(noua, [suprapusa, noua], updateReservations, CORE);

    expect(r).toEqual({ error: expect.stringContaining("ocupată") });
    expect(r.error).toContain("Ionescu");
    expect(updateReservations).not.toHaveBeenCalled();
  });

  it("permite predarea in aceeasi zi — plecarea la ora sosirii nu e suprapunere", async () => {
    const pleaca = rezervare({
      id: "r-pleaca", guestId: "g2", status: "checkedin",
      checkin: zi(8), checkout: zi(10),
    });
    const noua = rezervare();

    expect(await doCheckIn(noua, [pleaca, noua], updateReservations, CORE)).toBe(true);
  });

  it("refuza cand cealalta rezervare a inceput inainte si inca nu s-a inchis", async () => {
    // Capatul „clasic": cineva e inauntru chiar acum.
    const inauntru = rezervare({
      id: "r-inauntru", guestId: "g2", status: "checkedin",
      checkin: zi(5), checkout: zi(11),
    });
    const noua = rezervare();

    const r = await doCheckIn(noua, [inauntru, noua], updateReservations, CORE);
    expect(r).toHaveProperty("error");
  });

  it("nu se uita la alta camera", async () => {
    const altaCamera = rezervare({
      id: "r-alta", roomId: "r1002", guestId: "g2", status: "checkedin",
      checkin: zi(8), checkout: zi(14),
    });
    const noua = rezervare();

    expect(await doCheckIn(noua, [altaCamera, noua], updateReservations, CORE)).toBe(true);
  });

  it("nu se uita la rezervari care nu sunt cazate", async () => {
    /* Doar „checkedin" inseamna ca e cineva inauntru. O rezervare doar
       confirmata pe acelasi interval e o problema de suprarezervare, nu de
       check-in, si se rezolva in alta parte. */
    for (const status of ["confirmed", "pending", "cancelled", "noshow", "checkedout"]) {
      updateReservations = vi.fn().mockResolvedValue(true);
      const alta = rezervare({ id: "r-alta", guestId: "g2", status, checkin: zi(8), checkout: zi(14) });
      const noua = rezervare();
      expect(await doCheckIn(noua, [alta, noua], updateReservations, CORE)).toBe(true);
    }
  });
});
