/* Ce se poate atinge pe un draft de factură: rubrica de delegat și clientul.
 *
 * Amândouă sunt lucruri care se scriu pe loc, fără buton de salvare, așa că
 * greșeala tipică e aceeași ca la clientul de facturare din „Vezi rezervarea":
 * câmpul pare completat, dar nu ajunge nicăieri. Testul merge pe drumul
 * omului — scrie în câmp, iese din el, și cere ca scrierea să fi plecat.
 *
 * Și partea inversă: pe o factură EMISĂ nu mai există niciun câmp. Nu e o
 * chestiune de aspect — baza refuză oricum scrierea (guard_invoice_update),
 * iar un câmp care arată editabil și eșuează la salvare e mai rău decât
 * niciun câmp.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}), user: { id: "u1", name: "Test" } } }));
vi.mock("./lib/pdf.js", () => ({
  generatePdfBlob: vi.fn(), pregatesteFila: vi.fn(() => null), arataInFila: vi.fn(() => false), inchideFila: vi.fn(),
}));

const FACTURA = {
  id: "inv1", folio_id: "f1", billing_customer_id: "bc1", status: "draft",
  series: null, number: null, issue_date: null,
  service_date_start: "2026-09-10", service_date_end: "2026-09-13",
  subtotal_net: 963.3, subtotal_vat: 86.7, total_amount: 1050, paid_amount: 0,
  delegat_nume: null, delegat_ci_serie: null, delegat_ci_numar: null,
  oblio_stare: null, oblio_eroare: null, created_at: "2026-09-17T00:00:00Z",
};
const LINII = [{
  id: "l1", invoice_id: "inv1", name: "Cazare · camera 1001", unit: "noapte", quantity: 3, unit_price: 350,
  vat_rate: 9, net_amount: 963.3, vat_amount: 86.7, total_amount: 1050, sort_order: 0,
}];
const CLIENT = {
  id: "bc1", kind: "company", companyName: "Firma Veche SRL", cui: "RO111", regCom: "J1/1/2020",
  address: "Str. 1", city: "Vaslui", county: "Vaslui", country: "România",
};

/* Starea facturii „din bază": testele o schimbă ca să verifice și cazul emis. */
let facturaCurenta = FACTURA;
const salveazaDelegat = vi.fn(async (_id, d) => ({
  ...facturaCurenta, delegat_nume: d.nume || null, delegat_ci_serie: d.serie || null, delegat_ci_numar: d.numar || null,
}));
const schimbaClientFactura = vi.fn(async (_id, idClient) => ({ ...facturaCurenta, billing_customer_id: idClient }));
const creeazaClientFacturare = vi.fn(async (c) => c);

vi.mock("./data/facturare.js", () => ({
  listeazaFacturi: vi.fn(async () => []), facturiAleClientului: vi.fn(async () => []),
  facturilePentruFolio: vi.fn(async () => []),
  detaliiFactura: vi.fn(async () => ({ factura: facturaCurenta, linii: LINII, plati: [], client: CLIENT })),
  salveazaLinieFactura: vi.fn(), actualizeazaTotaluri: vi.fn(),
  schimbaClientFactura, salveazaDelegat, creeazaClientFacturare,
  creeazaFacturaDinFolio: vi.fn(), serieActiva: vi.fn(async () => null),
  emiteFactura: vi.fn(), anuleazaFactura: vi.fn(), storneazaFactura: vi.fn(),
}));
vi.mock("./data/oblio.js", () => ({
  CHEIE_OBLIO: "pms:oblio:v1", SETARI_OBLIO_GOALE: Object.freeze({ activ: false }),
  setariOblio: vi.fn(async () => ({ activ: false })), setariOblioStrict: vi.fn(async () => ({ activ: false })),
  salveazaSetariOblio: vi.fn(), oblioActiv: () => false, cheamaOblio: vi.fn(),
}));
vi.mock("./data/plati.js", () => ({
  serieChitante: vi.fn(async () => null), schimbaSerieChitante: vi.fn(),
  inregistreazaPlata: vi.fn(), listeazaPlatiCuFacturi: vi.fn(async () => []),
}));

const { billingPerms } = await import("./lib/permisiuni.js");
const { InvoicePrint } = await import("./features/facturare.jsx");

const CORE = {
  invoiceIssuer: { name: "SC La Livada SRL", cui: "RO1", address: "DN24", city: "Vaslui" },
  billingCustomers: [CLIENT], vatRates: [], products: [], paymentMethods: [],
};

let root = null;
let container = null;
const randeaza = async (props = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(InvoicePrint, {
      invoiceId: "inv1", core: CORE, updateCore: vi.fn(async () => {}), onClose: () => {}, ...props,
    }));
  });
  await act(async () => { await new Promise((gata) => setTimeout(gata, 5)); });
};

const scrie = async (el, text) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  /* React ascultă `focusout`, nu `blur` — `blur` nu se propagă, deci
     delegarea lui React nu l-ar vedea niciodată. */
  await act(async () => { el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
};

const buton = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeEach(() => {
  billingPerms.role = "admin";
  facturaCurenta = FACTURA;
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  salveazaDelegat.mockClear();
  schimbaClientFactura.mockClear();
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = null; container = null;
  billingPerms.role = null;
  document.body.innerHTML = "";
});

describe("rubrica de delegat", () => {
  it("se scrie la ieșirea din câmp, nu se pierde", async () => {
    await randeaza();
    const campuri = document.querySelectorAll(".inv-foot-delegat .inv-edit-input");
    expect(campuri.length, "lipsesc câmpurile de delegat").toBe(3);

    await scrie(campuri[0], "  Popescu Ion  ");
    expect(salveazaDelegat).toHaveBeenCalledWith("inv1", { nume: "Popescu Ion", serie: "", numar: "" });
  });

  it("scrie și seria, și numărul actului", async () => {
    await randeaza();
    const campuri = document.querySelectorAll(".inv-foot-delegat .inv-edit-input");
    await scrie(campuri[1], "VS");
    expect(salveazaDelegat).toHaveBeenLastCalledWith("inv1", { nume: "", serie: "VS", numar: "" });
    await scrie(campuri[2], "123456");
    expect(salveazaDelegat).toHaveBeenLastCalledWith("inv1", { nume: "", serie: "VS", numar: "123456" });
  });

  it("nu scrie când nu s-a schimbat nimic", async () => {
    await randeaza();
    const campuri = document.querySelectorAll(".inv-foot-delegat .inv-edit-input");
    await act(async () => { campuri[0].dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(salveazaDelegat).not.toHaveBeenCalled();
  });

  it("pe o factură emisă e text, nu câmpuri", async () => {
    facturaCurenta = {
      ...FACTURA, status: "issued", series: "LL", number: 7, issue_date: "2026-09-17T00:00:00Z",
      delegat_nume: "Popescu Ion", delegat_ci_serie: "VS", delegat_ci_numar: "123456",
    };
    await randeaza();
    const subsol = document.querySelector(".inv-foot-delegat");
    expect(subsol.querySelectorAll("input").length).toBe(0);
    expect(subsol.textContent).toContain("Popescu Ion");
    expect(subsol.textContent).toContain("CI seria VS nr. 123456");
  });
});

describe("schimbarea clientului de pe draft", () => {
  it("deschide o fereastră cu un câmp de căutare", async () => {
    await randeaza();
    await act(async () => { buton("Schimbă clientul").click(); });
    const cautare = document.querySelector(".guest-search input");
    expect(cautare, "fereastra n-are câmp de căutare").toBeTruthy();
    /* Câmpul e deschis din prima: aici omul vine tocmai ca să schimbe
       clientul, n-are de ce să șteargă întâi fișa celui de acum. */
    expect(document.body.textContent).toContain("Clientul de acum: Firma Veche SRL");
  });

  it("clientul găsit se pune pe factură", async () => {
    await randeaza();
    await act(async () => { buton("Schimbă clientul").click(); });
    const cautare = document.querySelector(".guest-search input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(cautare, "Veche");
      cautare.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const rezultat = document.querySelector(".guest-result");
    expect(rezultat, "căutarea n-a găsit clientul").toBeTruthy();
    await act(async () => { rezultat.click(); });
    /* Picker-ul cere confirmare înainte să schimbe — la fel ca peste tot. */
    await act(async () => { buton("Da, facturează").click(); });
    expect(schimbaClientFactura).toHaveBeenCalledWith("inv1", "bc1");
  });

  it("dacă nu găsește pe nimeni, se poate adăuga un client nou", async () => {
    await randeaza();
    await act(async () => { buton("Schimbă clientul").click(); });
    const cautare = document.querySelector(".guest-search input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(cautare, "Firma Care Nu Există");
      cautare.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Niciun client cu");
    const adauga = buton("Adaugă client nou");
    expect(adauga, "lipsește butonul de adăugare").toBeTruthy();

    await act(async () => { adauga.click(); });
    /* Formularul obișnuit de client: alegi persoană fizică sau firmă. */
    expect(buton("Persoană fizică"), "lipsește alegerea de tip client").toBeTruthy();
    expect(buton("Firmă")).toBeTruthy();
  });
});
