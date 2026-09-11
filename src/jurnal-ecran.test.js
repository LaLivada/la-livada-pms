/* Capul de tabel al jurnalului, randat cu componenta reala.
 *
 * Testele din jurnal.test.js apara regulile de sortare; astea apara
 * legatura dintre ele si ecran. Ce s-ar strica tacut: butonul sa arate
 * sageata schimbata fara ca lista sa se miste, sau a doua apasare pe aceeasi
 * coloana sa reia sortarea in loc s-o intoarca.
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

async function deschide(intrari = INTRARI) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(LogView, { entries: intrari, core: CORE }));
  });
  return host;
}

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

const actiuni = (host) =>
  [...host.querySelectorAll(".jrn-rand .primary")].map((e) => e.textContent);
const camere = (host) =>
  [...host.querySelectorAll(".jrn-camera")].map((e) => e.textContent);
const buton = (host, eticheta) =>
  [...host.querySelectorAll(".jrn-cap-btn")].find((b) => b.textContent.startsWith(eticheta));
const apasa = async (b) => { await act(async () => { b.click(); }); };

describe("LogView — capul de tabel", () => {
  it("porneste cu cele mai noi intai", async () => {
    const host = await deschide();
    expect(actiuni(host)).toEqual(["D", "B", "C", "A"]);
  });

  it("arata camera pe fiecare rand, si linie cand nu e niciuna", async () => {
    const host = await deschide();
    expect(camere(host)).toEqual(["—", "1002", "1102", "1102"]);
  });

  it("sorteaza dupa camera cand se apasa pe capul ei", async () => {
    const host = await deschide();
    await apasa(buton(host, "Cameră"));
    /* Descrescator: 1102 intai, apoi 1002, iar actiunea fara camera la
       coada. In interiorul lui 1102, timpul ramane descrescator. */
    expect(camere(host)).toEqual(["1102", "1102", "1002", "—"]);
    expect(actiuni(host)).toEqual(["C", "A", "B", "D"]);
  });

  /* A doua apasare pe aceeasi coloana INTOARCE sensul, nu reia sortarea.
     Fara asta butonul ar fi parut ca nu face nimic. */
  it("a doua apasare intoarce sensul", async () => {
    const host = await deschide();
    const b = buton(host, "Cameră");
    await apasa(b);
    await apasa(b);
    expect(camere(host)).toEqual(["1002", "1102", "1102", "—"]);
  });

  it("intoarcerea pe zi da cele mai vechi intai", async () => {
    const host = await deschide();
    await apasa(buton(host, "Zi"));
    expect(actiuni(host)).toEqual(["A", "C", "B", "D"]);
  });

  /* Starea se spune in text, nu prin `aria-sort`: acela e valid doar
     intr-un arbore de tabel, iar randurile de aici sunt `.list-row`-uri. */
  it("spune in cuvinte ce coloana e activa si in ce sens", async () => {
    const host = await deschide();
    expect(buton(host, "Zi").getAttribute("aria-label")).toMatch(/sortat descrescător/);
    expect(buton(host, "Cameră").getAttribute("aria-label")).toMatch(/^Sortează după/);
    await apasa(buton(host, "Zi"));
    expect(buton(host, "Zi").getAttribute("aria-label")).toMatch(/sortat crescător/);
  });

  it("nu se sufoca fara camere in core", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    montate.push({ root, host });
    await act(async () => {
      root.render(React.createElement(LogView, { entries: INTRARI, core: undefined }));
    });
    expect(camere(host)).toEqual(["—", "—", "—", "—"]);
  });
});
