/* "Salvează orele" (popup-ul mic din Orele cazării) trebuie sa chiar
 * salveze, la o rezervare existenta — nu doar sa tina noua ora in
 * formular pana apesi si marele "Salveaza" de jos.
 *
 * Raportat 18 septembrie 2026, dupa fixul pentru fereastra care ramanea
 * blocata la conflict: "Odata ce selectez ora noua si dau salvare, iese
 * din pop-up si nu se salveaza orele noi". Confirmat in jurnalul
 * serverului (Supabase): NICIO scriere pe `reservations` cat timp
 * raportul era valabil — cererea nu pleca deloc din browser. Butonul
 * "Salveaza orele" scria doar starea locala (checkin/checkout) si inchidea
 * popup-ul mic; recepția credea ca a salvat (butonul chiar zice
 * "Salveaza") si trecea mai departe fara sa mai apese si butonul mare.
 *
 * Fix: la o rezervare EXISTENTA, "Salveaza orele" declanseaza acum un
 * salveaza() real (aceeasi cale ca butonul mare — validare, conflict,
 * reconciliere acces, toast), la randarea urmatoare, cand checkin/checkout
 * chiar reflecta ora noua. La creare (fara `editing`) ramane neschimbat:
 * doar starea locala, trimisa abia la "Salveaza"/"Creeaza" de jos.
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

const { ReservationModal } = await import("./features/rezervari.jsx");
const { audit } = await import("./lib/audit.js");

const CORE = {
  rooms: [{ id: "r1001", name: "1001", type: "tiny", capacity: 4 }],
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ana", phone: "0740111222" }],
  rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  onlinePricing: [],
  tags: [],
};

/* 11:00Z = 14:00 ora locala (Europa/Bucuresti, septembrie, EEST = UTC+3) —
   acelasi calcul pe care il face formularul prin toLocalInputValue. */
const REZ_CHECKEDIN = {
  id: "r-1", roomId: "r1001", guestId: "g1", groupId: null, status: "checkedin",
  checkin: "2026-09-18T11:00:00Z", checkout: "2026-09-19T08:00:00Z",
  adults: 2, children: 0, source: "direct", tags: [], messages: [],
  occupantLastName: "", occupantFirstName: "", occupantPhone: "", occupantName: "",
  updatedAt: "2026-09-18T13:00:00Z",
};

const montate = [];
let updateReservations;
let onClose;

async function deschide(editing) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(ReservationModal, {
      data: editing ? { reservation: editing } : { mode: "single", defaultRoomId: "r1001" },
      core: CORE, updateCore: async () => true,
      reservations: editing ? [editing] : [],
      updateReservations,
      groups: [], updateGroups: async () => true,
      blocks: [], updateBlocks: async () => true,
      onClose,
    }));
  });
  return host;
}

const gasesteButon = (host, regex) =>
  [...host.querySelectorAll("button")].find((b) => regex.test(b.textContent.trim()));

async function scrie(input, valoare) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, valoare);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/* Deschide "Orele cazarii", schimba ora de sosire, apasa DOAR "Salveaza
   orele" (butonul din popup-ul mic) — nimic altceva. */
async function schimbaOraSiSalveazaOrele(host, oraNoua) {
  await act(async () => { gasesteButon(host, /^Orele cazării/).click(); });
  const [ora1] = host.querySelectorAll('input[type="time"]');
  await scrie(ora1, oraNoua);
  await act(async () => { gasesteButon(host, /^Salvează orele$/).click(); });
}

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  updateReservations = vi.fn().mockResolvedValue(true);
  onClose = vi.fn();
});

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("Orele cazării — 'Salvează orele' la o rezervare existentă", () => {
  it("salveaza singur, fara sa mai fie nevoie de butonul mare 'Salvează'", async () => {
    const host = await deschide(REZ_CHECKEDIN);
    await schimbaOraSiSalveazaOrele(host, "16:00");

    expect(updateReservations, "n-a chemat updateReservations — cererea tot nu pleaca").toHaveBeenCalledTimes(1);
    const trimis = updateReservations.mock.calls[0][0].find((r) => r.id === "r-1");
    /* 16:00 local (EEST, UTC+3) = 13:00Z */
    expect(trimis.checkin).toBe("2026-09-18T13:00:00.000Z");
    expect(onClose, "fisa ar trebui sa se inchida la fel ca la un Salveaza reusit").toHaveBeenCalled();
  });

  it("pastreaza restul campurilor neschimbate (nu trimite un formular gol)", async () => {
    const host = await deschide({ ...REZ_CHECKEDIN, notes: "Alergic la fistic" });
    await schimbaOraSiSalveazaOrele(host, "16:00");

    const trimis = updateReservations.mock.calls[0][0].find((r) => r.id === "r-1");
    expect(trimis.notes).toBe("Alergic la fistic");
    expect(trimis.guestId).toBe("g1");
    expect(trimis.status).toBe("checkedin");
  });
});

describe("Orele cazării — 'Salvează orele' la o rezervare NOUĂ", () => {
  it("nu trimite nimic la server — formularul intreg pleaca doar la Creeaza", async () => {
    const host = await deschide(null);
    await schimbaOraSiSalveazaOrele(host, "16:00");

    expect(updateReservations, "o rezervare noua nu are ce sa trimita inca (fara client ales)").not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
