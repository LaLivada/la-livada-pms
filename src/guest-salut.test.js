/* Salutul din pagina oaspetelui.
 *
 * Trei ramuri si doua praguri, dar praguri pe care nu le vezi decat daca
 * deschizi pagina fix la ora aia. Un test le verifica in doua secunde;
 * altfel greseala ar sta ascunsa pana cand cineva se cazeaza la 11:00 si
 * citeste „bună dimineața” la pranz. */
import { describe, it, expect } from "vitest";
import { salut } from "./guest/App.jsx";

describe("salut", () => {
  it("spune „bună dimineața” intre 5 si 11", () => {
    expect(salut(5)).toBe("Bună dimineața,");
    expect(salut(8)).toBe("Bună dimineața,");
    expect(salut(10)).toBe("Bună dimineața,");
  });

  it("spune „bună ziua” intre 11 si 18", () => {
    expect(salut(11)).toBe("Bună ziua,");
    expect(salut(17)).toBe("Bună ziua,");
  });

  it("spune „bună seara” seara si noaptea", () => {
    expect(salut(18)).toBe("Bună seara,");
    expect(salut(23)).toBe("Bună seara,");
    expect(salut(0)).toBe("Bună seara,");
    expect(salut(4)).toBe("Bună seara,");
  });

  /* Ora vine din `new Date().getHours()`, deci e mereu 0-23. Testul de mai
     jos exista pentru ca functia sa nu intoarca `undefined` daca cineva o
     cheama vreodata altfel — un salut lipsa arata ca o pagina stricata. */
  it("intoarce mereu ceva", () => {
    for (let ora = 0; ora < 24; ora++) {
      expect(salut(ora)).toMatch(/^Bună /);
    }
  });
});
