/* Ecranul de refuz al aplicatiei de oaspete (faza 3, C10): timeout-ul e alt
 * ecran decat „ceva n-a mers", si amandoua au „Incearca din nou"; un link
 * expirat sau incomplet nu are butonul — reincercarea nu l-ar repara.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Refuz, motivEsec } from "./guest/App.jsx";
import { LimbaProvider } from "./guest/limbi.jsx";

const montate = [];
async function deschide(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  // Refuz cheama useTexte(), care de la Task 4 alege dupa useLimba() —
  // are nevoie de <LimbaProvider> deasupra in arbore, la fel ca in App reala
  // (vezi guest/main.jsx).
  await act(async () => {
    root.render(React.createElement(LimbaProvider, null, React.createElement(Refuz, props)));
  });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});
const butonReincearca = (host) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === "Încearcă din nou") || null;

describe("motivEsec", () => {
  it("timeout-ul din lib/retea.js are motivul lui; orice altceva e „eroare”", () => {
    expect(motivEsec({ timeout: true, retea: true })).toBe("timeout");
    expect(motivEsec(new TypeError("Failed to fetch"))).toBe("eroare");
    expect(motivEsec(undefined)).toBe("eroare");
  });
});

describe("Refuz", () => {
  it("la timeout spune ca serverul n-a raspuns si ofera reincercarea", async () => {
    const onReincearca = vi.fn();
    const host = await deschide({ motiv: "timeout", onReincearca });
    expect(host.querySelector("h1").textContent).toBe("Serverul n-a răspuns");
    const buton = butonReincearca(host);
    expect(buton).not.toBeNull();
    await act(async () => { buton.click(); });
    expect(onReincearca).toHaveBeenCalledTimes(1);
    expect(host.querySelector("a.g-buton").textContent).toBe("Sună recepția");
  });

  it("„ceva n-a mers” are si el reincercarea", async () => {
    const host = await deschide({ motiv: "eroare", onReincearca: () => {} });
    expect(butonReincearca(host)).not.toBeNull();
  });

  /* Testul care conteaza: un link incomplet nu se repara reincercand. */
  it("un link incomplet sau expirat nu are butonul", async () => {
    for (const motiv of ["lipsa", "incheiat", "necunoscut"]) {
      const host = await deschide({ motiv, onReincearca: () => {} });
      expect(butonReincearca(host), motiv).toBeNull();
    }
  });
});
