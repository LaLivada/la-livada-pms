import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Modulul citeste adresa si cheia la import, deci se incarca proaspat
   dupa ce mediul e pregatit. */
let api;
beforeEach(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://baza");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "cheie");
  vi.resetModules();
  api = await import("./booking/api.js");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

const raspunsJson = (obiect, { ok = true, status = 200 } = {}) =>
  ({ ok, status, text: async () => JSON.stringify(obiect) });
const reteaCazuta = () => new TypeError("Failed to fetch");
const fetchMut = () => vi.fn((url, { signal }) => new Promise((_, reject) => {
  signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
}));
const oaspete = { prefix: "+40", telefon: "722000000", nume: "Pop", prenume: "Ana", email: "a@b.ro", oras: "Iași", judet: "Iași", tara: "România" };

describe("site-ul de rezervari: ce se reincearca si ce nu", () => {
  it("cautarea disponibilitatii se reincearca o data cand reteaua cade", async () => {
    const f = vi.fn().mockRejectedValueOnce(reteaCazuta()).mockResolvedValueOnce(raspunsJson({ options: [] }));
    vi.stubGlobal("fetch", f);
    await expect(api.cautaDisponibilitate({ checkin: "a", checkout: "b", adulti: 2, copii: 0 }))
      .resolves.toEqual({ options: [] });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toBe("http://baza/rest/v1/rpc/public_availability");
  });

  it("crearea rezervarii NU se reincearca singura — omul apasa din nou, cheia de idempotenta il apara", async () => {
    const f = vi.fn().mockRejectedValue(reteaCazuta());
    vi.stubGlobal("fetch", f);
    await expect(api.creeazaRezervare({ cheieIdempotenta: "k", checkin: "a", checkout: "b", camere: [], oaspete, cerinte: "", jetonTurnstile: null }))
      .rejects.toMatchObject({ retea: true, message: "Nu am putut contacta serverul. Verifică conexiunea." });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("http://baza/functions/v1/booking-create");
  });

  it("crearea are 20 de secunde, nu 15: Turnstile, baza si emailul, pornite la rece", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMut());
    const p = api.creeazaRezervare({ cheieIdempotenta: "k", checkin: "a", checkout: "b", camere: [], oaspete, cerinte: "", jetonTurnstile: null });
    const asteptare = expect(p).rejects.toMatchObject({ timeout: true });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await asteptare;
  });

  it("un timeout ajunge la om cu mesajul lui, nu ca „verifica conexiunea”", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMut());
    const p = api.citesteCapacitatea();
    const asteptare = expect(p).rejects.toMatchObject({
      timeout: true, message: "Serverul nu a răspuns în timp util. Încearcă din nou.",
    });
    // prima incercare + reincercarea, fiecare cu pragul ei
    await vi.advanceTimersByTimeAsync(2 * 15_000);
    await asteptare;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("un raspuns de eroare al serverului nu se reincearca si isi pastreaza codul", async () => {
    const f = vi.fn().mockResolvedValue(raspunsJson({ message: "Camera nu mai e disponibilă.", code: "P0002" }, { ok: false, status: 400 }));
    vi.stubGlobal("fetch", f);
    await expect(api.confirmaRezervare("t"))
      .rejects.toMatchObject({ message: "Camera nu mai e disponibilă.", cod: "P0002" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("confirmarea si anularea din link sunt idempotente, deci se reincearca", async () => {
    for (const [apel, nume] of [[() => api.confirmaRezervare("t"), "confirm_public_booking"], [() => api.anuleazaRezervare("t"), "cancel_public_booking"]]) {
      const f = vi.fn().mockRejectedValueOnce(reteaCazuta()).mockResolvedValueOnce(raspunsJson({ status: "confirmed" }));
      vi.stubGlobal("fetch", f);
      await expect(apel()).resolves.toEqual({ status: "confirmed" });
      expect(f).toHaveBeenCalledTimes(2);
      expect(f.mock.calls[1][0]).toBe(`http://baza/rest/v1/rpc/${nume}`);
    }
  });
});
