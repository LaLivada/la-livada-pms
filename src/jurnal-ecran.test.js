/* Filtrele jurnalului (select Cameră, select Zi), randate cu componenta
 * reala.
 *
 * Testele din jurnal.test.js apara regulile de filtrare si grupare; astea
 * apara legatura dintre ele si ecran. Ce s-ar strica tacut: selectul de zi
 * sa nu se ingusteze la camera aleasa, sau schimbarea camerei sa lase o zi
 * selectata care nu mai are nicio intrare — selectul ar arata gol fara
 * niciun motiv vizibil.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const { LogView } = await import("./features/setari.jsx");

const CORE = {
  rooms: [
    { id: "r1002", name: "1002" },
    { id: "r1005", name: "1005" },
    { id: "r1102", name: "1102" },
  ],
};

const INTRARI = [
  { id: "1", ts: "2026-09-09T07:00:00", action: "A", detail: "1102 · perioadă schimbată", userName: "Razvan" },
  { id: "2", ts: "2026-09-11T09:00:00", action: "B", detail: "1002 · Cotaie Andrei", userName: "Razvan" },
  { id: "3", ts: "2026-09-10T08:00:00", action: "C", detail: "1102 → Curată", userName: "Ovidiu" },
  { id: "4", ts: "2026-09-11T10:00:00", action: "D", detail: "Configurare tarife actualizată", userName: "Ovidiu" },
];

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
});

const selectCamera = (host) => host.querySelectorAll("select")[0];
const selectZi = (host) => host.querySelectorAll("select")[1];
const capeteZi = (host) => [...host.querySelectorAll(".jrn-zi-cap")].map((e) => e.textContent);
const actiuniDinGrup = (host, i) =>
  [...host.querySelectorAll(".jrn-grup")][i].querySelectorAll(".primary");

async function alege(select, valoare) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, valoare);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("LogView — filtre", () => {
  it("arata cele doua select-uri, cu Toate camerele/zilele implicit", async () => {
    const host = await deschide();
    expect(selectCamera(host).value).toBe("");
    expect(selectZi(host).value).toBe("");
    expect([...selectCamera(host).options].map((o) => o.textContent)[0]).toBe("Toate camerele");
  });

  it("grupeaza pe zi calendaristica, cea mai noua zi prima", async () => {
    const host = await deschide();
    expect(capeteZi(host)).toEqual(["Vineri, 11.09.2026", "Joi, 10.09.2026", "Miercuri, 09.09.2026"]);
  });

  it("selectand o camera, arata TOT istoricul ei, in celelalte zile disparand", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "1102");
    expect(capeteZi(host)).toEqual(["Joi, 10.09.2026", "Miercuri, 09.09.2026"]);
    expect([...host.querySelectorAll(".primary")].map((e) => e.textContent)).toEqual(["C", "A"]);
  });

  /* Testul cerut explicit: selectul de Zi trebuie sa se ingusteze la
     camera aleasa, nu sa ramana cu toate zilele din jurnal. */
  it("selectul de Zi se ingusteaza la zilele camerei alese", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "1102");
    const zile = [...selectZi(host).options].map((o) => o.textContent);
    expect(zile).toEqual(["Toate zilele", "10.09", "09.09"]);
  });

  it("combina camera si zi", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "1102");
    await alege(selectZi(host), "2026-09-10");
    expect(capeteZi(host)).toEqual(["Joi, 10.09.2026"]);
    expect(actiuniDinGrup(host, 0)[0].textContent).toBe("C");
  });

  /* O zi aleasa pentru 1102 n-are ce cauta cand receptia trece la 1005 —
     selectul trebuie sa revina la „Toate zilele", nu sa ramana pe o valoare
     pe care noua camera n-o mai are. */
  it("schimbarea camerei reseteaza ziua aleasa", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "1102");
    await alege(selectZi(host), "2026-09-10");
    await alege(selectCamera(host), "1002");
    expect(selectZi(host).value).toBe("");
    expect(capeteZi(host)).toEqual(["Vineri, 11.09.2026"]);
  });

  it("o camera fara nicio intrare arata mesajul, nu o lista goala tacuta", async () => {
    const host = await deschide();
    await alege(selectCamera(host), "1005");
    expect(host.querySelector(".empty-state h4").textContent).toBe("Nicio modificare");
    expect(host.querySelector(".empty-state p").textContent).toMatch(/1005/);
  });

  it("jurnal complet gol arata starea goala dintotdeauna", async () => {
    const host = await deschide([]);
    expect(host.querySelector(".empty-state h4").textContent).toBe("Jurnal gol");
  });
});
