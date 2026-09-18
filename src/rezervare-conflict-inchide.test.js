/* Fereastra de rezervare, dupa o scriere respinsa ca modificare concurenta.
 *
 * Bug raportat 18 septembrie 2026: "nu se salveaza modificarile de ora" la
 * o rezervare cu check-in deja facut. Cauza: `editing` (data.reservation)
 * e un instantaneu inghetat de la deschiderea ferestrei — nu se
 * reimprospateaza cat timp fereastra ramane deschisa. Daca intre timp
 * altcineva a scris pe acelasi rand (chiar un check-in facut chiar inainte
 * de a deschide "Orele cazarii"), baza refuza scrierea ca fiind bazata pe o
 * stampila veche (`stamp_reservation_updated_at`, schema.sql), iar mesajul
 * de eroare cere sa se reia modificarea — ceva imposibil de facut in ACEEASI
 * fereastra, fiindca `editing` ramane la fel de vechi la orice reincercare.
 *
 * Fixul: `updateReservations` intoarce `null` (nu `false`) exact in cazul
 * asta — cand nimic nu s-a scris din cauza conflictului de concurenta —
 * iar `saveInner` inchide fereastra doar la `null`, ca urmatoarea deschidere
 * sa porneasca de la datele proaspete. La o eroare obisnuita (`false`),
 * fereastra ramane deschisa, cu datele in ea, exact ca inainte.
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

/* O rezervare cu check-in deja facut — exact clasa din raport: statusul
   `checkedin` inseamna ca alte scrieri (check-in-ul insusi, generarea
   codului) tocmai au atins acelasi rand. */
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

async function deschide(editing = REZ_CHECKEDIN) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(ReservationModal, {
      data: { reservation: editing }, core: CORE, updateCore: async () => true,
      reservations: [editing], updateReservations,
      groups: [], updateGroups: async () => true,
      blocks: [], updateBlocks: async () => true,
      onClose,
    }));
  });
  return host;
}

const salveaza = async (host) => {
  const buton = [...host.querySelectorAll("button")]
    .find((b) => /^(Salvează|Creează)/.test(b.textContent.trim()));
  await act(async () => { buton.click(); });
};

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  onClose = vi.fn();
});

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("ReservationModal — scriere respinsa dupa deschidere", () => {
  it("inchide fereastra cand refuzul e din cauza conflictului (updateReservations -> null)", async () => {
    updateReservations = vi.fn().mockResolvedValue(null);
    const host = await deschide();
    await salveaza(host);

    expect(updateReservations).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lasa fereastra deschisa la o eroare obisnuita (updateReservations -> false)", async () => {
    updateReservations = vi.fn().mockResolvedValue(false);
    const host = await deschide();
    await salveaza(host);

    expect(updateReservations).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cheama onClose si merge mai departe (toast, reconciliere) la succes (-> true)", async () => {
    updateReservations = vi.fn().mockResolvedValue(true);
    const host = await deschide();
    await salveaza(host);

    expect(updateReservations).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
