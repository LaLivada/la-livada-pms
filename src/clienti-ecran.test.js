/* Test de RANDARE pentru ecranul Clienti, din acelasi motiv ca fise-ecran:
 * ecranul a trecut pe date de pe server (lista paginata, sumarul pe rand,
 * cautarea, istoricul unui client) si nu-l pot deschide ca sa-l vad —
 * aplicatia cere autentificare. Testul nu verifica cum arata, ci ca
 * cererile pleaca cum trebuie (pagina, textul, limita) si ca ce vine se
 * randeaza fara sa arunce.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { fmtMoney } from "./lib/format.js";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const oaspetiPagina = vi.fn();
const cautaOaspeti = vi.fn();
const sumarOaspeti = vi.fn();
const istoricOaspete = vi.fn();
vi.mock("./data/oaspeti.js", () => ({
  OASPETI_PE_PAGINA: 30, LIMITA_CAUTARE: 20, LIMITA_CAUTARE_LISTA: 100, MIN_LITERE_CAUTARE: 3,
  oaspetiPagina: (...a) => oaspetiPagina(...a),
  cautaOaspeti: (...a) => cautaOaspeti(...a),
  sumarOaspeti: (...a) => sumarOaspeti(...a),
  istoricOaspete: (...a) => istoricOaspete(...a),
  legaturiOaspete: vi.fn(), numarOaspeti: vi.fn(), salveazaOaspete: vi.fn(),
}));

const { ClientsView, GuestHistory } = await import("./features/clienti.jsx");

const ANA = { id: "g1", lastName: "Popescu", firstName: "Ana", phone: "+40 722 111 222", city: "Cluj-Napoca", county: "Cluj", country: "România" };
const DAN = { id: "g2", lastName: "Ionescu", firstName: "Dan", phone: "+40 733 000 111", city: "Vaslui", county: "Vaslui", country: "România" };
const CORE = { rooms: [{ id: "r1", name: "1001", type: "tiny" }], guests: [], billingCustomers: [] };

/* Lasa sa se scurga si promisiunile inlantuite din efect (pagina, apoi
   sumarul): un tick de macrotask, sub act, ca React sa aplice starile. */
const asteapta = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function scrie(input, valoare) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, valoare);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function randeaza(element) {
  const gazda = document.createElement("div");
  document.body.appendChild(gazda);
  await act(async () => { createRoot(gazda).render(element); });
  await asteapta();
  return gazda;
}

describe("ClientsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
    oaspetiPagina.mockResolvedValue({ oaspeti: [ANA, DAN], total: 2 });
    sumarOaspeti.mockResolvedValue(new Map([["g1", { sejururi: 3, nopti: 5, incasat: 1200, ultimaSosire: "2026-09-01T11:00:00Z" }]]));
    cautaOaspeti.mockResolvedValue([ANA]);
  });

  const ecran = () => React.createElement(ClientsView, {
    core: CORE, groups: [], reservations: [], blocks: [],
    updateCore: vi.fn(), updateGroups: vi.fn(), updateReservations: vi.fn(),
    stergeRezervari: vi.fn(), stergeGrupuri: vi.fn(), stergeOaspete: vi.fn(), salveazaOaspete: vi.fn(),
    onNewGroup: vi.fn(),
  });

  it("cere prima pagina de pe server si arata sumarul pe fiecare rand", async () => {
    const g = await randeaza(ecran());
    expect(oaspetiPagina).toHaveBeenCalledWith(1);
    expect(sumarOaspeti).toHaveBeenCalledWith(["g1", "g2"]);
    expect(g.textContent).toContain("Popescu Ana");
    expect(g.textContent).toContain("Ionescu Dan");
    expect(g.textContent).toContain("3 sejururi · 5 nopți · " + fmtMoney(1200));
    /* Dan n-are niciun sejur viu: fara rand de sumar, nu „0 sejururi". */
    expect(g.textContent).not.toContain("0 sejururi");
    expect(g.textContent).toContain("2 clienți");
  });

  it("cauta pe server abia de la 3 caractere, dupa pauza, cu plafonul listei", async () => {
    const g = await randeaza(ecran());
    const input = g.querySelector("input[placeholder^='Caută']");
    scrie(input, "po");
    await asteapta(320);
    expect(cautaOaspeti).not.toHaveBeenCalled();
    expect(g.textContent).toContain("cel puțin 3 caractere");

    scrie(input, "pop");
    await asteapta(320);
    expect(cautaOaspeti).toHaveBeenCalledTimes(1);
    expect(cautaOaspeti).toHaveBeenCalledWith("pop", 100);
    expect(g.textContent).toContain("Popescu Ana");
    expect(g.textContent).not.toContain("Ionescu Dan");
    expect(g.textContent).toContain("1 clienți");
  });

  it("spune cand lista nu s-a putut incarca, in loc sa arate „niciun client”", async () => {
    oaspetiPagina.mockRejectedValue(new Error("Failed to fetch"));
    const g = await randeaza(ecran());
    expect(g.textContent).toContain("Nu am putut încărca clienții");
    expect(g.textContent).not.toContain("Adaugă primul client");
  });
});

describe("GuestHistory", () => {
  beforeEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

  it("aduce sejururile si sumarul de pe server, nu din fereastra din browser", async () => {
    istoricOaspete.mockResolvedValue({
      sejururi: [{ id: "rez-1", roomId: "r1", guestId: "g1", status: "checkedout", source: "phone",
        checkin: "2026-09-01T11:00:00Z", checkout: "2026-09-03T08:00:00Z" }],
      total: 1,
    });
    sumarOaspeti.mockResolvedValue(new Map([["g1", { sejururi: 3, nopti: 5, incasat: 1200, ultimaSosire: "2026-09-01T11:00:00Z" }]]));
    const g = await randeaza(React.createElement(GuestHistory, { guest: ANA, core: CORE, onClose: vi.fn() }));
    expect(istoricOaspete).toHaveBeenCalledWith("g1", 1);
    expect(sumarOaspeti).toHaveBeenCalledWith(["g1"]);
    expect(g.textContent).toContain("1001");
    expect(g.textContent).toContain("2 nopți");
    expect(g.textContent).toContain(fmtMoney(1200));
  });

  it("arata starea goala pentru un client fara sejururi", async () => {
    istoricOaspete.mockResolvedValue({ sejururi: [], total: 0 });
    sumarOaspeti.mockResolvedValue(new Map());
    const g = await randeaza(React.createElement(GuestHistory, { guest: DAN, core: CORE, onClose: vi.fn() }));
    expect(g.textContent).toContain("Niciun sejur înregistrat");
  });
});
