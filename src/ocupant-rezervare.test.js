/* Campul „Ocupant" din fereastra de rezervare.
 *
 * Motivul punctual: telefonul ocupantului decide unde pleaca codul de acces pe
 * WhatsApp (vezi destinatarWhatsapp din lib/acces.js), dar pana pe 10
 * septembrie 2026 se putea scrie DOAR din Grupuri → editeaza grupul. Pentru o
 * rezervare obisnuita nu exista nicio cale.
 *
 * Ce apara testele de aici, in ordinea in care s-ar strica:
 *  - campul chiar salveaza cele trei valori (altfel butonul pare ca merge);
 *  - stergerea unui ocupant are efect — `saveInner` face spread peste
 *    `editing`, deci o valoare veche ar fi supravietuit unei stergeri;
 *  - `occupantName`, campul COMPUS citit de calendar si liste, ramane in
 *    sincron; fara el, numele vechi ar continua sa apara dupa salvare.
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
  rooms: [{ id: "r1002", name: "1002", type: "tiny", capacity: 4 }],
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ana", phone: "0740111222" }],
  rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  onlinePricing: [],
  tags: [],
};

const REZ = {
  id: "r-1", roomId: "r1002", guestId: "g1", groupId: null, status: "confirmed",
  checkin: "2026-09-12T11:00:00Z", checkout: "2026-09-14T08:00:00Z",
  adults: 2, children: 0, source: "direct", tags: [], messages: [],
  occupantLastName: "", occupantFirstName: "", occupantPhone: "", occupantName: "",
};

const montate = [];
let updateReservations;

async function deschide(editing = REZ) {
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
      onClose: () => {},
    }));
  });
  return host;
}

/* Campurile n-au `name`, deci se cauta dupa eticheta accesibila — aceeasi pe
   care o citeste si un cititor de ecran. */
const camp = (host, eticheta) =>
  host.querySelector(`input[aria-label="${eticheta}"]`);

async function scrie(input, valoare) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, valoare);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const salveaza = async (host) => {
  const buton = [...host.querySelectorAll("button")]
    .find((b) => /^(Salvează|Creează)/.test(b.textContent.trim()));
  await act(async () => { buton.click(); });
};

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  updateReservations = vi.fn().mockResolvedValue(true);
});

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("ReservationModal — campul Ocupant", () => {
  it("arata cele trei casete langa client", async () => {
    const host = await deschide();
    expect(camp(host, "Numele ocupantului")).toBeTruthy();
    expect(camp(host, "Prenumele ocupantului")).toBeTruthy();
    expect(camp(host, "Telefonul ocupantului")).toBeTruthy();
  });

  it("salveaza numele si telefonul ocupantului", async () => {
    const host = await deschide();
    await scrie(camp(host, "Numele ocupantului"), "Patap");
    await scrie(camp(host, "Prenumele ocupantului"), "Simion");
    await scrie(camp(host, "Telefonul ocupantului"), "0722333444");
    await salveaza(host);

    expect(updateReservations).toHaveBeenCalledTimes(1);
    const salvata = updateReservations.mock.calls[0][0].find((r) => r.id === "r-1");
    expect(salvata.occupantLastName).toBe("Patap");
    expect(salvata.occupantFirstName).toBe("Simion");
    expect(salvata.occupantPhone).toBe("0722333444");
  });

  /* Campul COMPUS, citit de calendar si de liste prin lib/nume.js. Daca nu se
     recalculeaza la salvare, numele vechi ramane pe ecran pana la reincarcare. */
  it("tine `occupantName` in sincron cu cele doua jumatati", async () => {
    const host = await deschide();
    await scrie(camp(host, "Numele ocupantului"), "Patap");
    await scrie(camp(host, "Prenumele ocupantului"), "Simion");
    await salveaza(host);

    const salvata = updateReservations.mock.calls[0][0].find((r) => r.id === "r-1");
    expect(salvata.occupantName).toBe("Patap Simion");
  });

  /* `saveInner` face spread peste `editing` ca sa nu piarda campuri pe care
     formularul nu le arata. De cand le arata pe astea trei, ele trebuie scrise
     DUPA spread — altfel o stergere n-ar avea niciun efect. */
  it("stergerea ocupantului chiar il sterge", async () => {
    const host = await deschide({
      ...REZ,
      occupantLastName: "Patap", occupantFirstName: "Simion",
      occupantPhone: "0722333444", occupantName: "Patap Simion",
    });
    await scrie(camp(host, "Numele ocupantului"), "");
    await scrie(camp(host, "Prenumele ocupantului"), "");
    await scrie(camp(host, "Telefonul ocupantului"), "");
    await salveaza(host);

    const salvata = updateReservations.mock.calls[0][0].find((r) => r.id === "r-1");
    expect(salvata.occupantLastName).toBe("");
    expect(salvata.occupantPhone).toBe("");
    expect(salvata.occupantName).toBe("");
  });

  it("porneste cu valorile rezervarii, nu goale", async () => {
    const host = await deschide({
      ...REZ,
      occupantLastName: "Patap", occupantFirstName: "Simion",
      occupantPhone: "0722333444", occupantName: "Patap Simion",
    });
    expect(camp(host, "Numele ocupantului").value).toBe("Patap");
    expect(camp(host, "Telefonul ocupantului").value).toBe("0722333444");
  });
});
