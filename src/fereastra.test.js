import { describe, it, expect, vi } from "vitest";

/* Functiile testate sunt pure, dar stau in stratul de date, care
   construieste clientul Supabase la import — iar `createClient` arunca fara
   VITE_SUPABASE_URL. Local trece fiindca exista .env; in CI nu exista, si
   exact asa a picat pe 13 septembrie 2026. Testul nu atinge reteaua. */
vi.mock("./supabase.js", () => ({ supabase: {} }));

import {
  fereastraImplicita, bucatiLipsa, uneste, doarNoi,
  FEREASTRA_ZILE_IN_URMA, FEREASTRA_ZILE_INAINTE, PAS_LARGIRE_ZILE,
} from "./data/nucleu.js";

describe("doarNoi", () => {
  const a = [{ id: "1", v: "local" }];
  it("adauga doar id-urile necunoscute si pastreaza versiunea locala a celor stiute", () => {
    expect(doarNoi(a, [{ id: "1", v: "server" }, { id: "2", v: "s2" }]))
      .toEqual([{ id: "1", v: "local" }, { id: "2", v: "s2" }]);
  });
  it("fara nimic nou intoarce aceeasi lista (aceeasi referinta — nu re-randeaza degeaba)", () => {
    expect(doarNoi(a, [{ id: "1", v: "server" }])).toBe(a);
    expect(doarNoi(a, [])).toBe(a);
  });
  it("tolereaza liste lipsa", () => {
    expect(doarNoi(undefined, [{ id: "x" }])).toEqual([{ id: "x" }]);
    expect(doarNoi(a, undefined)).toBe(a);
  });
});

const ZI_MS = 86400000;
const zile = (iso, n) => new Date(new Date(iso).getTime() + n * ZI_MS).toISOString();

describe("fereastraImplicita", () => {
  it("porneste de la miezul noptii locale: 30 de zile in urma, 400 inainte", () => {
    const acum = new Date(2026, 8, 13, 15, 42, 7);
    const f = fereastraImplicita(acum);
    const miez = new Date(2026, 8, 13);
    expect(new Date(f.de).getTime()).toBe(miez.getTime() - FEREASTRA_ZILE_IN_URMA * ZI_MS);
    expect(new Date(f.pana).getTime()).toBe(miez.getTime() + FEREASTRA_ZILE_INAINTE * ZI_MS);
  });

  it("marginile sunt ISO, comparabile ca text", () => {
    const f = fereastraImplicita(new Date(2026, 8, 13));
    expect(f.de < f.pana).toBe(true);
    expect(f.de.endsWith("Z")).toBe(true);
  });
});

describe("bucatiLipsa", () => {
  const fer = { de: "2026-08-14T00:00:00.000Z", pana: "2027-10-18T00:00:00.000Z" };

  it("nimic de cerut cand intervalul e deja acoperit", () => {
    const r = bucatiLipsa(fer, "2026-09-01T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
    expect(r.bucati).toEqual([]);
    expect(r.fereastra).toEqual(fer);
  });

  it("derulare in trecut: o bucata in stanga, largita cu pasul, si fereastra creste in stanga", () => {
    const de = "2026-07-01T00:00:00.000Z";
    const r = bucatiLipsa(fer, de, "2026-07-22T00:00:00.000Z");
    expect(r.bucati).toEqual([{ de: zile(de, -PAS_LARGIRE_ZILE), pana: fer.de }]);
    expect(r.fereastra).toEqual({ de: zile(de, -PAS_LARGIRE_ZILE), pana: fer.pana });
  });

  it("salt in viitor: o bucata in dreapta", () => {
    const pana = "2028-01-10T00:00:00.000Z";
    const r = bucatiLipsa(fer, "2027-12-20T00:00:00.000Z", pana);
    expect(r.bucati).toEqual([{ de: fer.pana, pana: zile(pana, PAS_LARGIRE_ZILE) }]);
    expect(r.fereastra.de).toBe(fer.de);
    expect(r.fereastra.pana).toBe(zile(pana, PAS_LARGIRE_ZILE));
  });

  it("un interval mai mare decat fereastra cere ambele capete", () => {
    const r = bucatiLipsa(fer, "2026-01-01T00:00:00.000Z", "2028-06-01T00:00:00.000Z");
    expect(r.bucati).toHaveLength(2);
    expect(r.bucati[0].pana).toBe(fer.de);
    expect(r.bucati[1].de).toBe(fer.pana);
  });

  it("marginea exacta nu declanseaza nimic", () => {
    const r = bucatiLipsa(fer, fer.de, fer.pana);
    expect(r.bucati).toEqual([]);
  });
});

describe("uneste", () => {
  const a = [{ id: "1", v: "a1" }, { id: "2", v: "a2" }];

  it("adauga randurile noi la final, in ordinea lor", () => {
    expect(uneste(a, [{ id: "3", v: "n3" }, { id: "4", v: "n4" }]))
      .toEqual([...a, { id: "3", v: "n3" }, { id: "4", v: "n4" }]);
  });

  it("randurile prioritare inlocuiesc versiunea existenta, pe loc", () => {
    expect(uneste(a, [{ id: "2", v: "nou" }])).toEqual([{ id: "1", v: "a1" }, { id: "2", v: "nou" }]);
  });

  it("nu sterge niciodata nimic din existente", () => {
    expect(uneste(a, [])).toEqual(a);
    expect(uneste(a, [{ id: "9", v: "x" }])).toHaveLength(3);
  });

  it("tolereaza liste lipsa", () => {
    expect(uneste(undefined, [{ id: "1" }])).toEqual([{ id: "1" }]);
    expect(uneste(a, undefined)).toEqual(a);
  });
});
