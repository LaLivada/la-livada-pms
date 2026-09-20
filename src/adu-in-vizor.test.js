/* Aducerea in vizor acolo unde `scrollIntoView` lipseste.
 *
 * jsdom nu implementeaza Element.prototype.scrollIntoView, iar useAduInVizor
 * il cheama dintr-un cronometru de 80 ms. Un test care tinea montata macar
 * atat o componenta cu cautare (BillingCustomerPicker, fisa rezervarii)
 * primea o exceptie neprinsa din cronometru: toate testele treceau, dar
 * Vitest raporta „Errors 1 error" si iesea cu cod nenul — cam o rulare din
 * patru, dupa cat de incarcata era masina (21 septembrie 2026). La fel ar
 * pati un browser vechi, fara metoda.
 *
 * Ce s-ar strica tacut: apararea sa dispara (CI-ul pica la intamplare) sau,
 * invers, sa inghita si derularea de pe telefon, unde metoda exista.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useAduInVizor } from "./ui/primitive.jsx";

const montate = [];
async function deschide(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(element); });
  return { host, root };
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
  vi.useRealTimers();
});

/* Ceasul fals arunca mai departe ce a aruncat cronometrul; prinsa aici,
   exceptia ajunge intr-o asertiune, nu intr-un test care „crapa". */
async function inainteaza(ms) {
  let eroare = null;
  await act(async () => {
    try { await vi.advanceTimersByTimeAsync(ms); } catch (e) { eroare = e; }
  });
  return eroare;
}

function Proba({ vizibil }) {
  const ref = useAduInVizor(vizibil);
  return React.createElement("div", { ref, className: "tinta" });
}

describe("useAduInVizor", () => {
  it("nu arunca din cronometru cand elementul n-are scrollIntoView", async () => {
    vi.useFakeTimers();
    const { host } = await deschide(React.createElement(Proba, { vizibil: true }));
    /* Conditia de pornire, spusa pe fata: jsdom n-are metoda azi, dar
       testul nu se bizuie pe asta. */
    host.querySelector(".tinta").scrollIntoView = undefined;
    expect(await inainteaza(80)).toBeNull();
  });

  it("acolo unde metoda exista, deruleaza dupa 80 ms si doar cat e nevoie", async () => {
    vi.useFakeTimers();
    const { host } = await deschide(React.createElement(Proba, { vizibil: true }));
    const deruleaza = vi.fn();
    host.querySelector(".tinta").scrollIntoView = deruleaza;
    expect(await inainteaza(79)).toBeNull();
    expect(deruleaza).not.toHaveBeenCalled();
    expect(await inainteaza(1)).toBeNull();
    expect(deruleaza).toHaveBeenCalledTimes(1);
    expect(deruleaza).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }));
  });
});
