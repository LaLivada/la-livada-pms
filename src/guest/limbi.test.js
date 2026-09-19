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

  it("fiecare limba din LIMBI e formata din cod, nume, steag si locale", () => {
    const CODURI_ASTEPTATE = ["ro", "en", "fr", "it", "de", "ru", "uk"];
    expect(LIMBI.map((l) => l.cod)).toEqual(CODURI_ASTEPTATE);
    for (const l of LIMBI) {
      // Nu doar forma (regexul ar fi lasat sa treaca si "ua"): codul
      // trebuie sa fie EXACT unul dintre cele sapte, ISO 639-1.
      expect(CODURI_ASTEPTATE).toContain(l.cod);
      expect(l.nume.length).toBeGreaterThan(0);
      expect(l.steag.length).toBeGreaterThan(0);
      expect(l.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  it("limba implicita e engleza, nu romana", () => {
    // Verificare literala, nu doar simbolica: un LIMBA_IMPLICITA schimbat
    // din greseala la "ro" ar fi trecut testele de mai sus neobservat.
    expect(LIMBA_IMPLICITA).toBe("en");
  });
});
