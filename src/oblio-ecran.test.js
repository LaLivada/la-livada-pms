/* Tabul „Oblio” din Financiar (features/facturare/oblio.jsx): setarile citite
 * din app_state, CIF-ul preluat de la emitent cand lipseste, pornirea
 * refuzata fara serie, salvarea, si verificarea legaturii cu raspunsul
 * functiei edge (firma, serii, cote) sau eroarea ei. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}) } }));

let setari = { activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false };
const salveazaSetariOblio = vi.fn(async (s) => {
  setari = { ...setari, ...s, cif: s.cif.trim().toUpperCase(), serie: s.serie.trim() };
  return true;
});
const cheamaOblio = vi.fn(async () => ({
  ok: true, firma: "La Livada SRL", serii: [{ nume: "LL", urmatorul: 1 }], seriaOk: true,
  cote: [{ name: "Normala", percentage: 21 }, { name: "Redusa", percentage: 11 }],
}));
vi.mock("./data/oblio.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, setariOblio: vi.fn(async () => ({ ...setari })), salveazaSetariOblio, cheamaOblio };
});

const anuleazaFactura = vi.fn(async () => ({ id: "i", status: "cancelled" }));
const storneazaFactura = vi.fn(async () => ({ original: { id: "i", status: "credited" }, serie: "LL", numar: 2 }));
const listeazaFacturi = vi.fn(async () => [
  { id: "a", status: "issued", series: "LL", number: 7, oblio_numar: "0007", oblio_link: "https://www.oblio.eu/pdf/7", oblio_efactura_cod: 1, total_amount: 100, billing_customer_id: "c1", issue_date: "2026-09-16T10:00:00Z" },
  { id: "b", status: "draft", total_amount: 50, billing_customer_id: "c1" },
]);
vi.mock("./data/facturare.js", async (importOriginal) => ({
  ...(await importOriginal()), anuleazaFactura, storneazaFactura, serieActiva: vi.fn(async () => "LL"), listeazaFacturi,
}));
vi.mock("./lib/permisiuni.js", () => ({ canBilling: () => true, billingPerms: { role: "admin", set: new Set() } }));

const { OblioView } = await import("./features/facturare/oblio.jsx");
const { InvoiceCancelCreditActions } = await import("./features/facturare/factura.jsx");
const { InvoicesListView } = await import("./features/facturare/facturi-lista.jsx");

const montate = [];
async function randeaza(core = { invoiceIssuer: { cui: "ro12345678" } }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(OblioView, { core })); });
  await act(async () => {});
  return host;
}
async function randeazaActiuni(invoice, onChanged) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(InvoiceCancelCreditActions, { invoice, onChanged })); });
  await act(async () => {});
  return host;
}
const butonText = (host, text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const apasa = async (el) => { await act(async () => { el.click(); }); await act(async () => {}); };
const scrie = async (input, valoare) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, valoare);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const camp = (host, eticheta) => [...host.querySelectorAll("label.field")].find((l) => l.textContent.includes(eticheta))?.querySelector("input");

beforeEach(() => {
  setari = { activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false };
  salveazaSetariOblio.mockClear();
  cheamaOblio.mockClear();
});
afterEach(() => {
  for (const { root, host } of montate.splice(0)) { act(() => root.unmount()); host.remove(); }
});

describe("OblioView", () => {
  it("preia CIF-ul de la emitent cand setarile n-au unul si porneste oprit", async () => {
    const host = await randeaza();
    expect(camp(host, "CIF").value).toBe("RO12345678");
    expect(camp(host, "Emite facturile prin Oblio").checked).toBe(false);
    expect(host.textContent).toContain("Modificări nesalvate");
  });
  it("nu lasa pornirea fara serie", async () => {
    const host = await randeaza();
    await apasa(camp(host, "Emite facturile prin Oblio"));
    await apasa(butonText(host, "Salvează"));
    expect(salveazaSetariOblio).not.toHaveBeenCalled();
  });
  it("salveaza CIF-ul, seria si pornirea", async () => {
    const host = await randeaza();
    await scrie(camp(host, "Seria facturilor"), " LL ");
    await apasa(camp(host, "Emite facturile prin Oblio"));
    await apasa(butonText(host, "Salvează"));
    expect(salveazaSetariOblio).toHaveBeenCalledTimes(1);
    expect(salveazaSetariOblio.mock.calls[0][0]).toMatchObject({ activ: true, cif: "RO12345678", serie: " LL " });
    expect(host.textContent).not.toContain("Modificări nesalvate");
  });
  it("verificarea arata firma, seriile si cotele din Oblio, sau eroarea", async () => {
    const host = await randeaza();
    await apasa(butonText(host, "Verifică legătura"));
    expect(cheamaOblio).toHaveBeenCalledWith("verifica", { cif: "RO12345678", serie: "" });
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("La Livada SRL");
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("Normala 21%, Redusa 11%");
    cheamaOblio.mockResolvedValueOnce({ ok: false, error: "Oblio: Invalid client" });
    await apasa(butonText(host, "Verifică legătura"));
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("Invalid client");
  });
  it("spune cand seria ceruta nu exista in Oblio", async () => {
    const host = await randeaza();
    await scrie(camp(host, "Seria facturilor"), "XX");
    cheamaOblio.mockResolvedValueOnce({ ok: true, firma: "La Livada SRL", serii: [{ nume: "LL", urmatorul: 1 }], seriaOk: false, cote: [] });
    await apasa(butonText(host, "Verifică legătura"));
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("seria „XX” nu există");
  });
});

describe("InvoiceCancelCreditActions", () => {
  const EMISA_OBLIO = { id: "i", status: "issued", paid_amount: 0, series: "LL", number: 7, oblio_numar: "0007", oblio_stare: "emisa" };
  const EMISA_LOCAL = { id: "i", status: "issued", paid_amount: 0, series: "LL", number: 1, oblio_stare: "neemisa" };

  it("factura emisa prin Oblio se anuleaza prin Oblio", async () => {
    const onChanged = vi.fn();
    cheamaOblio.mockResolvedValueOnce({ ok: true, factura: { ...EMISA_OBLIO, status: "cancelled" } });
    const host = await randeazaActiuni(EMISA_OBLIO, onChanged);
    await apasa(butonText(host, "Anulează factura"));
    await apasa(butonText(host, "Confirmă"));
    expect(cheamaOblio).toHaveBeenCalledWith("anuleaza", { invoiceId: "i" });
    expect(anuleazaFactura).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });
  it("factura emisa prin Oblio se storneaza prin Oblio, cu numarul lui", async () => {
    const onChanged = vi.fn();
    cheamaOblio.mockResolvedValueOnce({ ok: true, stornare: { id: "nc", series: "LL", number: 8, oblio_numar: "0008" }, original: { ...EMISA_OBLIO, status: "credited" } });
    const host = await randeazaActiuni(EMISA_OBLIO, onChanged);
    await apasa(butonText(host, "Stornează"));
    await apasa(butonText(host, "Confirmă"));
    expect(cheamaOblio).toHaveBeenCalledWith("storneaza", { invoiceId: "i" });
    expect(storneazaFactura).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "credited" }));
  });
  it("refuzul lui Oblio nu schimba nimic", async () => {
    const onChanged = vi.fn();
    cheamaOblio.mockResolvedValueOnce({ ok: false, error: "Oblio: documentul nu poate fi anulat" });
    const host = await randeazaActiuni(EMISA_OBLIO, onChanged);
    await apasa(butonText(host, "Anulează factura"));
    await apasa(butonText(host, "Confirmă"));
    expect(onChanged).not.toHaveBeenCalled();
  });
  it("factura emisa local merge pe drumul vechi", async () => {
    const onChanged = vi.fn();
    const host = await randeazaActiuni(EMISA_LOCAL, onChanged);
    await apasa(butonText(host, "Anulează factura"));
    await apasa(butonText(host, "Confirmă"));
    expect(anuleazaFactura).toHaveBeenCalledWith("i");
    expect(cheamaOblio).not.toHaveBeenCalled();
  });
});

describe("InvoicesListView", () => {
  it("randul unei facturi emise prin Oblio are linkul la PDF si eticheta SPV; draftul, nu", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    montate.push({ root, host });
    await act(async () => { root.render(React.createElement(InvoicesListView, { core: { billingCustomers: [] } })); });
    await act(async () => {});
    const linkuri = [...host.querySelectorAll('a[aria-label="PDF din Oblio"]')];
    expect(linkuri.map((a) => a.getAttribute("href"))).toEqual(["https://www.oblio.eu/pdf/7"]);
    expect(linkuri[0].getAttribute("target")).toBe("_blank");
    expect(host.textContent).toContain("SPV: trimisă");
    expect(host.textContent).toContain("LL 7");
  });
});
