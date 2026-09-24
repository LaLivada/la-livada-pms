import { describe, it, expect, beforeEach } from "vitest";
import {
  detecteazaLimba, salveazaLimba, CHEIE_LIMBA, LIMBA_IMPLICITA,
} from "./booking/i18n/limbi.js";

/* Prima pagină de rezervări e, pentru Google, o pagină românească: fără o
   alegere salvată, limba e româna indiferent de browser — jsdom raportează
   en-US, exact ca Googlebot. Până pe 24 septembrie 2026 se urma
   `navigator.languages`, iar H1-ul ajungea randat (și indexat) în engleză. */
describe("limba implicită a primei pagini de rezervări", () => {
  beforeEach(() => localStorage.clear());

  it("fără alegere salvată e româna, chiar cu browserul în engleză", () => {
    expect(navigator.languages[0]).toMatch(/^en/);
    expect(LIMBA_IMPLICITA).toBe("ro");
    expect(detecteazaLimba()).toBe("ro");
  });

  it("alegerea salvată explicit din selector rămâne respectată", () => {
    salveazaLimba("fr");
    expect(detecteazaLimba()).toBe("fr");
  });

  it("o valoare străină din localStorage nu e luată în seamă", () => {
    localStorage.setItem(CHEIE_LIMBA, "xx");
    expect(detecteazaLimba()).toBe("ro");
  });
});
