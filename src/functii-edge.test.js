/* Apelul catre functiile edge ale PMS-ului — acces (TTLock), dispozitive
 * (Shelly), facturare (Oblio), televizoare (LYNK) — si ce i se spune omului
 * cand apelul nu ajunge.
 *
 * Pana pe 26 septembrie 2026 fiecare serviciu isi avea copia lui, si toate
 * spuneau „Verifică conexiunea" cand cererea nu pleca. Din browser insa, o
 * functie nepublicata (preflight 404, deci CORS), un server cazut si o retea
 * cazuta arata la fel: `FunctionsFetchError`. Doar `navigator.onLine ===
 * false` spune sigur ca e reteaua omului. tv-provider a stat nepublicata opt
 * zile, iar „Verifică conexiunea" de dupa fiecare check-in l-a facut pe
 * receptioner sa creada ca nici rezervarile nu se salvau.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const { supabase } = await import("./supabase.js");
const { cheamaFunctie } = await import("./data/functii-edge.js");
const { cheamaAcces } = await import("./features/acces.jsx");
const { cheamaDispozitiv } = await import("./data/dispozitive.js");
const { cheamaOblio } = await import("./data/oblio.js");
const { cheamaTv } = await import("./data/televizoare.js");

const invoke = supabase.functions.invoke;

/* Ce intoarce supabase-js cand cererea nu pleaca deloc. */
function nuPoateFiContactat() {
  const e = new Error("Failed to send a request to the Edge Function");
  e.name = "FunctionsFetchError";
  e.context = new TypeError("Failed to fetch");
  return { data: null, error: e };
}

beforeEach(() => { invoke.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("cheamaFunctie", () => {
  it("trimite corpul functiei si intoarce raspunsul ei", async () => {
    invoke.mockResolvedValue({ data: { ok: true, n: 3 }, error: null });
    expect(await cheamaFunctie("device-provider", "dispozitive", { action: "refresh" }))
      .toEqual({ ok: true, n: 3 });
    expect(invoke).toHaveBeenCalledWith("device-provider", { body: { action: "refresh" } });
  });

  it("cand functia a raspuns cu eroare, mesajul ei are prioritate", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Yala nu răspunde." }) } },
    });
    expect(await cheamaFunctie("access-provider", "acces", {})).toEqual({ ok: false, error: "Yala nu răspunde." });
  });

  it("online, cand cererea nu pleaca: serviciul nu a raspuns, fara vina pusa pe conexiune", async () => {
    invoke.mockResolvedValue(nuPoateFiContactat());
    const r = await cheamaFunctie("oblio-facturare", "facturare", {});
    expect(r).toEqual({ ok: false, error: "Serviciul de facturare nu a răspuns." });
    expect(r.error).not.toMatch(/conexiun/i);
  });

  it("offline: spune ca lipseste internetul", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    invoke.mockResolvedValue(nuPoateFiContactat());
    expect(await cheamaFunctie("device-provider", "dispozitive", {}))
      .toEqual({ ok: false, error: "Nu există conexiune la internet." });
  });

  it("nu arunca niciodata: o exceptie sau un raspuns gol devin mesaje", async () => {
    invoke.mockRejectedValue(new Error("boom"));
    expect(await cheamaFunctie("tv-provider", "televizoare", {})).toEqual({ ok: false, error: "boom" });
    invoke.mockResolvedValue({ data: null, error: null });
    expect(await cheamaFunctie("tv-provider", "televizoare", {}))
      .toEqual({ ok: false, error: "Răspuns gol de la serviciul de televizoare." });
  });
});

describe("serviciile PMS-ului trec toate pe aici", () => {
  it.each([
    ["acces", cheamaAcces, "access-provider"],
    ["dispozitive", cheamaDispozitiv, "device-provider"],
    ["facturare", cheamaOblio, "oblio-facturare"],
    ["televizoare", cheamaTv, "tv-provider"],
  ])("%s: functia lui, iar cand nu raspunde, spune asta — nu „Verifică conexiunea”", async (serviciu, cheama, functie) => {
    invoke.mockResolvedValue(nuPoateFiContactat());
    const r = await cheama("x", { a: 1 });
    expect(invoke).toHaveBeenCalledWith(functie, { body: { action: "x", a: 1 } });
    expect(r).toEqual({ ok: false, error: `Serviciul de ${serviciu} nu a răspuns.` });
  });
});
