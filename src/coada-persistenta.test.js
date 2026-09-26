/* Coada de salvari tinuta in localStorage, per utilizator (26 septembrie 2026).
 *
 * Pana atunci coada traia doar in memorie: o fila inchisa, un telefon care
 * opreste aplicatia de pe ecranul de start sau o reincarcare pierdeau tacut
 * tot ce astepta internetul. Garda de la inchidere (beforeunload) doar
 * intreba — iar pe iOS, o aplicatie oprita de sistem nu intreaba pe nimeni.
 *
 * PER UTILIZATOR, fiindca randurile nu poarta autorul: jurnalul se semneaza
 * pe server cu sesiunea care trimite. Salvarile lui A trimise din sesiunea
 * lui B ar aparea in jurnal pe numele lui B.
 *
 * Fiecare test ia modulul proaspat (`vi.resetModules`): coada si proprietarul
 * ei sunt stare de modul, ca in aplicatie.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const scrisInBaza = [];
vi.mock("./supabase.js", () => {
  const tabel = (nume) => ({
    upsert: (randuri) => ({
      select: async () => { scrisInBaza.push({ nume, randuri }); return { data: randuri, error: null }; },
    }),
    insert: async (randuri) => { scrisInBaza.push({ nume, randuri }); return { error: null }; },
    delete: () => ({ in: async (_c, ids) => { scrisInBaza.push({ nume, ids }); return { error: null }; } }),
  });
  return { supabase: { from: tabel } };
});

const up = (tabel, rand) => ({ tip: "upsert", tabel, rand });
const ins = (tabel, rand) => ({ tip: "insert", tabel, rand });

let coada, lib, oprire;
async function modulProaspat() {
  vi.resetModules();
  coada = await import("./data/coada.js");
  lib = await import("./lib/coada-salvari.js");
}

const offline = () => vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
const salvat = (utilizator) => lib.opsDinText(localStorage.getItem(coada.cheieCoada(utilizator)));
const lasaSaTreaca = () => new Promise((gata) => setTimeout(gata, 0));

beforeEach(async () => {
  localStorage.clear();
  scrisInBaza.length = 0;
  await modulProaspat();
});
afterEach(() => {
  oprire?.();
  oprire = null;
  vi.restoreAllMocks();
});

describe("coada supravietuieste repornirii", () => {
  it("porneste cu salvarile ramase ale aceluiasi utilizator", async () => {
    offline();
    localStorage.setItem(coada.cheieCoada("u1"), lib.textDinOps([up("reservations", { id: "r-1" })]));
    const laRestaurare = vi.fn();
    const laAmanare = vi.fn();

    oprire = coada.pornesteCoada({ utilizator: "u1", laRestaurare, laAmanare });

    expect(coada.coadaSalvari.lista()).toEqual([up("reservations", { id: "r-1" })]);
    expect(laRestaurare).toHaveBeenCalledWith(1);
    /* „Fără conexiune" e pentru o salvare care tocmai a picat, nu pentru
       ce a ramas de data trecuta. */
    expect(laAmanare).not.toHaveBeenCalled();
  });

  it("orice schimbare a cozii ajunge in localStorage; coada golita sterge cheia", async () => {
    offline();
    oprire = coada.pornesteCoada({ utilizator: "u1" });

    coada.amanaDacaERetea(new TypeError("Failed to fetch"), [ins("activity_log", { action: "Check-in" })]);
    expect(salvat("u1")).toEqual([ins("activity_log", { action: "Check-in" })]);

    coada.coadaSalvari.goleste();
    expect(localStorage.getItem(coada.cheieCoada("u1"))).toBeNull();
  });

  it("cu internet, ce a ramas de data trecuta pleaca imediat, fara sa astepte ceasul", async () => {
    localStorage.setItem(coada.cheieCoada("u1"), lib.textDinOps([up("reservations", { id: "r-1" })]));

    oprire = coada.pornesteCoada({ utilizator: "u1" });
    await lasaSaTreaca();

    expect(scrisInBaza).toEqual([{ nume: "reservations", randuri: [{ id: "r-1" }] }]);
    expect(coada.coadaSalvari.marime()).toBe(0);
    expect(localStorage.getItem(coada.cheieCoada("u1"))).toBeNull();
  });
});

describe("coada e a utilizatorului care a salvat", () => {
  it("dupa schimbarea utilizatorului, cel nou nu primeste salvarile celui dinainte", async () => {
    offline();
    oprire = coada.pornesteCoada({ utilizator: "u1" });
    coada.amanaDacaERetea(new TypeError("Failed to fetch"), [ins("activity_log", { action: "de la u1" })]);
    oprire();

    localStorage.setItem(coada.cheieCoada("u2"), lib.textDinOps([ins("activity_log", { action: "de la u2" })]));
    oprire = coada.pornesteCoada({ utilizator: "u2" });

    expect(coada.coadaSalvari.lista()).toEqual([ins("activity_log", { action: "de la u2" })]);
    expect(salvat("u1")).toEqual([ins("activity_log", { action: "de la u1" })]);
  });

  it("repornirea pentru acelasi utilizator nu dubleaza nimic", async () => {
    offline();
    oprire = coada.pornesteCoada({ utilizator: "u1" });
    coada.amanaDacaERetea(new TypeError("Failed to fetch"), [ins("activity_log", { action: "o data" })]);
    oprire();
    oprire = coada.pornesteCoada({ utilizator: "u1" });

    expect(coada.coadaSalvari.lista()).toEqual([ins("activity_log", { action: "o data" })]);
  });
});

describe("fara localStorage", () => {
  /* Navigare privata, cota plina, blocat de setari: coada merge mai departe
     in memorie, ca inainte, si nimic nu arunca. */
  it("coada merge in memorie si nimic nu arunca", async () => {
    offline();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("SecurityError"); });

    oprire = coada.pornesteCoada({ utilizator: "u1" });
    coada.amanaDacaERetea(new TypeError("Failed to fetch"), [ins("activity_log", { action: "Check-in" })]);
    coada.coadaSalvari.goleste();
    coada.amanaDacaERetea(new TypeError("Failed to fetch"), [ins("activity_log", { action: "Check-out" })]);

    expect(coada.coadaSalvari.lista()).toEqual([ins("activity_log", { action: "Check-out" })]);
  });
});
