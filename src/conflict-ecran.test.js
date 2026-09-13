/* Dialogul conflictului de concurenta (faza 3, C5), randat cu componenta
 * reala. Nu pot provoca un conflict real din doua browsere — aplicatia
 * cere autentificare — deci aici se apara ce ar vedea omul: campurile
 * diferite cu numele lor, nu id-uri; marcajul „amandoi"; cele doua
 * butoane si inchiderea, care inseamna „ia pe a lor".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
window.HTMLElement.prototype.scrollIntoView = () => {};

const { ConflictDialog } = await import("./features/conflict.jsx");

const CORE = {
  rooms: [{ id: "c1", name: "1005" }, { id: "c2", name: "1006" }],
  guests: [{ id: "g1", lastName: "Popescu", firstName: "Ana" }],
  billingCustomers: [],
};
const GRUPURI = [{ id: "gr1", name: "Nunta Grand'Or" }];
const BAZA = {
  id: "r1", roomId: "c1", guestId: "g1", groupId: null, checkin: "2026-10-17T11:00:00.000Z",
  checkout: "2026-10-19T09:00:00.000Z", status: "confirmed", adults: 2, children: 0,
  priceOverride: null, bookedPrice: 600, source: "direct", tags: [], notes: "", occupantLastName: "",
  occupantFirstName: "", occupantPhone: "", occupantName: "", messages: [], billingCustomerId: "",
  updatedAt: "2026-09-14T10:00:00.000Z",
};
const A_MEA = { ...BAZA, checkout: "2026-10-20T09:00:00.000Z", notes: "vine târziu" };
const A_LOR = { ...BAZA, status: "checkedin", roomId: "c2", checkout: "2026-10-21T09:00:00+00:00", updatedAt: "2026-09-14T10:05:00+00:00" };
const CINE = { userName: "Razvan", at: "2026-09-14T10:05:00Z", action: "Check-in" };

const montate = [];
async function deschide(randuri, onAlege = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(ConflictDialog, { randuri, core: CORE, groups: GRUPURI, onAlege }));
  });
  return { host, onAlege };
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});
const randuriTabel = (host) => [...host.querySelectorAll("tbody tr")].map((tr) =>
  [...tr.querySelectorAll("th, td")].map((c) => c.textContent));
const buton = (host, text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

describe("ConflictDialog", () => {
  it("arata cine, ce rezervare si campurile diferite, cu nume in loc de id-uri", async () => {
    const { host } = await deschide([{ baza: BAZA, aMea: A_MEA, aLor: A_LOR, cine: CINE }]);
    expect(host.querySelector("h3").textContent).toBe("Modificată între timp");
    expect(host.querySelector(".conflict-titlu").textContent).toBe("Popescu Ana · Camera 1006 · 17.10 → 21.10");
    expect(host.querySelector(".conflict-cine").textContent).toMatch(/^Ultima modificare: Razvan, 14\.09/);
    expect(host.querySelector(".conflict-cine").textContent).toMatch(/Check-in$/);
    expect(randuriTabel(host)).toEqual([
      ["Camera", "1005", "1006"],
      ["Plecareamândoi", "20.10, 12:00", "21.10, 12:00"],
      ["Status", "Confirmată", "Checked-in"],
      ["Note", "vine târziu", "—"],
    ]);
  });

  /* Doar plecarea e schimbata de amandoi (diferit): ea primeste marcajul
     si randul rosu; camera au schimbat-o doar ei, nota doar eu. */
  it("marcheaza ce am schimbat eu, ce au schimbat ei, si ciocnirea", async () => {
    const { host } = await deschide([{ baza: BAZA, aMea: A_MEA, aLor: A_LOR, cine: null }]);
    const linii = [...host.querySelectorAll("tbody tr")];
    expect(linii.map((tr) => tr.className)).toEqual(["", "conflict-amandoi", "", ""]);
    const celule = (i) => [...linii[i].querySelectorAll("td")].map((td) => td.className);
    expect(celule(0)).toEqual(["", "conflict-schimbat"]);            // camera: doar ei
    expect(celule(1)).toEqual(["conflict-schimbat", "conflict-schimbat"]); // plecarea: amandoi
    expect(celule(3)).toEqual(["conflict-schimbat", ""]);            // nota: doar eu
    expect(host.querySelector(".conflict-cine")).toBeNull();
  });

  it("butoanele dau alegerea; inchiderea inseamna „ia pe a lor” (null)", async () => {
    const { host, onAlege } = await deschide([{ baza: BAZA, aMea: A_MEA, aLor: A_LOR, cine: null }]);
    await act(async () => { buton(host, "Păstrează a mea").click(); });
    expect(onAlege).toHaveBeenLastCalledWith("mea");
    await act(async () => { buton(host, "Ia pe a lor").click(); });
    expect(onAlege).toHaveBeenLastCalledWith("lor");
    await act(async () => {
      host.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onAlege).toHaveBeenLastCalledWith(null);
  });

  it("mai multe rezervari, fiecare cu tabelul ei; fara diferente, spune ca doar stampila e mai noua", async () => {
    const r2 = { ...BAZA, id: "r2", groupId: "gr1" };
    const { host } = await deschide([
      { baza: BAZA, aMea: A_MEA, aLor: A_LOR, cine: null },
      { baza: r2, aMea: r2, aLor: { ...r2, updatedAt: "2026-09-14T10:09:00Z" }, cine: null },
    ]);
    expect(host.querySelectorAll(".conflict-rand")).toHaveLength(2);
    expect(host.querySelector(".conflict-intro").textContent).toMatch(/aceleași rezervări/);
    const alDoilea = host.querySelectorAll(".conflict-rand")[1];
    expect(alDoilea.querySelector("table")).toBeNull();
    expect(alDoilea.textContent).toMatch(/doar salvarea lor a fost mai nouă/);
  });
});
