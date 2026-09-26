/* Drumul din browser catre Oblio (data/oblio.js): setarile din app_state
 * (lipsa = oprit; salvarea normalizeaza CIF-ul si seria) si apelul functiei
 * edge, care intoarce mereu {ok, ...} — inclusiv mesajul functiei la HTTP
 * 4xx/5xx si un mesaj de om la caderea retelei. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const stare = new Map();
/* Citirea stricta merge direct la tabela, nu prin loadShared: mimam lantul
   from().select().eq().maybeSingle() cu raspunsul pe care-l cere testul. */
let raspunsAppState = { data: null, error: null };
vi.mock("./supabase.js", () => ({
  supabase: {
    functions: { invoke: (...a) => invoke(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => raspunsAppState }) }) }),
  },
}));
vi.mock("./data/stare-partajata.js", () => ({
  loadShared: vi.fn(async (k, f) => (stare.has(k) ? stare.get(k) : f)),
  saveShared: vi.fn(async (k, v) => { stare.set(k, v); return true; }),
}));
const { setariOblio, setariOblioStrict, salveazaSetariOblio, oblioActiv, cheamaOblio, CHEIE_OBLIO, SETARI_OBLIO_GOALE } = await import("./data/oblio.js");

beforeEach(() => { invoke.mockReset(); stare.clear(); raspunsAppState = { data: null, error: null }; });

describe("setarile Oblio", () => {
  it("lipsa = oprit, cu campurile goale", async () => {
    expect(await setariOblio()).toEqual({ activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false });
    expect(oblioActiv(await setariOblio())).toBe(false);
    expect(oblioActiv(null)).toBe(false);
  });
  it("salvarea normalizeaza CIF-ul si seria, iar citirea completeaza campurile lipsa", async () => {
    await salveazaSetariOblio({ activ: true, cif: " ro123 ", serie: " LL " });
    expect(stare.get(CHEIE_OBLIO)).toEqual({ ...SETARI_OBLIO_GOALE, activ: true, cif: "RO123", serie: "LL" });
    stare.set(CHEIE_OBLIO, { activ: true, cif: "RO1" });
    expect(await setariOblio()).toEqual({ activ: true, cif: "RO1", serie: "", punctLucru: "Sediu", trimiteEFactura: false });
    expect(oblioActiv(await setariOblio())).toBe(true);
  });
});

/* De ce stricta: la emitere, o citire esuata care intoarce „oprit" ar trimite
 * factura pe drumul local, cu un numar fara pereche in Oblio. */
describe("setariOblioStrict", () => {
  it("arunca eroarea de citire in loc s-o inghita", async () => {
    raspunsAppState = { data: null, error: { message: "network" } };
    await expect(setariOblioStrict()).rejects.toMatchObject({ message: "network" });
  });
  it("randul lipsa nu e eroare: setarile goale, adica oprit", async () => {
    raspunsAppState = { data: null, error: null };
    expect(await setariOblioStrict()).toEqual({ ...SETARI_OBLIO_GOALE });
    expect(oblioActiv(await setariOblioStrict())).toBe(false);
  });
  it("completeaza campurile lipsa peste randul citit", async () => {
    raspunsAppState = { data: { value: { activ: true, cif: "RO1", serie: "LL" } }, error: null };
    expect(await setariOblioStrict()).toEqual({ activ: true, cif: "RO1", serie: "LL", punctLucru: "Sediu", trimiteEFactura: false });
  });
});

describe("cheamaOblio", () => {
  it("trimite actiunea si restul corpului, intoarce raspunsul", async () => {
    invoke.mockResolvedValue({ data: { ok: true, factura: { id: "i" } }, error: null });
    expect(await cheamaOblio("emite", { invoiceId: "i" })).toEqual({ ok: true, factura: { id: "i" } });
    expect(invoke).toHaveBeenCalledWith("oblio-facturare", { body: { action: "emite", invoiceId: "i" } });
  });
  it("eroarea HTTP a functiei ajunge cu mesajul ei", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: { json: async () => ({ error: "Oblio: Seria nu exista" }) } } });
    expect(await cheamaOblio("emite", { invoiceId: "i" })).toEqual({ ok: false, error: "Oblio: Seria nu exista" });
  });
  it("caderea retelei devine un mesaj de om, nu o exceptie", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request to the Edge Function" } });
    const r = await cheamaOblio("verifica", {});
    expect(r.ok).toBe(false);
    /* Online, o cerere care nu pleaca nu e dovada ca reteaua omului e de
       vina (functie nepublicata, server cazut) — vezi src/functii-edge.test.js. */
    expect(r.error).toBe("Serviciul de facturare nu a răspuns.");
    invoke.mockRejectedValue(new Error("boom"));
    expect(await cheamaOblio("verifica", {})).toEqual({ ok: false, error: "boom" });
    invoke.mockResolvedValue({ data: null, error: null });
    expect((await cheamaOblio("verifica", {})).ok).toBe(false);
  });
});
