/* „Inapoi" pe telefon inchide fereastra deschisa, randat cu Dialog-ul real.
 * Ce s-ar strica tacut: fereastra sa nu mai puna intrarea in istoric
 * (inapoi ar iesi din PMS), sau un telefon ramas cu „Actuală" in
 * localStorage — alegerea comutatorului scos pe 26 septembrie 2026 — sa
 * piarda in continuare „inapoi".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Dialog } from "./ui/primitive.jsx";
import { TemaProvider } from "./ui/tema.jsx";
import { existaFerestreDeschise } from "./ui/istoric.jsx";

/* Cheia sub care comutatorul isi tinea alegerea pe dispozitiv. */
const CHEIE_VECHE = "pms:interfata";

const montate = [];
async function deschide(onClose) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(TemaProvider, null,
      React.createElement(Dialog, { title: "Probă", onClose }, "conținut")));
  });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
  localStorage.removeItem(CHEIE_VECHE);
});
const inapoi = async () => { await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); }); };

async function fereastraSeInchideCuInapoi() {
  const onClose = vi.fn();
  const inainte = history.state?.pmsFereastra || null;
  await deschide(onClose);
  expect(history.state?.pmsFereastra).toBeTruthy();
  expect(history.state.pmsFereastra).not.toBe(inainte);
  expect(existaFerestreDeschise()).toBe(true);
  await inapoi();
  expect(onClose).toHaveBeenCalledTimes(1);
}

describe("Dialog si istoricul browserului", () => {
  it("fereastra pune o intrare, iar „inapoi” o inchide", fereastraSeInchideCuInapoi);

  it("la fel pe un telefon ramas cu „Actuală” de la comutatorul scos", async () => {
    localStorage.setItem(CHEIE_VECHE, "actuala");
    await fereastraSeInchideCuInapoi();
  });
});
