/* Check-in si check-out care NU au ajuns in baza.
 *
 * `updateReservations` (pms-app.jsx) raspunde in trei feluri:
 *   · `true`  — randul e scris (sau pus in coada offline: tot `true`);
 *   · `false` — eroare obisnuita de baza, deja aratata omului de
 *               `raporteazaEroare`;
 *   · `null`  — conflict de concurenta (C5) dupa care nu s-a scris NIMIC:
 *               „Ia pe a lor" sau dialogul inchis, cu toastul lui.
 *
 * doCheckIn si doCheckOut nu se uitau la raspuns. Dupa un check-in nesalvat,
 * jurnalul primea totusi „Check-in", receptia vedea toastul verde, yala
 * primea un PIN, iar televizorul un „Bun venit" — pentru o rezervare care in
 * baza NU e cazata. La check-out, la fel: camera trecea pe „murdara" si codul
 * de acces era sters, desi oaspetele e inca inauntru.
 *
 * Testele „de control" (raspuns `true`) au un rost aici: fara ele, „nu s-a
 * chemat" ar trece si pe o camera fara yala sau cu mock-urile legate gresit —
 * adica fara sa dovedeasca nimic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("./lib/audit.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, audit: { ...original.audit, push: vi.fn(async () => {}) } };
});
/* Doar apelul catre functia edge e inlocuit: `bunVenitLaCheckin` si
   `stergeMesajLaCheckout` raman cele reale, deci „televizorul n-a fost
   atins" se verifica la granita, nu pe un mock al lor. */
vi.mock("./data/televizoare.js", async (importOriginal) => ({
  ...(await importOriginal()),
  cheamaTv: vi.fn(async () => ({ ok: true, trimise: 1 })),
}));

const { doCheckIn, doCheckOut } = await import("./features/rezervari.jsx");
const { cheamaAcces } = await import("./features/acces.jsx");
const { cheamaTv } = await import("./data/televizoare.js");
const { audit } = await import("./lib/audit.js");
const { toaster } = await import("./ui/primitive.jsx");

/* Camera CU yala — altfel `cheamaAcces` n-ar fi chemat nici la un check-in
   reusit, iar „nu s-a chemat" n-ar mai spune nimic. */
const CORE = {
  rooms: [{ id: "r1001", name: "1001", type: "tiny", capacity: 2, accessProvider: "ttlock", accessLockId: "yala-1001" }],
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ana" }],
};

const zi = (n) => new Date(2026, 8, n, 14, 0, 0).toISOString();

function rezervare(over = {}) {
  return {
    id: "r-1", roomId: "r1001", guestId: "g1", status: "confirmed",
    checkin: zi(10), checkout: zi(12), adults: 2, children: 0, ...over,
  };
}

/* Cele doua raspunsuri care inseamna „nu s-a scris nimic". */
const NESALVAT = [
  [null, "conflict de concurenta, nimic scris"],
  [false, "eroare obisnuita de baza"],
];

const actiuniInJurnal = () => audit.push.mock.calls.map(([actiune]) => actiune);

/* Apelurile catre yala si televizor pleaca fara `await` din doCheckIn; un tur
   de bucla le lasa sa se intample inainte sa spunem ca n-au avut loc. */
const lasaSaTreaca = () => new Promise((gata) => setTimeout(gata, 0));

let updateHousekeeping;
beforeEach(() => {
  vi.clearAllMocks();
  updateHousekeeping = vi.fn().mockResolvedValue(true);
  /* `toaster.show` tace cat timp nu e montat ToastHost; aici ii punem noi
     capatul, ca sa vedem ce i s-ar fi aratat receptiei. */
  toaster.push = vi.fn();
  // 9 septembrie: sosirea de pe 10 e in fereastra de check-in devreme.
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));
});
afterEach(() => {
  toaster.push = null;
  vi.useRealTimers();
});

describe("doCheckIn — check-in nesalvat", () => {
  it.each(NESALVAT)("updateReservations → %s (%s): se opreste, fara jurnal, toast, cod de acces sau mesaj TV", async (raspuns) => {
    const updateReservations = vi.fn().mockResolvedValue(raspuns);
    const res = rezervare();

    const r = await doCheckIn(res, [res], updateReservations, CORE);
    await lasaSaTreaca();

    expect(r).toBe(false);
    expect(updateReservations).toHaveBeenCalledTimes(1);
    expect(actiuniInJurnal()).not.toContain("Check-in");
    expect(cheamaAcces).not.toHaveBeenCalled();
    expect(cheamaTv).not.toHaveBeenCalled();
    /* Niciun toast de aici: nici cel verde, nici unul nou de eroare — omul a
       fost deja anuntat de `updateReservations` (raportul de eroare, respectiv
       toastul de conflict). */
    expect(toaster.push).not.toHaveBeenCalled();
  });

  it("control — updateReservations → true: jurnal, toast verde, cod de acces, mesaj TV", async () => {
    const updateReservations = vi.fn().mockResolvedValue(true);
    const res = rezervare();

    const r = await doCheckIn(res, [res], updateReservations, CORE);
    await lasaSaTreaca();

    expect(r).toBe(true);
    expect(audit.push).toHaveBeenCalledWith("Check-in", "1001 · Popescu Ana", { roomId: "r1001", reservationId: "r-1" });
    expect(cheamaAcces).toHaveBeenCalledWith("issue", { reservationId: "r-1" });
    expect(cheamaTv).toHaveBeenCalledWith("welcome", { reservationId: "r-1" });
    expect(toaster.push).toHaveBeenCalledWith(expect.objectContaining({ message: "Check-in făcut · 1001", tone: "ok" }));
  });
});

describe("doCheckOut — check-out nesalvat", () => {
  it.each(NESALVAT)("updateReservations → %s (%s): camera nu trece pe „murdara”, codul ramane, fara jurnal sau toast", async (raspuns) => {
    const updateReservations = vi.fn().mockResolvedValue(raspuns);
    const res = rezervare({ status: "checkedin" });

    const r = await doCheckOut(res, [res], updateReservations, CORE, {}, updateHousekeeping);
    await lasaSaTreaca();

    expect(r).toBe(false);
    expect(updateReservations).toHaveBeenCalledTimes(1);
    expect(updateHousekeeping).not.toHaveBeenCalled();
    expect(actiuniInJurnal()).not.toContain("Check-out");
    expect(cheamaAcces).not.toHaveBeenCalled();
    expect(cheamaTv).not.toHaveBeenCalled();
    expect(toaster.push).not.toHaveBeenCalled();
  });

  it("control — updateReservations → true: camera pe „murdara”, jurnal, cod sters, televizor golit", async () => {
    const updateReservations = vi.fn().mockResolvedValue(true);
    const res = rezervare({ status: "checkedin" });

    const r = await doCheckOut(res, [res], updateReservations, CORE, {}, updateHousekeeping);

    expect(r).toBe(true);
    expect(updateHousekeeping).toHaveBeenCalledWith("r1001", "dirty");
    expect(audit.push).toHaveBeenCalledWith("Check-out", "1001 · camera trecută pe „murdară”", { roomId: "r1001", reservationId: "r-1" });
    expect(cheamaAcces).toHaveBeenCalledWith("revoke", { reservationId: "r-1" });
    expect(cheamaTv).toHaveBeenCalledWith("clear", { reservationId: "r-1" });
    expect(toaster.push).toHaveBeenCalledWith(expect.objectContaining({ tone: "ok" }));
  });
});
