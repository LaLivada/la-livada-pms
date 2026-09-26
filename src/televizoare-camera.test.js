/* Tabul „Televizor" din fișa camerei (26 septembrie 2026).
 *
 * Cererea lui Ovidiu: televizoarele unei camere se pun din camera ei, ca
 * yala — nu dintr-un ecran separat din meniul principal. Aici se vede ce
 * televizor e al camerei, ce scrie acum pe el, și se leagă sau se scoate
 * unul. Setările generale (mesajul, furnizorul, istoricul) au plecat în
 * Automatizare → Televizoare.
 *
 * Reteaua e mocata (data/televizoare.js); restul e codul real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const mapeazaCamera = vi.fn(async () => {});
const cheamaTv = vi.fn(async () => ({ ok: true, total: 16, noi: 16 }));
let TELEVIZOARE = [];

vi.mock("./data/televizoare.js", async (importOriginal) => ({
  ...(await importOriginal()),
  toateTelevizoarele: vi.fn(async () => TELEVIZOARE),
  mapeazaCamera,
  cheamaTv,
}));
/* Jurnalul se spioneaza pe obiectul real, nu se inlocuieste modulul: o copie
   a lui `audit` ar lasa `isAdmin()` sa citeasca utilizatorul de pe original,
   iar butoanele ar parea dezactivate pentru orice rol. */
const { audit } = await import("./lib/audit.js");
const { RoomModal } = await import("./features/camere.jsx");

const CAMERA = { id: "r1003", name: "1003", type: "tiny", capacity: 2 };

const tv = (over) => ({
  id: "tv-sim-tv-1003", idLynk: "sim-tv-1003", furnizor: "simulare", simulat: true,
  nume: "SIMULARE TV 1003", model: "SIMULARE", activ: true, cameraId: "r1003", camera: "1003",
  online: true, sugestieCamera: "1003", mesaj: null, mesajLa: null, rezervareId: null, vazutLa: null,
  ...over,
});
const TV_1003 = tv({ mesaj: "Bun venit, Ana Pop!\nCamera 1003" });
const TV_NEMAPAT = tv({ id: "tv-sim-tv-1005", idLynk: "sim-tv-1005", nume: "SIMULARE TV 1005", cameraId: null, camera: null });
const TV_1007 = tv({ id: "tv-sim-tv-1007", idLynk: "sim-tv-1007", nume: "SIMULARE TV 1007", cameraId: "r1007", camera: "1007" });

const montate = [];
async function deschide(room = CAMERA) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(RoomModal, { room, onSave: () => {}, onClose: () => {} }));
  });
  return host;
}

const buton = (g, text) => [...g.querySelectorAll("button")].find((b) => b.textContent.trim().includes(text));
const apasa = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
async function alege(select, valoare) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, valoare);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function tabulTelevizor(room) {
  const g = await deschide(room);
  await apasa(buton(g, "Televizor"));
  return g;
}

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  vi.spyOn(audit, "push").mockResolvedValue(undefined);
  mapeazaCamera.mockClear();
  cheamaTv.mockClear();
  TELEVIZOARE = [TV_1003, TV_NEMAPAT, TV_1007];
});
afterEach(async () => {
  await act(async () => { montate.forEach((m) => m.root.unmount()); });
  montate.forEach((m) => m.host.remove());
  montate.length = 0;
  vi.restoreAllMocks();
  audit.user = null;
});

describe("fișa camerei — tabul Televizor", () => {
  it("are tab propriu, lângă Yală", async () => {
    const g = await deschide();
    const taburi = [...g.querySelectorAll(".sub-tabs button")].map((b) => b.textContent.trim());
    expect(taburi).toContain("Televizor");
  });

  /* „OTA", nu „Calendare OTA" (cerut pe 26 septembrie 2026): cu eticheta
     lunga, al patrulea tab nu mai incapea langa celelalte. */
  it("taburile sunt scurte: Informații cameră, Yală, OTA, Televizor", async () => {
    const g = await deschide();
    const taburi = [...g.querySelectorAll(".sub-tabs button")].map((b) => b.textContent.trim());
    expect(taburi).toEqual(["Informații cameră", "Yală", "OTA", "Televizor"]);
  });

  it("arată televizorul camerei și ce scrie acum pe el, cu rândurile lui", async () => {
    const g = await tabulTelevizor();
    expect(g.textContent).toContain("SIMULARE TV 1003");
    const ecran = g.querySelector("pre.tv-ecran");
    expect(ecran.textContent).toBe("Bun venit, Ana Pop!\nCamera 1003");
    /* Televizoarele altor camere nu apar ca ale ei. */
    expect([...g.querySelectorAll(".tv-camera-lista .primary")].map((x) => x.textContent))
      .toEqual([expect.stringContaining("SIMULARE TV 1003")]);
  });

  it("leagă de cameră un televizor fără cameră, și spune în jurnal", async () => {
    const g = await tabulTelevizor();
    await alege(g.querySelector("select[name=tv-de-legat]"), "tv-sim-tv-1005");
    await apasa(buton(g, "Leagă de cameră"));
    expect(mapeazaCamera).toHaveBeenCalledWith("tv-sim-tv-1005", "r1003");
    expect(audit.push).toHaveBeenCalledWith("Televizor mapat", "SIMULARE TV 1005 → 1003", { roomId: "r1003" });
  });

  it("spune la alegere când televizorul e acum în altă cameră", async () => {
    const g = await tabulTelevizor();
    const optiuni = [...g.querySelectorAll("select[name=tv-de-legat] option")].map((o) => o.textContent);
    expect(optiuni).toContain("SIMULARE TV 1005 · fără cameră");
    expect(optiuni).toContain("SIMULARE TV 1007 · acum în 1007");
    expect(optiuni.some((o) => o.includes("SIMULARE TV 1003"))).toBe(false);
  });

  it("scoate televizorul din cameră", async () => {
    const g = await tabulTelevizor();
    await apasa(buton(g, "Scoate din cameră"));
    expect(mapeazaCamera).toHaveBeenCalledWith("tv-sim-tv-1003", null);
  });

  it("fără niciun televizor în PMS, spune cum ajung aici când vor fi gata", async () => {
    TELEVIZOARE = [];
    const g = await tabulTelevizor();
    expect(g.textContent).toContain("Camera n-are încă niciun televizor.");
    expect(g.querySelector("select[name=tv-de-legat]")).toBeNull();
    await apasa(buton(g, "Sincronizează televizoare"));
    expect(cheamaTv).toHaveBeenCalledWith("sync-tvs");
  });

  it("o cameră nouă își leagă televizoarele după prima salvare", async () => {
    const g = await tabulTelevizor(null);
    expect(g.textContent).toContain("Salvează camera întâi");
  });

  it("recepția vede, dar nu schimbă legăturile", async () => {
    audit.user = { name: "Test", role: "receptionist" };
    const g = await tabulTelevizor();
    expect(buton(g, "Scoate din cameră").disabled).toBe(true);
    expect(buton(g, "Leagă de cameră").disabled).toBe(true);
  });
});
