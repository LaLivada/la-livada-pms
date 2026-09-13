/* Indicatorul de conexiune (faza 3, C8), randat cu componenta reala.
 * Nu apare deloc cand totul e in regula; spune „Offline" cand browserul
 * pierde reteaua si numara salvarile care asteapta in coada.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { creeazaCoada } from "./lib/coada-salvari.js";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const { IndicatorRetea } = await import("./features/retea.jsx");

const montate = [];
async function deschide(coada) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(IndicatorRetea, { coada })); });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});
const eveniment = (nume) => act(async () => { window.dispatchEvent(new Event(nume)); });
const text = (host) => host.querySelector(".retea-pastila")?.textContent ?? null;

describe("IndicatorRetea", () => {
  it("nu apare cand e online si coada e goala", async () => {
    const host = await deschide(creeazaCoada());
    expect(host.querySelector(".retea-pastila")).toBeNull();
  });

  it("offline: spune, si numara salvarile care asteapta", async () => {
    const coada = creeazaCoada();
    const host = await deschide(coada);
    await eveniment("offline");
    expect(text(host)).toBe("Offline");
    expect(host.querySelector(".retea-offline")).not.toBeNull();
    await act(async () => { coada.adauga({ tip: "upsert", tabel: "reservations", rand: { id: "r1" } }); });
    expect(text(host)).toBe("Offline · 1 salvare în așteptare");
    await act(async () => { coada.adauga({ tip: "upsert", tabel: "reservations", rand: { id: "r2" } }); });
    expect(text(host)).toBe("Offline · 2 salvări în așteptare");
  });

  it("revenit online cu coada plina: „se trimite”; goala: dispare", async () => {
    const coada = creeazaCoada();
    coada.adauga({ tip: "insert", tabel: "activity_log", rand: {} });
    const host = await deschide(coada);
    await eveniment("offline");
    await eveniment("online");
    expect(text(host)).toBe("Se trimite · 1 salvare");
    expect(host.querySelector(".retea-trimite")).not.toBeNull();
    await act(async () => { coada.goleste(); });
    expect(host.querySelector(".retea-pastila")).toBeNull();
  });
});
