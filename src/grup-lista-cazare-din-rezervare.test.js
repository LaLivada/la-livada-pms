/* „Listă cazare" din fereastra de EDITARE a unei rezervări dintr-un grup.
 *
 * Bug raportat 20 septembrie 2026: „Cand dau click pe lista cazare din grup
 * pe desktop nu merge" — pe drumul Editează rezervarea → „Face parte din
 * grupul…" → „Listă cazare". Nu se deschidea nimic, fără nicio eroare.
 *
 * Cauza: din cele trei locuri care deschid GroupEditor, doar două îi dădeau
 * `onPrint` (GroupsView și „Vezi rezervarea"). `fisa-rezervare.jsx` îl
 * monta fără, iar butonul din subsolul editorului e `onClick={onPrint}` —
 * cu prop-ul lipsă, `onClick` devine `undefined` și clicul nu face nimic.
 *
 * Testul merge pe drumul omului: deschide fereastra rezervării, apasă
 * bannerul grupului, apoi „Listă cazare", și cere să apară lista.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("./lib/pdf.js", () => ({
  generatePdfBlob: vi.fn(), pregatesteFila: vi.fn(() => null),
  arataInFila: vi.fn(() => false), inchideFila: vi.fn(),
}));

const { ReservationModal } = await import("./features/rezervari.jsx");
const { audit } = await import("./lib/audit.js");

const CORE = {
  rooms: [{ id: "r1001", name: "1001", type: "tiny", capacity: 4 }],
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ion", phone: "0740111222" }],
  rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  onlinePricing: [], tags: [], billingCustomers: [],
};
const GRUP = { id: "grp1", name: "Nunta Grand'Or", mainGuestId: "g1", createdAt: "2026-09-10T10:00:00Z" };
const REZ = {
  id: "r-1", roomId: "r1001", guestId: "g1", groupId: "grp1", status: "confirmed",
  checkin: "2026-09-20T11:00:00Z", checkout: "2026-09-21T08:00:00Z",
  adults: 2, children: 0, source: "direct", tags: [], messages: [],
  occupantLastName: "", occupantFirstName: "", occupantPhone: "", occupantName: "",
  bookedPrice: 350, updatedAt: "2026-09-10T10:00:00Z",
};

const montate = [];
const noop = async () => true;

async function deschide() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(ReservationModal, {
      data: { reservation: REZ }, core: CORE, updateCore: noop,
      reservations: [REZ], updateReservations: noop,
      groups: [GRUP], updateGroups: noop,
      blocks: [], updateBlocks: noop,
      stergeRezervari: noop, stergeGrupuri: noop,
      onClose: () => {},
    }));
  });
  return host;
}

const titluri = () => [...document.querySelectorAll("h3")].map((h) => h.textContent);

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
  document.body.innerHTML = "";
});

describe("Editare rezervare → grup → Listă cazare", () => {
  it("deschide lista de cazare a grupului", async () => {
    const host = await deschide();

    const banner = host.querySelector(".group-banner-link");
    expect(banner, "bannerul grupului lipsește").toBeTruthy();
    await act(async () => { banner.click(); });

    const listaCazare = [...document.querySelectorAll(".grupuri-editor-footer button")]
      .find((b) => b.textContent.includes("Listă cazare"));
    expect(listaCazare, "butonul Listă cazare lipsește").toBeTruthy();
    await act(async () => { listaCazare.click(); });

    expect(titluri()).toContain("Listă cazare grup");
  });
});
