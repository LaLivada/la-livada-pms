/* Calendarul randat cu componenta reala: anulatele si no-show-urile se
 * deseneaza (cerut pe 15 septembrie 2026), dar nu tin loc. Ce s-ar strica
 * tacut: o anulata sa dispara iar din calendar, sau sa fie numarata la
 * ocupare — „2 din 2 camere" cu o camera libera.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const { CalendarView } = await import("./features/rezervari/calendar.jsx");

const laOra = (zile, ora) => { const d = new Date(); d.setDate(d.getDate() + zile); d.setHours(ora, 0, 0, 0); return d.toISOString(); };
const CORE = {
  rooms: [{ id: "t1", name: "1001", type: "tiny" }, { id: "t2", name: "1002", type: "tiny" }],
  guests: [{ id: "g1", firstName: "Ana", lastName: "Pop" }, { id: "g2", firstName: "Ion", lastName: "Stan" }],
};
const REZERVARI = [
  { id: "vie", roomId: "t1", guestId: "g1", checkin: laOra(0, 14), checkout: laOra(2, 12), status: "confirmed", source: "direct", tags: [], messages: [] },
  { id: "anulata", roomId: "t2", guestId: "g2", checkin: laOra(0, 14), checkout: laOra(2, 12), status: "cancelled", source: "direct", tags: [], messages: [] },
];

const montate = [];
async function deschide() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  const fn = () => vi.fn();
  await act(async () => {
    root.render(React.createElement(CalendarView, {
      core: CORE, updateCore: fn(), reservations: REZERVARI, updateReservations: fn(),
      groups: [], updateGroups: fn(), housekeeping: [], updateHousekeeping: fn(),
      blocks: [], updateBlocks: fn(), stergeRezervari: fn(), stergeGrupuri: fn(), stergeBlocaje: fn(),
      adaugaOaspetiInCache: fn(), salveazaOaspete: fn(), asiguraPerioada: fn(),
      intent: null, clearIntent: fn(), noutati: null,
    }));
  });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("calendar: anulate si no-show", () => {
  it("anulata se deseneaza, cu clasa ei, sub barele vii; ocuparea zilei o ignora", async () => {
    const host = await deschide();
    const vie = host.querySelector(".cal-bar.st-confirmed");
    const moarta = host.querySelector(".cal-bar.st-cancelled");
    expect(vie).not.toBeNull();
    expect(moarta).not.toBeNull();
    expect(moarta.classList.contains("bar-moarta")).toBe(true);
    expect(vie.classList.contains("bar-moarta")).toBe(false);
    expect(moarta.textContent).toContain("Stan Ion");
    const azi = host.querySelector(".cal-occ");
    expect(azi.querySelector(".occ-num").textContent).toBe("1");
    expect(azi.querySelector(".occ-pct").textContent).toBe("50%");
  });
});
