import { describe, it, expect, vi } from "vitest";

/* Stratul de date construieste clientul Supabase la import, iar in CI nu
   exista .env — la fel ca in fereastra.test.js. Testul nu atinge reteaua. */
vi.mock("./supabase.js", () => ({ supabase: {} }));

import { suprascriereActiva } from "./data/dispozitive.js";

describe("suprascriereActiva — marcajul „manual” de pe un releu", () => {
  const acum = new Date("2026-09-13T16:20:00Z");

  it("fara rand, nu e manual", () => {
    expect(suprascriereActiva(null, acum)).toBe(false);
    expect(suprascriereActiva(undefined, acum)).toBe(false);
    expect(suprascriereActiva([], acum)).toBe(false);
  });

  it("boiler: fara capat in timp (until null), tine", () => {
    expect(suprascriereActiva({ pornit: true, until: null }, acum)).toBe(true);
  });

  it("lumini: tine doar pana la `until`", () => {
    expect(suprascriereActiva({ pornit: true, until: "2026-09-13T16:25:42Z" }, acum)).toBe(true);
    expect(suprascriereActiva({ pornit: false, until: "2026-09-11T03:40:56Z" }, acum)).toBe(false);
  });

  it("tolereaza relatia intoarsa ca lista, nu doar ca obiect", () => {
    expect(suprascriereActiva([{ pornit: true, until: null }], acum)).toBe(true);
  });
});
