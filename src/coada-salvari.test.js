/* Coada de salvari (faza 3, C8) — regulile pure din lib/coada-salvari.js.
 *
 * Ce s-ar strica tacut: un verdict al bazei (drepturi, suprapunere,
 * conflict) sa fie luat drept „retea" si reincercat la nesfarsit; doua
 * salvari ale aceluiasi rand sa plece amandoua, cu cea veche ultima; o
 * stergere sa fie urmata de un upsert al randului sters; o eroare de retea
 * in mijlocul cozii sa arunce restul.
 */
import { describe, it, expect, vi } from "vitest";
import { esteEroareDeRetea, creeazaCoada, primulLot, opsDinText, textDinOps } from "./lib/coada-salvari.js";

describe("esteEroareDeRetea", () => {
  it("esecurile de transport, in formele lor reale", () => {
    expect(esteEroareDeRetea({ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" })).toBe(true);
    expect(esteEroareDeRetea(new TypeError("Failed to fetch"))).toBe(true);
    expect(esteEroareDeRetea({ message: "NetworkError when attempting to fetch resource." })).toBe(true);
    expect(esteEroareDeRetea({ message: "Load failed" })).toBe(true);
    expect(esteEroareDeRetea({ message: "Serverul nu a răspuns în timp util.", retea: true })).toBe(true);
  });

  /* Testul care conteaza: un verdict are `code` si nu se reincearca. */
  it("un verdict al bazei nu e retea, chiar daca textul suna a retea", () => {
    expect(esteEroareDeRetea({ code: "40001", message: "modificata de altcineva" })).toBe(false);
    expect(esteEroareDeRetea({ code: "23P01", message: "fara_suprapunere" })).toBe(false);
    expect(esteEroareDeRetea({ code: "PGRST301", message: "network timeout at gateway" })).toBe(false);
    expect(esteEroareDeRetea({ message: "Nu ai dreptul" })).toBe(false);
    expect(esteEroareDeRetea(null)).toBe(false);
  });

  it("cand browserul stie ca e offline, orice esec e de retea", () => {
    expect(esteEroareDeRetea({ message: "orice" }, false)).toBe(true);
  });
});

const up = (tabel, rand, extra = {}) => ({ tip: "upsert", tabel, rand, ...extra });
const del = (tabel, id) => ({ tip: "delete", tabel, id });
const ins = (tabel, rand) => ({ tip: "insert", tabel, rand });

describe("creeazaCoada — adauga", () => {
  it("a doua salvare a aceluiasi rand o inlocuieste pe prima, pe locul ei", () => {
    const c = creeazaCoada();
    c.adauga(up("reservations", { id: "r1", notes: "a" }));
    c.adauga(up("reservations", { id: "r2", notes: "b" }));
    c.adauga(up("reservations", { id: "r1", notes: "c" }));
    expect(c.lista().map((o) => o.rand.id + ":" + o.rand.notes)).toEqual(["r1:c", "r2:b"]);
  });

  it("o stergere scoate upsert-urile randului si nu se dubleaza", () => {
    const c = creeazaCoada();
    c.adauga(up("reservations", { id: "r1" }));
    c.adauga(del("reservations", "r1"));
    c.adauga(del("reservations", "r1"));
    expect(c.lista()).toEqual([del("reservations", "r1")]);
  });

  it("acelasi id in tabele diferite sunt randuri diferite", () => {
    const c = creeazaCoada();
    c.adauga(up("reservations", { id: "x" }));
    c.adauga(up("res_groups", { id: "x" }));
    expect(c.marime()).toBe(2);
  });

  it("room_status se identifica dupa room_id, nu dupa id", () => {
    const c = creeazaCoada();
    c.adauga(up("room_status", { room_id: "c1", status: "dirty" }, { onConflict: "room_id", cheie: "room_id" }));
    c.adauga(up("room_status", { room_id: "c1", status: "clean" }, { onConflict: "room_id", cheie: "room_id" }));
    expect(c.lista()).toHaveLength(1);
    expect(c.lista()[0].rand.status).toBe("clean");
  });

  it("intrarile de jurnal se aduna, nu se inlocuiesc", () => {
    const c = creeazaCoada();
    c.adauga(ins("activity_log", { action: "A" }));
    c.adauga(ins("activity_log", { action: "B" }));
    expect(c.marime()).toBe(2);
  });

  it("anunta ascultatorii la fiecare schimbare", () => {
    const c = creeazaCoada();
    const f = vi.fn();
    const stop = c.asculta(f);
    c.adauga(up("t", { id: "1" }));
    c.goleste();
    expect(f).toHaveBeenCalledTimes(2);
    stop();
    c.adauga(up("t", { id: "2" }));
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("primulLot", () => {
  it("grupeaza operatiile consecutive de acelasi fel pe acelasi tabel", () => {
    const ops = [up("reservations", { id: "1" }), up("reservations", { id: "2" }), del("reservations", "3"), up("reservations", { id: "4" })];
    expect(primulLot(ops)).toHaveLength(2);
    expect(primulLot(ops.slice(2))).toHaveLength(1);
  });
  it("tabele sau chei de conflict diferite nu se amesteca", () => {
    expect(primulLot([up("a", { id: "1" }), up("b", { id: "2" })])).toHaveLength(1);
    expect(primulLot([up("room_status", { room_id: "c" }, { onConflict: "room_id" }), up("room_status", { room_id: "d" })])).toHaveLength(1);
    expect(primulLot([])).toEqual([]);
  });
});

describe("creeazaCoada — ruleaza", () => {
  it("trimite loturile in ordine si goleste coada", async () => {
    const c = creeazaCoada();
    c.adauga(up("reservations", { id: "1" }));
    c.adauga(up("reservations", { id: "2" }));
    c.adauga(del("reservations", "3"));
    const executa = vi.fn(async (lot) => lot.map((o) => ({ id: o.rand?.id || o.id, updated_at: "acum" })));
    const r = await c.ruleaza(executa);
    expect(executa).toHaveBeenCalledTimes(2);
    expect(executa.mock.calls[0][0]).toHaveLength(2);
    expect(r.scrise).toHaveLength(2);
    expect(r.esuate).toEqual([]);
    expect(r.oprit).toBe(false);
    expect(c.marime()).toBe(0);
  });

  /* Testul care conteaza: reteaua cade din nou la al doilea lot — primul e
     scris si scos, restul ramane pentru data viitoare, in ordine. */
  it("la o eroare de retea se opreste si pastreaza restul", async () => {
    const c = creeazaCoada();
    c.adauga(up("a", { id: "1" }));
    c.adauga(up("b", { id: "2" }));
    c.adauga(up("c", { id: "3" }));
    let apel = 0;
    const executa = vi.fn(async () => { apel++; if (apel === 2) throw new TypeError("Failed to fetch"); return []; });
    const r = await c.ruleaza(executa);
    expect(r.oprit).toBe(true);
    expect(r.scrise).toHaveLength(1);
    expect(c.lista().map((o) => o.tabel)).toEqual(["b", "c"]);
  });

  it("un verdict al bazei scoate lotul, il raporteaza si merge mai departe", async () => {
    const c = creeazaCoada();
    c.adauga(up("a", { id: "1" }));
    c.adauga(up("b", { id: "2" }));
    const executa = vi.fn(async (lot) => { if (lot[0].tabel === "a") throw { code: "40001", message: "modificata de altcineva" }; return []; });
    const r = await c.ruleaza(executa);
    expect(r.esuate).toHaveLength(1);
    expect(r.esuate[0].eroare.code).toBe("40001");
    expect(r.scrise).toHaveLength(1);
    expect(c.marime()).toBe(0);
  });

  it("nu ruleaza de doua ori deodata", async () => {
    const c = creeazaCoada();
    c.adauga(up("a", { id: "1" }));
    let elibereaza;
    const executa = vi.fn(() => new Promise((r) => { elibereaza = r; }));
    const prima = c.ruleaza(executa);
    expect(c.inCurs()).toBe(true);
    const aDoua = await c.ruleaza(executa);
    expect(aDoua).toEqual({ scrise: [], esuate: [], oprit: false });
    expect(executa).toHaveBeenCalledTimes(1);
    elibereaza([]);
    await prima;
    expect(c.inCurs()).toBe(false);
    expect(c.marime()).toBe(0);
  });

  it("o operatie adaugata in timpul rularii pleaca in aceeasi rulare", async () => {
    const c = creeazaCoada();
    c.adauga(up("a", { id: "1" }));
    const executa = vi.fn(async (lot) => { if (lot[0].rand.id === "1") c.adauga(up("a", { id: "2" })); return []; });
    await c.ruleaza(executa);
    expect(executa).toHaveBeenCalledTimes(2);
    expect(c.marime()).toBe(0);
  });
});

/* Coada care supravietuieste repornirii (26 septembrie 2026): pana atunci
   traia doar in memorie, deci o fila inchisa sau o aplicatie de pe ecranul
   de start oprita de iOS pierdea tacut tot ce astepta internetul. Ce vine
   din localStorage e mai VECHI decat ce e deja in memorie. */
describe("creeazaCoada — restaureaza", () => {
  it("operatiile de data trecuta trec in fata celor din memorie", () => {
    const c = creeazaCoada();
    c.adauga(up("reservations", { id: "nou" }));
    c.restaureaza([up("reservations", { id: "vechi" }), ins("activity_log", { action: "Check-in" })]);
    expect(c.lista().map((o) => o.rand.id || o.rand.action)).toEqual(["vechi", "Check-in", "nou"]);
  });

  it("o salvare din memorie a aceluiasi rand ramane ultima forma", () => {
    const c = creeazaCoada();
    c.adauga(up("reservations", { id: "r1", notes: "nou" }));
    c.restaureaza([up("reservations", { id: "r1", notes: "vechi" })]);
    expect(c.lista().map((o) => o.rand.notes)).toEqual(["nou"]);
  });

  it("o stergere din memorie scoate upsert-ul restaurat al randului", () => {
    const c = creeazaCoada();
    c.adauga(del("reservations", "r1"));
    c.restaureaza([up("reservations", { id: "r1" })]);
    expect(c.lista()).toEqual([del("reservations", "r1")]);
  });

  it("spune cate operatii au venit de data trecuta si anunta o singura data", () => {
    const c = creeazaCoada();
    const f = vi.fn();
    c.asculta(f);
    expect(c.restaureaza([up("a", { id: "1" }), up("a", { id: "1" }), ins("b", { x: 1 })])).toBe(2);
    expect(f).toHaveBeenCalledTimes(1);
    expect(c.restaureaza([])).toBe(0);
  });

  /* Un lot in zbor se scotea dupa POZITIE (primele N). Daca intre timp coada
     se rearanjeaza — restaurarea pune operatii in fata — pozitia nu mai
     inseamna lotul, iar trimiterea reusita ar fi scos operatiile restaurate,
     netrimise. Se scot exact operatiile lotului. */
  it("o restaurare in timpul unei rulari nu scoate operatiile restaurate", async () => {
    const c = creeazaCoada();
    c.adauga(up("a", { id: "in-zbor" }));
    let elibereaza;
    const trimise = [];
    const executa = vi.fn((lot) => {
      trimise.push(...lot.map((o) => o.rand.id));
      return trimise.length === 1 ? new Promise((r) => { elibereaza = r; }) : Promise.resolve([]);
    });
    const rulare = c.ruleaza(executa);
    c.restaureaza([up("b", { id: "restaurat" })]);
    elibereaza([]);
    await rulare;
    expect(trimise).toEqual(["in-zbor", "restaurat"]);
    expect(c.marime()).toBe(0);
  });
});

describe("opsDinText / textDinOps", () => {
  it("ce se scrie se citeste inapoi la fel", () => {
    const ops = [up("room_status", { room_id: "r1001", status: "dirty" }, { onConflict: "room_id", cheie: "room_id" }),
      del("reservations", "r-9"), ins("activity_log", { action: "Check-in", detail: "1001" })];
    expect(opsDinText(textDinOps(ops))).toEqual(ops);
  });

  /* Ce e in localStorage poate fi orice: o versiune veche a formatului, un
     JSON taiat de o scriere intrerupta, o operatie fara tabel. Nimic din
     astea nu are voie sa opreasca pornirea aplicatiei. */
  it("JSON stricat, alt format sau operatii fara forma se lasa deoparte", () => {
    expect(opsDinText(null)).toEqual([]);
    expect(opsDinText("{nu e json")).toEqual([]);
    expect(opsDinText(JSON.stringify([up("a", { id: "1" })]))).toEqual([]);
    expect(opsDinText(JSON.stringify({ v: 2, ops: [up("a", { id: "1" })] }))).toEqual([]);
    const bune = [up("a", { id: "1" }), del("b", "2"), ins("c", { x: 1 })];
    const rele = [{ tip: "drop", tabel: "a" }, { tip: "upsert", tabel: "", rand: {} }, { tip: "upsert", tabel: "a" },
      { tip: "delete", tabel: "b" }, { tip: "insert", tabel: "c", rand: "text" }, null, 7];
    expect(opsDinText(JSON.stringify({ v: 1, ops: [...rele, ...bune] }))).toEqual(bune);
  });
});
