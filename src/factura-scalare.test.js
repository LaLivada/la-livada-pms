/* Coala facturii se scalează ca să încapă în fereastră.
 *
 * Bugul, raportat de două ori: pe telefon previzualizarea „apărea mare", nu
 * se putea derula și nu se putea edita. Coala e fixată la 794px (A4 la
 * 96dpi) și se micșorează cu `transform: scale(...)` cât să intre în modal.
 * Când măsurătoarea nu se aplică, scara rămâne 1 și coala de 794px stă
 * întreagă într-un modal de 343px, tăiată de `overflow:hidden`, fără nicio
 * bară de derulare — deci și inputurile de editare rămân în afara ecranului.
 *
 * Cauza n-a fost o cursă, ci ordinea din `load()`: factura și liniile se
 * scriu ÎNAINTE de `await setariOblio()`, adică pe când fereastra e încă pe
 * „Se încarcă…" și coala nu există în pagină. Efectul care măsura depindea
 * de `[invoice, lines]`, deci rula fix atunci — degeaba, fără noduri — iar
 * când `loading` trecea pe false dependențele erau deja neschimbate și nu
 * mai rula niciodată. Testul reproduce exact ordinea asta: detaliile vin
 * imediat, setările Oblio un tick mai târziu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}), user: { id: "u1", name: "Test" } } }));
vi.mock("./lib/pdf.js", () => ({
  generatePdfBlob: vi.fn(), pregatesteFila: vi.fn(), arataInFila: vi.fn(), inchideFila: vi.fn(),
}));

const FACTURA = {
  id: "inv1", folio_id: "f1", billing_customer_id: "bc1", status: "draft",
  series: null, number: null, issue_date: null,
  service_date_start: "2026-09-10", service_date_end: "2026-09-13",
  subtotal_net: 963.3, subtotal_vat: 86.7, total_amount: 1050,
  oblio_stare: null, oblio_eroare: null, created_at: "2026-09-17T00:00:00Z",
};
const LINII = [{
  id: "l1", invoice_id: "inv1", name: "Cazare · camera 1001", quantity: 3, unit_price: 350,
  vat_rate: 9, net_amount: 963.3, vat_amount: 86.7, total_amount: 1050, sort_order: 0,
}];

vi.mock("./data/facturare.js", () => ({
  listeazaFacturi: vi.fn(async () => []), facturiAleClientului: vi.fn(async () => []),
  facturilePentruFolio: vi.fn(async () => []),
  detaliiFactura: vi.fn(async () => ({ factura: FACTURA, linii: LINII, plati: [], client: null })),
  salveazaLinieFactura: vi.fn(), actualizeazaTotaluri: vi.fn(), schimbaClientFactura: vi.fn(),
  creeazaClientFacturare: vi.fn(), creeazaFacturaDinFolio: vi.fn(),
  serieActiva: vi.fn(async () => null), emiteFactura: vi.fn(),
  anuleazaFactura: vi.fn(), storneazaFactura: vi.fn(),
}));
vi.mock("./data/oblio.js", () => ({
  CHEIE_OBLIO: "pms:oblio:v1", SETARI_OBLIO_GOALE: Object.freeze({ activ: false }),
  /* Miezul testului: setările vin DUPĂ factură, deci `loading` cade pe false
     într-o altă rundă de randare decât cea în care s-au schimbat factura și
     liniile. */
  setariOblio: vi.fn(() => new Promise((gata) => setTimeout(() => gata({ activ: false }), 0))),
  setariOblioStrict: vi.fn(async () => ({ activ: false })),
  salveazaSetariOblio: vi.fn(), oblioActiv: () => false, cheamaOblio: vi.fn(),
}));
vi.mock("./data/plati.js", () => ({
  serieChitante: vi.fn(async () => null), schimbaSerieChitante: vi.fn(),
  inregistreazaPlata: vi.fn(), listeazaPlatiCuFacturi: vi.fn(async () => []),
}));

const { billingPerms } = await import("./lib/permisiuni.js");
const { InvoicePrint } = await import("./features/facturare.jsx");

const LATIME_MODAL = 343; // cât rămâne dintr-un ecran de 375px după marginile modalului
const INALTIME_COALA = 1123;

const CORE = {
  invoiceIssuer: { name: "SC La Livada SRL", cui: "RO1", regCom: "J37/1/2014", address: "DN24", city: "Vaslui" },
  billingCustomers: [], vatRates: [], products: [], paymentMethods: [],
};

let descriptori = [];
const stub = (nume, valoare) => {
  descriptori.push([nume, Object.getOwnPropertyDescriptor(HTMLElement.prototype, nume)]);
  Object.defineProperty(HTMLElement.prototype, nume, { configurable: true, get: () => valoare });
};

beforeEach(() => {
  billingPerms.role = "admin";
  /* jsdom n-are nici layout, nici ResizeObserver: punem la dispoziție exact
     măsurătorile de care are nevoie efectul. Observatorul e o coajă goală
     dinadins — dacă testul trece, înseamnă că prima măsurătoare, cea
     sincronă, chiar se aplică. */
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  stub("clientWidth", LATIME_MODAL);
  stub("offsetHeight", INALTIME_COALA);
});

afterEach(() => {
  for (const [nume, d] of descriptori) {
    if (d) Object.defineProperty(HTMLElement.prototype, nume, d);
    else delete HTMLElement.prototype[nume];
  }
  descriptori = [];
  billingPerms.role = null;
  document.body.innerHTML = "";
});

describe("previzualizarea facturii", () => {
  it("micșorează coala cât să încapă în fereastră, nu o lasă la 794px", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(InvoicePrint, { invoiceId: "inv1", core: CORE, onClose: () => {} }));
    });
    /* Lăsăm setările Oblio să vină, ca în aplicație. */
    await act(async () => { await new Promise((gata) => setTimeout(gata, 5)); });

    const scaler = document.querySelector(".inv-scaler");
    expect(scaler, "coala nu s-a randat deloc").toBeTruthy();
    const asteptat = LATIME_MODAL / 794;
    expect(scaler.style.transform).toBe(`scale(${asteptat})`);

    /* Și înălțimea ramei urmează scara, altfel sub coală ar rămâne un gol
       de două treimi de pagină. */
    const rama = document.querySelector(".inv-sheet-wrap");
    expect(Math.round(parseFloat(rama.style.height))).toBe(Math.round(INALTIME_COALA * asteptat));

    await act(async () => { root.unmount(); });
  });
});
