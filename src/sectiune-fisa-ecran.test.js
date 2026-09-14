/* Sectiunea „Fisa de cazare" din fisa de rezervare, randata cu componenta
 * reala: starea sta pe acelasi rand cu eticheta, scurt („Nu e completată"),
 * iar butonul de dedesubt spune ce se poate face. Ce s-ar strica tacut:
 * starea sa cada iar sub eticheta (doua randuri pe telefon), sau butonul
 * „Completează" sa dispara odata cu propozitia care il explica.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
const fisaActiva = vi.fn();
vi.mock("./data/fise.js", () => ({
  fisaActiva: (...a) => fisaActiva(...a),
  toateFisele: vi.fn(), fisaIntreaga: vi.fn(), fisePentruRezervare: vi.fn(), rezervariCuFisa: vi.fn(),
  areFisaActiva: vi.fn(), scrieFisa: vi.fn(), anuleaza: vi.fn(),
}));

const { SectiuneFisa } = await import("./features/fise.jsx");

const CORE = { rooms: [{ id: "r1007", name: "1007", type: "tiny" }] };
const REZ = { id: "rez-1", roomId: "r1007", checkin: "2026-09-16T11:00:00Z", checkout: "2026-09-18T08:00:00Z", adults: 2, children: 0 };

const montate = [];
async function deschide(fisa) {
  fisaActiva.mockResolvedValue(fisa);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(SectiuneFisa, { res: REZ, core: CORE })); });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});
const rand = (host) => host.querySelector(".field-rand");
const butoane = (host) => [...host.querySelectorAll("button")].map((b) => b.textContent.trim());

describe("SectiuneFisa", () => {
  it("fara fisa: „Nu e completată” pe randul etichetei, si butonul Completează dedesubt", async () => {
    const host = await deschide(null);
    expect(rand(host).querySelector("label").textContent).toBe("Fișă de cazare");
    expect(rand(host).querySelector(".field-nota").textContent).toBe("Nu e completată");
    expect(butoane(host)).toEqual(["Completează"]);
  });

  it("cu fisa: cand si de cine, pe acelasi rand; lipsa semnaturii, cu motivul, dedesubt", async () => {
    const host = await deschide({ id: "fc-1", semnat_la: "2026-09-14T07:21:28Z", completata_de: null, semnatura_svg: null, fara_semnatura_motiv: "oaspetele a refuzat" });
    expect(rand(host).querySelector(".field-nota").textContent).toMatch(/^Completată .* · de oaspete$/);
    expect(host.querySelector(".field-nota-pericol").textContent).toBe("Fără semnătură — oaspetele a refuzat");
    expect(butoane(host)).toEqual(["Vezi fișa", "Anulează"]);
  });
});
