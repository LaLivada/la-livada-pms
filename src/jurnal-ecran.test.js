/* Filtrele jurnalului (select Cameră, select Zi), randate cu componenta
 * reala.
 *
 * Testele din jurnal.test.js apara regulile de filtrare si grupare; astea
 * apara legatura dintre ele si ecran. Ce s-ar strica tacut: selectul de zi
 * sa nu se ingusteze la camera aleasa, sau schimbarea camerei sa lase o zi
 * selectata care nu mai are nicio intrare — selectul ar arata gol fara
 * niciun motiv vizibil.
 *
 * Din 14 septembrie 2026 (faza 2, A4) lista unei camere vine din baza
 * (incarcaJurnal cu roomId), nu din cele 400 de intrari de pe ecran — aici
 * „baza" e un mock care filtreaza SERVER dupa roomId.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const CORE = {
  rooms: [
    { id: "r1002", name: "1002" },
    { id: "r1005", name: "1005" },
    { id: "r1102", name: "1102" },
  ],
};

/* Ce e pe ecran: fara `roomId` — intrari vechi, camera se citeste din text. */
const INTRARI = [
  { id: "1", ts: "2026-09-09T07:00:00", action: "A", detail: "1102 · perioadă schimbată", userName: "Razvan" },
  { id: "2", ts: "2026-09-11T09:00:00", action: "B", detail: "1002 · Cotaie Andrei", userName: "Razvan" },
  { id: "3", ts: "2026-09-10T08:00:00", action: "C", detail: "1102 → Curată", userName: "Ovidiu" },
  { id: "4", ts: "2026-09-11T10:00:00", action: "D", detail: "Configurare tarife actualizată", userName: "Ovidiu" },
];

/* Ce e in baza: aceleasi intrari, cu coloana `roomId` completata (backfill),
   plus una mai veche decat cele 400 de pe ecran — exact ce filtrul vechi nu
   putea arata. */
const idDinText = (detaliu) => CORE.rooms.find((r) => detaliu.includes(r.name))?.id || "";
const SERVER = [
  ...INTRARI.map((e) => ({ ...e, roomId: idDinText(e.detail) })),
  { id: "0", ts: "2026-09-01T12:00:00", action: "Z", detail: "1102 · dincolo de cele 400 de pe ecran", userName: "Razvan", roomId: "r1102" },
];

/* `intarzie`: o promisiune pe care „baza" o asteapta inainte sa raspunda —
   testul starii intermediare o tine in mana si o elibereaza cand vrea. */
const stare = vi.hoisted(() => ({ intarzie: null }));
vi.mock("./lib/audit.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    incarcaJurnal: vi.fn(async (_limita, { roomId = "" } = {}) => {
      if (stare.intarzie) await stare.intarzie;
      return SERVER.filter((e) => e.roomId === roomId).sort((a, b) => (a.ts < b.ts ? 1 : -1));
    }),
  };
});

const { LogView } = await import("./features/setari.jsx");
const { incarcaJurnal } = await import("./lib/audit.js");

const montate = [];

async function deschide(intrari = INTRARI, core = CORE) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(LogView, { entries: intrari, core }));
  });
  return host;
}

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
  incarcaJurnal.mockClear();
});

const selectCamera = (host) => host.querySelectorAll("select")[0];
const selectZi = (host) => host.querySelectorAll("select")[1];
const capeteZi = (host) => [...host.querySelectorAll(".jrn-zi-cap")].map((e) => e.textContent);
const actiuni = (host) => [...host.querySelectorAll(".primary")].map((e) => e.textContent);
const actiuniDinGrup = (host, i) =>
  [...host.querySelectorAll(".jrn-grup")][i].querySelectorAll(".primary");

/* Schimba selectul fara sa astepte raspunsul „bazei". */
async function alegeFaraAsteptare(select, valoare) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, valoare);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
/* Lasa cererea (setTimeout 0 + promisiunea mock-ului) sa se termine. */
const asteapta = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
async function alege(select, valoare) {
  await alegeFaraAsteptare(select, valoare);
  await asteapta();
}

describe("LogView — filtre", () => {
  it("arata cele doua select-uri, cu Toate camerele/zilele implicit", async () => {
    const host = await deschide();
    expect(selectCamera(host).value).toBe("");
    expect(selectZi(host).value).toBe("");
    expect([...selectCamera(host).options].map((o) => o.textContent)[0]).toBe("Toate camerele");
    /* Optiunile tin ID-ul camerei, nu numele: filtrul e o interogare pe coloana. */
    expect([...selectCamera(host).options].map((o) => o.value)).toEqual(["", "r1002", "r1005", "r1102"]);
  });

  it("grupeaza pe zi calendaristica, cea mai noua zi prima", async () => {
    const host = await deschide();
    expect(capeteZi(host)).toEqual(["Vineri, 11.09.2026", "Joi, 10.09.2026", "Miercuri, 09.09.2026"]);
    expect(incarcaJurnal).not.toHaveBeenCalled();
  });

  it("selectand o camera, lista vine din baza: TOT istoricul ei, nu doar ce e pe ecran", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "r1102");
    expect(incarcaJurnal).toHaveBeenCalledWith(undefined, { roomId: "r1102" });
    expect(capeteZi(host)).toEqual(["Joi, 10.09.2026", "Miercuri, 09.09.2026", "Marți, 01.09.2026"]);
    expect(actiuni(host)).toEqual(["C", "A", "Z"]);
  });

  it("pana vine raspunsul, arata ce e deja pe ecran — instant, fara lista goala", async () => {
    let elibereaza;
    stare.intarzie = new Promise((r) => { elibereaza = r; });
    try {
      const host = await deschide();
      await alege(selectCamera(host), "r1102");
      expect(incarcaJurnal).toHaveBeenCalledTimes(1);
      expect(capeteZi(host)).toEqual(["Joi, 10.09.2026", "Miercuri, 09.09.2026"]);
      expect(actiuni(host)).toEqual(["C", "A"]);
      elibereaza();
      await asteapta();
      expect(actiuni(host)).toEqual(["C", "A", "Z"]);
    } finally {
      stare.intarzie = null;
    }
  });

  /* Testul cerut explicit: selectul de Zi trebuie sa se ingusteze la
     camera aleasa, nu sa ramana cu toate zilele din jurnal. */
  it("selectul de Zi se ingusteaza la zilele camerei alese", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "r1102");
    const zile = [...selectZi(host).options].map((o) => o.textContent);
    expect(zile).toEqual(["Toate zilele", "10.09", "09.09", "01.09"]);
  });

  it("combina camera si zi", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "r1102");
    await alege(selectZi(host), "2026-09-10");
    expect(capeteZi(host)).toEqual(["Joi, 10.09.2026"]);
    expect(actiuniDinGrup(host, 0)[0].textContent).toBe("C");
  });

  /* O zi aleasa pentru 1102 n-are ce cauta cand receptia trece la 1002 —
     selectul trebuie sa revina la „Toate zilele", nu sa ramana pe o valoare
     pe care noua camera n-o mai are. */
  it("schimbarea camerei reseteaza ziua aleasa", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "r1102");
    await alege(selectZi(host), "2026-09-10");
    await alege(selectCamera(host), "r1002");
    expect(selectZi(host).value).toBe("");
    expect(capeteZi(host)).toEqual(["Vineri, 11.09.2026"]);
    expect(actiuni(host)).toEqual(["B"]);
  });

  it("o camera fara nicio intrare arata mesajul, nu o lista goala tacuta", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "r1005");
    expect(host.querySelector(".empty-state h4").textContent).toBe("Nicio modificare");
    expect(host.querySelector(".empty-state p").textContent).toMatch(/1005/);
  });

  it("jurnal complet gol arata starea goala dintotdeauna", async () => {
    const host = await deschide([]);
    expect(host.querySelector(".empty-state h4").textContent).toBe("Jurnal gol");
  });
});
