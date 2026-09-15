/* „Inapoi" pe telefon inchide fereastra deschisa (interfata noua), randat cu
 * Dialog-ul real. Ce s-ar strica tacut: fereastra sa nu mai puna intrarea in
 * istoric (inapoi ar iesi din PMS), sau interfata actuala sa inceapa si ea
 * sa scrie in istoric.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Dialog } from "./ui/primitive.jsx";
import { InterfataProvider } from "./ui/interfata.jsx";
import { existaFerestreDeschise } from "./ui/istoric.jsx";
import { CHEIE_INTERFATA } from "./lib/interfata.js";

const montate = [];
async function deschide(onClose) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(InterfataProvider, null,
      React.createElement(Dialog, { title: "Probă", onClose }, "conținut")));
  });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
  localStorage.removeItem(CHEIE_INTERFATA);
});
const inapoi = async () => { await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); }); };

describe("Dialog si istoricul browserului", () => {
  it("interfata noua: fereastra pune o intrare, iar „inapoi” o inchide", async () => {
    localStorage.setItem(CHEIE_INTERFATA, "noua");
    const onClose = vi.fn();
    const inainte = history.state?.pmsFereastra || null;
    await deschide(onClose);
    expect(history.state?.pmsFereastra).toBeTruthy();
    expect(history.state.pmsFereastra).not.toBe(inainte);
    expect(existaFerestreDeschise()).toBe(true);
    await inapoi();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("interfata actuala: nimic in istoric, „inapoi” nu inchide nimic", async () => {
    localStorage.setItem(CHEIE_INTERFATA, "actuala");
    const onClose = vi.fn();
    const inainte = history.state?.pmsFereastra || null;
    await deschide(onClose);
    expect(history.state?.pmsFereastra || null).toBe(inainte);
    expect(existaFerestreDeschise()).toBe(false);
    await inapoi();
    expect(onClose).not.toHaveBeenCalled();
  });
});
