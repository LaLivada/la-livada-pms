/* Televizoarele au iesit din meniul principal (26 septembrie 2026): setarile
 * lor generale — mesajul, furnizorul, aparatele din cont, istoricul — stau
 * intr-un tab al Automatizarii, iar televizorul fiecarei camere se pune din
 * fisa ei (vezi televizoare-camera.test.js). Cerut de Ovidiu: „scoate
 * televizoarele din meniul principal; setarile generale, un tab la
 * automatizare".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./data/dispozitive.js", async (importOriginal) => ({
  ...(await importOriginal()),
  toateDispozitivele: vi.fn(async () => []),
  cheamaDispozitiv: vi.fn(async () => ({ ok: true, actualizate: 0 })),
  reguliAutomate: vi.fn(async () => []),
  consumIstoric: vi.fn(async () => null),
  ultimaRulareAutomatizari: vi.fn(async () => null),
}));
vi.mock("./data/televizoare.js", async (importOriginal) => {
  const real = await importOriginal();
  const { normalizeazaSetari } = await import("./lib/tv.js");
  return {
    ...real,
    toateTelevizoarele: vi.fn(async () => []),
    setariTv: vi.fn(async () => normalizeazaSetari({})),
    mesajeRecente: vi.fn(async () => []),
  };
});

const { audit } = await import("./lib/audit.js");
const { AutomatizareView } = await import("./features/automatizare.jsx");

const CORE = { rooms: [{ id: "r1003", name: "1003", type: "tiny" }] };

const montate = [];
async function randeaza() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(AutomatizareView, { core: CORE, reservations: [] }));
  });
  return host;
}
const tab = (g, text) => [...g.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === text);

afterEach(async () => {
  await act(async () => { montate.forEach((m) => m.root.unmount()); });
  montate.forEach((m) => m.host.remove());
  montate.length = 0;
  audit.user = null;
});

describe("Automatizare → Televizoare", () => {
  it("are tabul Televizoare, cu setarile generale ale televizoarelor", async () => {
    audit.user = { name: "Test", role: "admin" };
    const g = await randeaza();
    const televizoare = tab(g, "Televizoare");
    expect(televizoare).toBeTruthy();

    await act(async () => { televizoare.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    for (const sectiune of ["Camere", "Aparate", "Mesaj", "Istoric"]) {
      expect(tab(g, sectiune), sectiune).toBeTruthy();
    }
    /* Fara `pms:tv:v1`, furnizorul e simularea — avertismentul trebuie sa se
       vada si de aici, nu doar din vechiul ecran. */
    expect(g.textContent).toContain("Mesajele NU ajung pe niciun televizor real");
  });
});

describe("meniul principal", () => {
  const app = readFileSync(resolve(process.cwd(), "src/pms-app.jsx"), "utf8");

  it("nu mai are Televizoare; Automatizarea ramane", () => {
    const start = app.indexOf("const SETTINGS_ITEMS");
    const meniu = app.slice(start, app.indexOf("];", start));
    expect(meniu).toContain('key: "automation"');
    expect(meniu).not.toContain('key: "televizoare"');
  });

  it("nici ecranul separat nu mai are ruta", () => {
    expect(app).not.toMatch(/safeView === "televizoare"/);
    expect(app).not.toMatch(/features\/televizoare\.jsx/);
  });
});
