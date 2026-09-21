/* Poarta „Închide ziua", randată cu componenta reală.
 *
 * Ce apără: cât timp o rezolvare e în lucru, NICIUN buton din poartă n-are
 * voie să arate viu. Lacătul (`busyId`) e unul singur pe tot ecranul —
 * garda din onClick iese din orice rând, nu doar din cel ocupat — iar până
 * pe 22 septembrie 2026 `disabled` era pus doar pe rândul ocupat. Recepția
 * apăsa pe camera următoare și nu se întâmpla absolut nimic: fără rotiță,
 * fără mesaj, buton perfect normal la vedere.
 *
 * Nu e o fereastră teoretică: un check-out așteaptă pe rând salvarea,
 * statusul camerei, jurnalul, revocarea codului de pe yală și ștergerea
 * mesajului de pe televizor. În noaptea de 21 spre 22 septembrie 2026 au
 * trecut două camere din șase, iar restul au fost rezolvate de mână din
 * „Editează" (se vede în jurnal: două „Check-out", apoi patru „Rezervare
 * modificată").
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn().mockResolvedValue({ ok: true }),
}));

const { NightAuditGate } = await import("./features/rezervari.jsx");

const CORE = {
  rooms: [
    { id: "r1007", name: "1007", type: "tiny", capacity: 4 },
    { id: "r1008", name: "1008", type: "tiny", capacity: 4 },
  ],
  guests: [], rates: { base: {}, seasons: [] }, onlinePricing: [], tags: [],
};

const rez = (id, roomId) => ({
  id, roomId, status: "checkedin", groupId: null,
  checkin: "2026-09-20T14:00:00Z", checkout: "2026-09-21T08:00:00Z",
  adults: 2, children: 0, tags: [], messages: [],
});

const A = rez("a", "r1007");
const B = rez("b", "r1008");

const montate = [];

async function randeaza(extra = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(NightAuditGate, {
      restante: [A, B], sosiri: [],
      core: CORE, updateCore: vi.fn(),
      groups: [], updateGroups: vi.fn(),
      blocks: [], updateBlocks: vi.fn(),
      reservations: [A, B],
      updateReservations: vi.fn().mockResolvedValue(true),
      stergeRezervari: vi.fn(), stergeGrupuri: vi.fn(),
      adaugaOaspetiInCache: vi.fn(), salveazaOaspete: vi.fn(),
      housekeeping: {}, updateHousekeeping: vi.fn().mockResolvedValue(true),
      onLogout: vi.fn(),
      ...extra,
    }));
  });
  return host;
}

const butoane = (host, text) =>
  [...host.querySelectorAll("button")].filter((b) => b.textContent.includes(text));

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("NightAuditGate — lacătul de pe butoane", () => {
  it("arată un buton de Check-out pentru fiecare restanță", async () => {
    const host = await randeaza();
    expect(butoane(host, "Check-out")).toHaveLength(2);
  });

  it("cât timp o cameră e în lucru, butonul CELEILALTE e dezactivat", async () => {
    /* Salvarea rămâne agățată intenționat: exact starea în care recepția
       apasă pe camera următoare. */
    let elibereaza;
    const updateReservations = vi.fn(() => new Promise((rez) => { elibereaza = rez; }));
    const host = await randeaza({ updateReservations });

    const [primul, aldoilea] = butoane(host, "Check-out");
    await act(async () => { primul.click(); });

    expect(updateReservations).toHaveBeenCalledTimes(1);
    expect(aldoilea.disabled, "butonul celeilalte camere a rămas activ").toBe(true);
    /* Rândul în lucru își spune starea; celelalte doar nu se lasă apăsate. */
    expect(primul.textContent).toContain("…");

    await act(async () => { elibereaza(true); });
  });

  it("si butonul Editeaza e dezactivat in timpul unei salvari", async () => {
    let elibereaza;
    const updateReservations = vi.fn(() => new Promise((rez) => { elibereaza = rez; }));
    const host = await randeaza({ updateReservations });

    await act(async () => { butoane(host, "Check-out")[0].click(); });
    for (const b of butoane(host, "Editează")) expect(b.disabled).toBe(true);

    await act(async () => { elibereaza(true); });
  });

  it("după ce salvarea se termină, butoanele redevin active", async () => {
    let elibereaza;
    const updateReservations = vi.fn(() => new Promise((rez) => { elibereaza = rez; }));
    const host = await randeaza({ updateReservations });

    await act(async () => { butoane(host, "Check-out")[0].click(); });
    await act(async () => { elibereaza(true); });

    for (const b of butoane(host, "Check-out")) expect(b.disabled).toBe(false);
  });

  /* Serializarea rămâne: două salvări pornite deodată ar pleca amândouă de
     la același instantaneu al listei și s-ar suprascrie. */
  it("un clic pe al doilea buton în timpul primei salvări nu pornește o a doua", async () => {
    let elibereaza;
    const updateReservations = vi.fn(() => new Promise((rez) => { elibereaza = rez; }));
    const host = await randeaza({ updateReservations });

    const [primul, aldoilea] = butoane(host, "Check-out");
    await act(async () => { primul.click(); });
    await act(async () => { aldoilea.click(); });

    expect(updateReservations).toHaveBeenCalledTimes(1);
    await act(async () => { elibereaza(true); });
  });
});
