/* Test de randare pentru ecranele de grup — al doilea din repo, dupa cel de
 * la fise (vezi fise-ecran.test.js pentru motivul general: nu pot deschide
 * aplicatia, deci "a compilat" nu e dovada ca merge).
 *
 * Motivul PUNCTUAL de aici: pe 9 septembrie 2026, grupul "Nunta Grand'Or
 * 12.09" arata 13 camere in ecranul de grup si 12 pe calendar. Camera 1003
 * (Cristofor Ionut) avea rezervarea anulata; niciunul din cele trei locuri
 * care construiesc listele de grup (GroupEditor, GroupPrint, GroupsView) nu
 * se uita la status, deci o numarau si o insumau ca activa. Testele de aici
 * fixeaza exact acel caz: un grup cu o camera vie si una anulata, verificat
 * pe fiecare din cele trei ecrane.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
/* acces.jsx aduce dupa el lib/acces.js si un lant intreg spre Supabase —
   irelevant pentru randare, si costisitor de instantiat in test. */
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn(),
}));

const { GroupEditor, GroupPrint, GroupsView } = await import("./features/grupuri.jsx");

const CORE = {
  rooms: [
    { id: "r1002", name: "1002", type: "tiny", capacity: 2 },
    { id: "r1003", name: "1003", type: "tiny", capacity: 2 },
  ],
  guests: [{ id: "g1", lastName: "Grand'Or", firstName: "Nunta" }],
  rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  onlinePricing: [],
};

const GROUP = {
  id: "a37rrx9l", name: "Nunta Grand'Or 12.09", mainGuestId: "g1",
  createdAt: "2026-08-01T00:00:00Z",
};

/* `occupantName` e campul COMPUS, calculat de `camelRes` in mapari.js din
   occupantLastName+occupantFirstName la citirea din baza — nu se completeaza
   singur aici. O fixtura care are doar cele doua campuri despartite, fara
   si pe cel compus, nu reproduce forma reala pe care o vede componenta, si
   `occupantName()` din lib/nume.js ar cadea pe numele grupului in loc de al
   ocupantului — exact ce s-a intamplat prima data cand am scris testul asta. */
const VIE = {
  id: "jpadt6gt", roomId: "r1002", groupId: "a37rrx9l", status: "confirmed",
  checkin: "2026-09-12T05:00:00Z", checkout: "2026-09-13T08:00:00Z",
  adults: 2, children: 0,
  occupantLastName: "Patap", occupantFirstName: "Simion", occupantPhone: "0722111222",
  occupantName: "Patap Simion",
  source: "direct", tags: [], messages: [],
};
const ANULATA = {
  ...VIE, id: "lx7gp3yn", roomId: "r1003", status: "cancelled",
  occupantLastName: "Cristofor", occupantFirstName: "Ionut", occupantName: "Cristofor Ionut",
};
const REZ = [VIE, ANULATA];

const NOOP = async () => true;

async function randeaza(Comp, props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => { createRoot(host).render(React.createElement(Comp, props)); });
  return host;
}

describe("GroupEditor — camera anulata nu intra in cifre, dar ramane in lista", () => {
  it("numara doar camerele vii la 'camere', nu pe cea anulata", async () => {
    const g = await randeaza(GroupEditor, {
      group: GROUP, core: CORE, groups: [GROUP], updateGroups: NOOP,
      reservations: REZ, updateReservations: NOOP, blocks: [],
      onClose: () => {}, onPrint: () => {},
    });
    // "1" camere (doar r1002), nu "2" — asta era 13 in loc de 12 pe productie.
    expect(g.querySelector(".group-summary").textContent).toContain("1");
    expect(g.querySelector(".group-summary").textContent).not.toMatch(/^2\s*camere/);
  });

  it("arata camera anulata in lista, marcata, dar fara controale de editare", async () => {
    const g = await randeaza(GroupEditor, {
      group: GROUP, core: CORE, groups: [GROUP], updateGroups: NOOP,
      reservations: REZ, updateReservations: NOOP, blocks: [],
      onClose: () => {}, onPrint: () => {},
    });
    expect(g.textContent).toContain("Cristofor Ionut");
    expect(g.textContent).toContain("Anulată");
    // Randul viu are select de schimbat camera; cel anulat n-are voie sa aiba.
    const selecturi = g.querySelectorAll(".grp-row select");
    expect(selecturi.length).toBe(1);
  });

  it("explica de ce numerele de sus nu se potrivesc cu randurile din lista", async () => {
    const g = await randeaza(GroupEditor, {
      group: GROUP, core: CORE, groups: [GROUP], updateGroups: NOOP,
      reservations: REZ, updateReservations: NOOP, blocks: [],
      onClose: () => {}, onPrint: () => {},
    });
    expect(g.textContent).toContain("O cameră anulată nu intră");
  });
});

describe("GroupPrint — camera anulata nu apare pe lista tiparita", () => {
  it("nu tipareste un oaspete anulat si nu-l aduna la total", async () => {
    const g = await randeaza(GroupPrint, { group: GROUP, core: CORE, reservations: REZ, onClose: () => {} });
    expect(g.textContent).toContain("Patap");
    expect(g.textContent).not.toContain("Cristofor");
    // Randul din tabel + randul din footer spun amandoua "1", nu "2".
    expect(g.querySelector(".rooming tbody").children.length).toBe(1);
  });
});

describe("GroupsView — eticheta de camere din lista de grupuri", () => {
  it("nu arata camera anulata printre etichetele grupului", async () => {
    const g = await randeaza(GroupsView, {
      core: CORE, groups: [GROUP], updateGroups: NOOP,
      reservations: REZ, updateReservations: NOOP, blocks: [],
    });
    const etichete = [...g.querySelectorAll(".room-tag")].map((n) => n.textContent);
    expect(etichete).toContain("1002");
    expect(etichete).not.toContain("1003");
  });
});
