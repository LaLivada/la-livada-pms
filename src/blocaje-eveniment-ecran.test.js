/* Blocajele zilelor cu evenimente, in calendarul de rezervari (cerute pe 16
 * septembrie 2026). Ce s-ar strica tacut: blocajul unei nunti ar arata ca o
 * reparatie, iar receptia n-ar sti ca scotandu-l redeschide ziua la
 * rezervarile online. De aceea se verifica aici si clasa barei, si eticheta
 * din dialog, si legenda.
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
  guests: [],
};
/* Doua blocaje in aceeasi zi: unul de nunta, unul de reparatie. */
const BLOCAJE = [
  { id: "bl-ev-1", roomId: "t1", start: laOra(1, 14), end: laOra(2, 11), reason: "Evenimente", sursa: "eveniment" },
  { id: "bl-2", roomId: "t2", start: laOra(1, 14), end: laOra(2, 11), reason: "Reparatie instalatie", sursa: "" },
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
      core: CORE, updateCore: fn(), reservations: [], updateReservations: fn(),
      groups: [], updateGroups: fn(), housekeeping: [], updateHousekeeping: fn(),
      blocks: BLOCAJE, updateBlocks: fn(), stergeRezervari: fn(), stergeGrupuri: fn(), stergeBlocaje: fn(),
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

const bara = (host, text) => [...host.querySelectorAll(".cal-bar.block-bar")]
  .find((b) => b.textContent.includes(text));

describe("calendar: blocajele zilelor cu evenimente", () => {
  it("blocajul de eveniment are clasa lui, cel de mentenanta nu", async () => {
    const host = await deschide();
    const nunta = bara(host, "Evenimente");
    const reparatie = bara(host, "Reparatie instalatie");
    expect(nunta).not.toBeNull();
    expect(reparatie).not.toBeNull();
    expect(nunta.classList.contains("event-bar")).toBe(true);
    expect(reparatie.classList.contains("event-bar")).toBe(false);
    expect(nunta.getAttribute("title")).toBe("Rezervare evenimente: Evenimente");
    expect(reparatie.getAttribute("title")).toBe("Blocaj: Reparatie instalatie");
  });

  it("legenda are si „Rezervare evenimente”, pe langa „Blocaj”", async () => {
    const host = await deschide();
    const etichete = [...host.querySelectorAll(".cal-legend .legend-item")].map((x) => x.textContent);
    expect(etichete).toContain("Blocaj");
    expect(etichete).toContain("Rezervare evenimente");
    const chip = [...host.querySelectorAll(".cal-legend .legend-chip")]
      .find((c) => c.classList.contains("event-bar"));
    expect(chip).not.toBeNull();
  });

  it("dialogul spune ce fel de blocaj e si ce se intampla daca-l scoti", async () => {
    const host = await deschide();
    await act(async () => {
      bara(host, "Evenimente").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    let dialog = document.querySelector(".action-modal");
    expect(dialog.querySelector(".role-tag").textContent).toBe("Rezervare evenimente");
    expect(dialog.querySelector(".ai-d").textContent).toContain("inclusiv la rezervările online");

    /* Iar blocajul obisnuit ramane cum era. */
    await act(async () => { dialog.querySelector(".btn-ghost").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => {
      bara(host, "Reparatie instalatie").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    dialog = document.querySelector(".action-modal");
    expect(dialog.querySelector(".role-tag").textContent).toBe("Blocaj");
    expect(dialog.querySelector(".ai-d").textContent).toBe("Camera redevine disponibilă");
  });
});
