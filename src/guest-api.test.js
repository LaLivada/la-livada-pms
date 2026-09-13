import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let api;
beforeEach(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://baza");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "cheie");
  vi.resetModules();
  api = await import("./guest/api.js");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

const raspunsJson = (obiect, { ok = true, status = 200 } = {}) =>
  ({ ok, status, json: async () => obiect });
const reteaCazuta = () => new TypeError("Failed to fetch");
const fetchMut = () => vi.fn((url, { signal }) => new Promise((_, reject) => {
  signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
}));

describe("aplicatia de oaspete: ce se reincearca si ce nu", () => {
  it("sejurul se reincearca o data la cadere de retea", async () => {
    const f = vi.fn().mockRejectedValueOnce(reteaCazuta()).mockResolvedValueOnce(raspunsJson({ ok: true, stay: {} }));
    vi.stubGlobal("fetch", f);
    await expect(api.citesteSejurul("ABCDEFGH")).resolves.toEqual({ ok: true, stay: {} });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toBe("http://baza/rest/v1/rpc/guest_stay_by_cod");
    // codul pleaca in corp, nu in adresa
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ p_cod: "ABCDEFGH" });
  });

  it("dupa doua caderi la rand eroarea iese marcata ca retea, ca App.jsx sa stie ce a fost", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(reteaCazuta()));
    await expect(api.citesteMinibarul()).rejects.toMatchObject({ retea: true, message: "Fără legătură la internet." });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("un raspuns de eroare al serverului nu se reincearca", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(raspunsJson({}, { ok: false, status: 429 })));
    await expect(api.citesteCodulDeAcces("ABCDEFGH")).rejects.toThrow("Serverul a raspuns cu 429.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("semnarea fisei se trimite o singura data, chiar daca reteaua cade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(reteaCazuta()));
    await expect(api.trimiteFisa("ABCDEFGH", { nume: "Pop" })).rejects.toMatchObject({ retea: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe("deschiderea usii", () => {
    it("un timeout e un rezultat cu mesaj, nu o exceptie, si vine dupa 20 s", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", fetchMut());
      const p = api.deschideUsa("ABCDEFGH");
      await vi.advanceTimersByTimeAsync(19_999);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).resolves.toEqual({ ok: false, mesaj: "Ușa n-a răspuns la timp. Mai încearcă o dată." });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("reteaua cazuta se propaga — mesajul ei e in App.jsx", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(reteaCazuta()));
      await expect(api.deschideUsa("ABCDEFGH")).rejects.toThrow("Failed to fetch");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("refuzul serverului ajunge la om cu motivul lui", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(raspunsJson({ ok: false, error: "Sejurul n-a început." }, { ok: false, status: 403 })));
      await expect(api.deschideUsa("ABCDEFGH")).resolves.toEqual({ ok: false, mesaj: "Sejurul n-a început." });
    });

    it("succesul e succes", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(raspunsJson({ ok: true })));
      await expect(api.deschideUsa("ABCDEFGH")).resolves.toEqual({ ok: true });
    });
  });
});
