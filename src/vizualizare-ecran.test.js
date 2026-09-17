/* „Vezi rezervarea": alegerea clientului de facturare se SCRIE.
 *
 * Al doilea test de randare din repo, din același motiv ca `fise-ecran`:
 * ecranele de după autentificare nu le pot deschide, iar aici fereastra n-are
 * buton de salvare — tot ce se apasă în ea se scrie pe loc. Clientul de
 * facturare nu se scria: îl alegeai, fereastra de confirmare se închidea, și
 * alegerea se pierdea la închidere. Se vedea doar punând mâna pe aplicație.
 *
 * Testul merge pe drumul omului: caută clientul, îl alege din rezultate,
 * confirmă în pop-up și cere ca rezervarea salvată să-l poarte.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* Nimic din test n-are voie sa atinga reteaua; `../supabase.js` ar cere si
   cheile din .env la import. */
vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}), user: { name: "Test" } } }));
/* Fiecare modul de date e inlocuit cu TOATE exporturile lui. Un export uitat
   nu cade zgomotos: arunca intr-un efect, randarea ramane pe jumatate, iar
   testul pica aiurea — si doar cand ruleaza impreuna cu restul suitei.
   Listele sunt citite din `src/data/*.js`, nu ghicite. */
vi.mock("./data/acces.js", () => ({
  codActiv: vi.fn(async () => null), existaCodActiv: vi.fn(async () => false),
  trimiteriPentruCod: vi.fn(async () => []), codActivCuTrimiteri: vi.fn(async () => null),
}));
vi.mock("./data/fise.js", () => ({
  fisaActiva: vi.fn(async () => null), fisePentruRezervare: vi.fn(async () => []),
  rezervariCuFisa: vi.fn(async () => []), toateFisele: vi.fn(async () => []),
  fisaIntreaga: vi.fn(async () => null), areFisaActiva: vi.fn(async () => false),
  scrieFisa: vi.fn(), anuleaza: vi.fn(),
}));
vi.mock("./data/folio.js", () => ({
  folioPentruRezervare: vi.fn(async () => ({ id: "f1", reservation_id: "res1" })),
  pozitiiFolio: vi.fn(async () => []),
  salveazaLinieCazare: vi.fn(async (rand) => rand), adaugaPozitie: vi.fn(), stergePozitie: vi.fn(),
}));
vi.mock("./data/facturare.js", () => ({
  listeazaFacturi: vi.fn(async () => []), facturiAleClientului: vi.fn(async () => []),
  facturilePentruFolio: vi.fn(async () => []),
  detaliiFactura: vi.fn(async () => null), salveazaLinieFactura: vi.fn(),
  actualizeazaTotaluri: vi.fn(), schimbaClientFactura: vi.fn(),
  creeazaClientFacturare: vi.fn(), creeazaFacturaDinFolio: vi.fn(),
  serieActiva: vi.fn(async () => null), emiteFactura: vi.fn(),
  anuleazaFactura: vi.fn(), storneazaFactura: vi.fn(),
}));
vi.mock("./data/oaspeti.js", () => ({
  OASPETI_PE_PAGINA: 50, LIMITA_CAUTARE: 20, LIMITA_CAUTARE_LISTA: 50, MIN_LITERE_CAUTARE: 2,
  cautaOaspeti: vi.fn(async () => []), oaspetiPagina: vi.fn(async () => []),
  numarOaspeti: vi.fn(async () => 0), sumarOaspeti: vi.fn(async () => null),
  istoricOaspete: vi.fn(async () => []), legaturiOaspete: vi.fn(async () => []),
  salveazaOaspete: vi.fn(), oaspetiDupaId: vi.fn(async () => []),
}));
vi.mock("./data/stare-partajata.js", () => ({
  K: {}, loadShared: vi.fn(async () => null), saveShared: vi.fn(),
}));

const { ReservationViewModal } = await import("./features/rezervari/vizualizare.jsx");

const CAMERA = { id: "r1", name: "1001", type: "Tiny house", sortOrder: 1 };
const OASPETE = { id: "g1", lastName: "Popescu", firstName: "Ion" };
const CLIENT = {
  id: "bc1", kind: "company", companyName: "Firma Test SRL", cui: "RO123",
  address: "Str. Test 1", city: "Vaslui", county: "Vaslui", country: "România",
};
const REZERVARE = {
  id: "res1", roomId: "r1", guestId: "g1", groupId: null, status: "checkedin",
  checkin: "2026-09-16T14:00:00.000Z", checkout: "2026-09-18T09:30:00.000Z",
  adults: 2, children: 0, source: "direct", tags: [], messages: [],
  billingCustomerId: null, bookedPrice: 300,
};
const CORE = {
  guests: [OASPETE], rooms: [CAMERA], billingCustomers: [CLIENT],
  products: [], rates: [], seasons: [], vatRates: [], paymentMethods: [],
};

let container, root, updateReservations;

async function randeaza() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ReservationViewModal, {
      reservation: REZERVARE, core: CORE, updateCore: vi.fn(async () => {}),
      groups: [], updateGroups: vi.fn(), reservations: [REZERVARE], updateReservations,
      stergeRezervari: vi.fn(), stergeGrupuri: vi.fn(), blocks: [],
      onClose: vi.fn(), onEdit: vi.fn(), noutati: {},
    }));
  });
}

const dupaText = (sel, text) =>
  [...container.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text));

beforeEach(() => { updateReservations = vi.fn(async () => {}); });

describe("Vezi rezervarea", () => {
  it("se randeaza fara sa arunce", async () => {
    await randeaza();
    expect(container.textContent).toContain("Popescu");
    root.unmount(); container.remove();
  });

  it("scrie clientul de facturare pe rezervare, nu doar in starea ferestrei", async () => {
    await randeaza();

    const cautare = [...container.querySelectorAll("input")]
      .find((i) => /caut/i.test(i.placeholder || ""));
    expect(cautare, "campul de cautare a clientului de facturare").toBeTruthy();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(cautare, "Firma");
      cautare.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const rezultat = dupaText("button", "Firma Test SRL");
    expect(rezultat, "rezultatul cautarii").toBeTruthy();
    await act(async () => { rezultat.click(); });

    const confirma = dupaText("button", "Da, facturează pe acest client");
    expect(confirma, "butonul de confirmare").toBeTruthy();
    await act(async () => { confirma.click(); });

    expect(updateReservations).toHaveBeenCalledTimes(1);
    const scrise = updateReservations.mock.calls[0][0];
    expect(scrise.find((r) => r.id === "res1").billingCustomerId).toBe("bc1");

    root.unmount(); container.remove();
  });
});
