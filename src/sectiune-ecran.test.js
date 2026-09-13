/* Sectiunea pliabila (faza 3, C4), randata cu componenta reala: capul e
 * buton cu aria-expanded, corpul ramane in DOM dar ascuns, rezumatul se
 * vede doar pliat.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SectiunePliabila } from "./ui/sectiune.jsx";

function Gazda({ initial }) {
  const [deschis, setDeschis] = useState(initial);
  return React.createElement(SectiunePliabila,
    { id: "s1", titlu: "Oaspete", rezumat: "Popescu Ana · 2 adulți", deschis, onComuta: () => setDeschis((v) => !v) },
    React.createElement("input", { "data-test": "camp", defaultValue: "x" }));
}

const montate = [];
async function deschide(initial) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(Gazda, { initial })); });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("SectiunePliabila", () => {
  it("pliata: rezumatul in cap, corpul ascuns dar prezent", async () => {
    const host = await deschide(false);
    const cap = host.querySelector(".pliabil-cap");
    expect(cap.getAttribute("aria-expanded")).toBe("false");
    expect(cap.getAttribute("aria-controls")).toBe("s1-corp");
    expect(host.querySelector(".pliabil-rezumat").textContent).toBe("Popescu Ana · 2 adulți");
    const corp = host.querySelector("#s1-corp");
    expect(corp.hidden).toBe(true);
    expect(corp.querySelector("[data-test=camp]")).not.toBeNull();
  });

  it("desfacuta: fara rezumat, corpul vizibil; comutarea pastreaza ce e scris in camp", async () => {
    const host = await deschide(true);
    expect(host.querySelector(".pliabil-cap").getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".pliabil-rezumat")).toBeNull();
    expect(host.querySelector("#s1-corp").hidden).toBe(false);
    const camp = host.querySelector("[data-test=camp]");
    camp.value = "scris";
    await act(async () => { host.querySelector(".pliabil-cap").click(); });
    expect(host.querySelector("#s1-corp").hidden).toBe(true);
    await act(async () => { host.querySelector(".pliabil-cap").click(); });
    expect(host.querySelector("#s1-corp").hidden).toBe(false);
    expect(host.querySelector("[data-test=camp]").value).toBe("scris");
  });

  it("capul e buton de tip button — nu trimite formularul", async () => {
    const host = await deschide(false);
    expect(host.querySelector(".pliabil-cap").getAttribute("type")).toBe("button");
    const onComuta = vi.fn();
    void onComuta;
  });
});
