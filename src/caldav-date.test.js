/* Interogarile ecranului Evenimente (src/data/caldav.js). Ce s-ar strica
 * tacut: fereastra anului calculata gresit, ori randurile sterse aduse
 * inapoi in calendar. Evenimentele anulate VIN si ele — stau in calendarul
 * gri „Anulate", iar ecranul il tine ascuns pana il ceri (15 septembrie
 * 2026). Un test de randare n-ar prinde asta, acolo stratul de date e
 * mockuit, deci aici se verifica chiar lantul trimis catre PostgREST.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* Clientul Supabase e un lant de metode care se asteapta la capat; stub-ul
   noteaza ce s-a cerut si raspunde cu `raspuns`. */
let apeluri = [];
let raspuns = { data: [], error: null };
function lant() {
  const l = { then: (rezolva) => rezolva(raspuns) };
  for (const m of ["select", "eq", "neq", "lt", "lte", "gt", "gte", "order", "limit", "in", "is"]) {
    l[m] = (...a) => { apeluri.push([m, ...a]); return l; };
  }
  return l;
}
vi.mock("./supabase.js", () => ({
  supabase: { from: (tabel) => { apeluri.push(["from", tabel]); return lant(); } },
}));

const { listeazaEvenimente, numarEvenimente } = await import("./data/caldav.js");

const filtre = () => apeluri.filter((a) => a[0] === "eq").map((a) => [a[1], a[2]]);

beforeEach(() => {
  apeluri = [];
  raspuns = { data: [], error: null };
});

describe("listeazaEvenimente", () => {
  it("cere evenimentele vii din fereastra anului, anulatele incluse", async () => {
    await listeazaEvenimente(2027);
    expect(apeluri[0]).toEqual(["from", "caldav_obiecte"]);
    expect(filtre()).toEqual([["sters", false]]);
    const lt = apeluri.find((a) => a[0] === "lt");
    const gt = apeluri.find((a) => a[0] === "gt");
    expect(lt).toEqual(["lt", "incepe", "2028-01-01T22:00:00.000Z"]);
    expect(gt).toEqual(["gt", "se_termina", "2026-12-30T22:00:00.000Z"]);
    expect(apeluri.find((a) => a[0] === "order")).toEqual(["order", "incepe"]);
  });

  it("intoarce randurile primite si arunca la eroare", async () => {
    raspuns = { data: [{ id: "e1", rezumat: "Botez Maria" }], error: null };
    expect(await listeazaEvenimente(2027)).toEqual([{ id: "e1", rezumat: "Botez Maria" }]);
    raspuns = { data: null, error: new Error("retea") };
    await expect(listeazaEvenimente(2027)).rejects.toThrow("retea");
  });
});

describe("numarEvenimente", () => {
  it("numara pe calendar, fara cele sterse; anulatele se numara la calendarul lor", async () => {
    raspuns = { data: [{ calendar_id: "c1" }, { calendar_id: "c2" }, { calendar_id: "c1" }], error: null };
    expect(await numarEvenimente()).toEqual({ c1: 2, c2: 1 });
    expect(filtre()).toEqual([["sters", false]]);
  });
});
