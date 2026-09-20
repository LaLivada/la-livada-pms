/* Butonul de printare al fișei de anunțare (ArrivalForm), pe telefon.
 *
 * Bug raportat 20 septembrie 2026: "Butonul de print de la fișa de cazare
 * nu merge" — pe iPhone, dar doar cand aplicatia e deschisa de pe pictograma
 * de pe ecranul principal, nu si direct din Safari. Cauza: butonul chema
 * window.print(), care nu deschide nimic in acel context — acelasi motiv
 * pentru care factura (InvoicePrint) si lista de cazare a grupului
 * (GroupPrint) trecusera deja pe generatePdfBlob (lib/pdf.js), inainte ca
 * fisa de anuntare sa primeasca acelasi tratament.
 *
 * Testul confirma ambele jumatati ale fixului: butonul cheama
 * generatePdfBlob (nu window.print), iar un esec de generare arata o
 * eroare in loc sa lase butonul blocat pe "Se generează…".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./data/fise.js", () => ({ fisaActiva: vi.fn(async () => null) }));

const generatePdfBlob = vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" }));
const pregatesteFila = vi.fn(() => null);
const arataInFila = vi.fn(() => false);
const inchideFila = vi.fn();
vi.mock("./lib/pdf.js", () => ({
  generatePdfBlob: (...args) => generatePdfBlob(...args),
  pregatesteFila: (...args) => pregatesteFila(...args),
  arataInFila: (...args) => arataInFila(...args),
  inchideFila: (...args) => inchideFila(...args),
}));

const { ArrivalForm } = await import("./features/documente.jsx");

const RES = {
  id: "res1", occupantName: "Popescu Ion", roomId: "r1", guestId: "g1",
  checkin: "2026-09-20T11:00:00.000Z", checkout: "2026-09-22T08:00:00.000Z",
};
const CORE = {
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ion", country: "România" }],
  rooms: [{ id: "r1", name: "1001" }],
};

let root = null;
let container = null;
const randeaza = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ArrivalForm, { res: RES, core: CORE, groups: [], onClose: () => {} }));
  });
  await act(async () => { await new Promise((gata) => setTimeout(gata, 5)); });
};

const buton = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeEach(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  generatePdfBlob.mockClear();
  pregatesteFila.mockClear();
  window.print = vi.fn();
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = null; container = null;
  document.body.innerHTML = "";
});

describe("fisa de anuntare — Vezi PDF", () => {
  it("generează PDF-ul din coală, nu cheamă niciodată window.print", async () => {
    await randeaza();
    await act(async () => { buton("Vezi PDF").click(); });
    await act(async () => { await Promise.resolve(); });

    expect(generatePdfBlob).toHaveBeenCalledTimes(1);
    const [elCapturat, opti] = generatePdfBlob.mock.calls[0];
    expect(elCapturat.className).toContain("fisa-duo");
    expect(opti).toEqual({ singlePage: true });
    expect(window.print).not.toHaveBeenCalled();
  });

  it("la un eșec de generare, butonul revine la normal (nu rămâne blocat)", async () => {
    generatePdfBlob.mockRejectedValueOnce(new Error("boom"));
    await randeaza();
    await act(async () => { buton("Vezi PDF").click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(buton("Vezi PDF")).toBeTruthy();
    expect(buton("Vezi PDF").disabled).toBe(false);
    expect(inchideFila).toHaveBeenCalledTimes(1);
  });
});
