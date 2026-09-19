import { describe, it, expect } from "vitest";
import { detecteazaLimba, LIMBI, LIMBA_IMPLICITA } from "./limbi.jsx";

describe("detecteazaLimba", () => {
  it("recunoaste codul exact", () => {
    expect(detecteazaLimba(["ro"])).toBe("ro");
    expect(detecteazaLimba(["de"])).toBe("de");
  });

  it("ignora regiunea din eticheta BCP-47", () => {
    expect(detecteazaLimba(["en-US"])).toBe("en");
    expect(detecteazaLimba(["en-GB"])).toBe("en");
    expect(detecteazaLimba(["ro-RO"])).toBe("ro");
  });

  it("ia prima limba recunoscuta din lista, in ordine", () => {
    // Spaniola nu e suportata, a doua e germana.
    expect(detecteazaLimba(["es-ES", "de-DE"])).toBe("de");
  });

  it("da limba implicita cand nimic nu se potriveste", () => {
    expect(detecteazaLimba(["es-ES", "ja-JP"])).toBe(LIMBA_IMPLICITA);
  });

  it("da limba implicita pentru lista goala sau lipsa", () => {
    expect(detecteazaLimba([])).toBe(LIMBA_IMPLICITA);
    expect(detecteazaLimba(undefined)).toBe(LIMBA_IMPLICITA);
  });

  it("fiecare limba din LIMBI e formata din cod, nume si steag", () => {
    expect(LIMBI.length).toBe(7);
    for (const l of LIMBI) {
      expect(l.cod).toMatch(/^[a-z]{2}$/);
      expect(l.nume.length).toBeGreaterThan(0);
      expect(l.steag.length).toBeGreaterThan(0);
    }
  });
});
