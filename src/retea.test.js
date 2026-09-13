import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCuTimeout, cuOReincercare, MESAJ_TIMEOUT, TIMEOUT_IMPLICIT_MS } from "./lib/retea.js";

/* Un fetch care nu raspunde niciodata — doar anularea il scoate din
   asteptare, exact ca o conexiune mobila care „tine" fara sa livreze. */
const fetchMut = () => vi.fn((url, { signal }) => new Promise((_, reject) => {
  signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
}));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("fetchCuTimeout", () => {
  it("intoarce raspunsul cand serverul raspunde la timp si trimite semnalul de anulare", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    const r = await fetchCuTimeout("http://x", { method: "POST" }, 1000);
    expect(r.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("http://x",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
  });

  it("anuleaza cererea dupa prag si arunca o eroare marcata timeout + retea, cu mesaj pentru om", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMut());
    const p = fetchCuTimeout("http://x", {}, 500);
    const asteptare = expect(p).rejects.toMatchObject({ message: MESAJ_TIMEOUT, timeout: true, retea: true });
    await vi.advanceTimersByTimeAsync(499);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await asteptare;
  });

  it("pragul implicit e 15 secunde", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMut());
    const p = fetchCuTimeout("http://x");
    const asteptare = expect(p).rejects.toMatchObject({ timeout: true });
    await vi.advanceTimersByTimeAsync(TIMEOUT_IMPLICIT_MS);
    await asteptare;
  });

  it("lasa neatinse erorile care nu vin din anulare", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchCuTimeout("http://x", {}, 1000)).rejects.toThrow("Failed to fetch");
  });

  it("opreste ceasul dupa un raspuns venit la timp — nu ramane niciun timer in urma", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    await fetchCuTimeout("http://x", {}, 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("cuOReincercare", () => {
  const cadere = () => Object.assign(new Error("retea"), { retea: true });

  it("reincearca o singura data la esec de transport", async () => {
    const apel = vi.fn().mockRejectedValueOnce(cadere()).mockResolvedValueOnce("ok");
    await expect(cuOReincercare(apel)).resolves.toBe("ok");
    expect(apel).toHaveBeenCalledTimes(2);
  });

  it("nu reincearca un verdict al serverului", async () => {
    const apel = vi.fn().mockRejectedValue(new Error("Camera nu e disponibilă."));
    await expect(cuOReincercare(apel)).rejects.toThrow("Camera nu e disponibilă.");
    expect(apel).toHaveBeenCalledTimes(1);
  });

  it("dupa a doua cadere de transport renunta si o lasa sa iasa", async () => {
    const eroare = cadere();
    const apel = vi.fn().mockRejectedValue(eroare);
    await expect(cuOReincercare(apel)).rejects.toBe(eroare);
    expect(apel).toHaveBeenCalledTimes(2);
  });

  it("un apel care reuseste din prima nu se mai cheama", async () => {
    const apel = vi.fn().mockResolvedValue(42);
    await expect(cuOReincercare(apel)).resolves.toBe(42);
    expect(apel).toHaveBeenCalledTimes(1);
  });
});
