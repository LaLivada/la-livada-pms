import { describe, it, expect } from "vitest";
import { trebuieReincarcat, PRAG_REINCARCARE_MS } from "./lib/reincarcare.js";

const MINUT = 60_000;

describe("trebuieReincarcat", () => {
  it("pragul e de doua minute", () => {
    expect(PRAG_REINCARCARE_MS).toBe(2 * MINUT);
  });

  it("nu reincarca daca tabul n-a fost niciodata ascuns", () => {
    expect(trebuieReincarcat(null, 10 * MINUT)).toBe(false);
    expect(trebuieReincarcat(undefined, 10 * MINUT)).toBe(false);
  });

  it("o comutare scurta intre aplicatii nu reincarca", () => {
    expect(trebuieReincarcat(0, MINUT)).toBe(false);
    expect(trebuieReincarcat(0, 2 * MINUT - 1)).toBe(false);
  });

  it("de la doua minute in sus reincarca", () => {
    expect(trebuieReincarcat(0, 2 * MINUT)).toBe(true);
    expect(trebuieReincarcat(0, 60 * MINUT)).toBe(true);
  });

  it("pragul se poate schimba din apel, fara sa se atinga constanta", () => {
    expect(trebuieReincarcat(0, 5_000, 5_000)).toBe(true);
    expect(trebuieReincarcat(0, 4_999, 5_000)).toBe(false);
  });

  it("un ceas dat inapoi (absenta negativa) nu reincarca", () => {
    expect(trebuieReincarcat(10 * MINUT, MINUT)).toBe(false);
  });
});
