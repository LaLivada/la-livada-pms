/* Scheletul de incarcare (faza 3, C10), randat cu componenta reala.
 *
 * Ce s-ar strica tacut: cititorul de ecran sa nu afle ca se incarca (fara
 * role=status); randul „dureaza mai mult" sa apara instant sau sa ramana
 * dupa ce incarcarea s-a terminat; scheletul sa deseneze alt numar de
 * randuri decat i s-a cerut.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Schelet, useIncet, MESAJ_INCET, STIL_SCHELET } from "./ui/schelet.jsx";

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

describe("Schelet", () => {
  it("e o stare de incarcare pentru cititorul de ecran, cu randurile cerute", async () => {
    const { host } = await deschide(React.createElement(Schelet, { randuri: 4, eticheta: "Verific disponibilitatea…" }));
    const schelet = host.querySelector(".schelet");
    expect(schelet.getAttribute("role")).toBe("status");
    expect(schelet.getAttribute("aria-busy")).toBe("true");
    expect(host.querySelector(".schelet-eticheta").textContent).toBe("Verific disponibilitatea…");
    expect(host.querySelectorAll(".schelet-rand").length).toBe(4);
    expect(host.querySelectorAll(".schelet-rand[aria-hidden='true']").length).toBe(4);
    expect(host.querySelector(".schelet-incet")).toBeNull();
  });

  it("spune ca dureaza mai mult doar cand i se cere", async () => {
    const { host } = await deschide(React.createElement(Schelet, { incet: true }));
    expect(host.querySelector(".schelet-incet").textContent).toBe(MESAJ_INCET);
  });

  it("stilul opreste pulsul pentru cine a cerut mai putina miscare", () => {
    expect(STIL_SCHELET).toMatch(/prefers-reduced-motion:reduce\)\{ \.schelet-linie\{ animation:none; \}/);
  });
});

function Proba({ activ }) {
  const incet = useIncet(activ, 1000);
  return React.createElement("i", null, incet ? "incet" : "ok");
}

describe("useIncet", () => {
  /* Testul care conteaza: nu apare instant, si dispare odata cu asteptarea. */
  it("se aprinde abia dupa prag si se stinge cand asteptarea se termina", async () => {
    vi.useFakeTimers();
    const { host, root } = await deschide(React.createElement(Proba, { activ: true }));
    expect(host.textContent).toBe("ok");
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(host.textContent).toBe("ok");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(host.textContent).toBe("incet");
    await act(async () => { root.render(React.createElement(Proba, { activ: false })); });
    expect(host.textContent).toBe("ok");
  });

  it("o asteptare noua porneste ceasul de la zero", async () => {
    vi.useFakeTimers();
    const { host, root } = await deschide(React.createElement(Proba, { activ: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    await act(async () => { root.render(React.createElement(Proba, { activ: false })); });
    await act(async () => { root.render(React.createElement(Proba, { activ: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(host.textContent).toBe("ok");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(host.textContent).toBe("incet");
  });
});
