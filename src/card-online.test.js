/* Cardul „De pe site", randat cu componenta reala.
 *
 * Testele de langa el (rezervari-online.test.js) apara regulile; astea apara
 * legatura dintre ele si ecran. Ce s-ar strica tacut: cardul sa se randeze
 * gol fiindca cineva a schimbat numele campului de sursa, sau eticheta de
 * anulare sa dispara — o anulare venita de pe site ar arata atunci exact ca
 * o rezervare buna.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn().mockResolvedValue({ ok: true }),
}));

const { CardOnline } = await import("./features/rezervari.jsx");

const CORE = {
  rooms: [{ id: "r1002", name: "1002", type: "tiny", capacity: 4 }],
  guests: [],
  rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  onlinePricing: [], tags: [],
};

const rez = (over) => ({
  id: "x", roomId: "r1002", source: "site", status: "confirmed",
  checkin: "2026-09-12T11:00:00Z", checkout: "2026-09-14T08:00:00Z",
  adults: 2, children: 0, tags: [], messages: [],
  createdAt: "2026-09-10T09:00:00Z", bookedPrice: 600,
  ...over,
});

const montate = [];

async function randeaza(rezervari) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(CardOnline, {
      rezervari, core: CORE,
      numeOaspete: (r) => `Oaspete ${r.id}`,
      numeCamera: (id) => id.replace("r", ""),
      onDeschide: () => {},
    }));
  });
  return host;
}

afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

const randuri = (host) => [...host.querySelectorAll(".list-row")];

describe("CardOnline", () => {
  it("arata doar rezervarile de pe site, cele mai noi intai", async () => {
    const host = await randeaza([
      rez({ id: "veche", createdAt: "2026-09-01T09:00:00Z" }),
      rez({ id: "noua",  createdAt: "2026-09-10T09:00:00Z" }),
      rez({ id: "de-la-receptie", source: "direct", createdAt: "2026-09-10T10:00:00Z" }),
    ]);
    const nume = randuri(host).map((r) => r.querySelector(".primary").textContent);
    expect(nume).toEqual(["Oaspete noua", "Oaspete veche"]);
  });

  it("nu arata mai mult de cinci", async () => {
    const host = await randeaza(Array.from({ length: 8 }, (_, i) =>
      rez({ id: `r${i}`, createdAt: `2026-09-0${i + 1}T09:00:00Z` })));
    expect(randuri(host)).toHaveLength(5);
  });

  /* O anulare venita de pe site e exact vestea pentru care exista cardul.
     Fara eticheta, randul arata identic cu o rezervare buna. */
  it("marcheaza anularea, si numai ce nu e confirmat", async () => {
    const host = await randeaza([
      rez({ id: "anulata", status: "cancelled", createdAt: "2026-09-10T10:00:00Z" }),
      rez({ id: "buna", createdAt: "2026-09-10T09:00:00Z" }),
    ]);
    const [prima, adoua] = randuri(host);
    expect(prima.querySelector(".role-tag").textContent).toMatch(/Anulat/i);
    expect(prima.querySelector(".co-moarta")).toBeTruthy();
    expect(adoua.querySelector(".role-tag")).toBeNull();
  });

  it("spune cand a intrat fiecare", async () => {
    const host = await randeaza([rez({ createdAt: new Date().toISOString() })]);
    expect(randuri(host)[0].querySelector(".co-cand").textContent).toBe("chiar acum");
  });

  it("spune limpede cand nu e nimic, in loc sa dispara", async () => {
    const host = await randeaza([rez({ source: "booking" })]);
    expect(randuri(host)).toHaveLength(0);
    expect(host.querySelector(".section-empty").textContent).toMatch(/Nicio rezervare de pe site/);
  });
});
