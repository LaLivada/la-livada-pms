/* Comutatorul „Interfața: Nouă / Actuală" si tema — regulile pure.
 * Ce s-ar strica tacut: o valoare straina din localStorage sa lase
 * interfata fara forma; „Actuală" sa nu se tina minte; tema „sistem" sa nu
 * mai urmareasca telefonul, sau „deschis" sa ramana intunecata pe un
 * telefon pe intunecat.
 */
import { describe, it, expect, vi } from "vitest";
import {
  citesteInterfata, scrieInterfata, CHEIE_INTERFATA,
  citesteTema, scrieTema, CHEIE_TEMA, esteIntunecata, aplicaTema, CLASA_INTUNECAT,
} from "./lib/interfata.js";

const stocare = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

describe("interfata", () => {
  it("implicit e noua; „actuala” se tine minte; o valoare straina nu conteaza", () => {
    expect(citesteInterfata(stocare())).toBe("noua");
    const s = stocare();
    scrieInterfata(s, "actuala");
    expect(s.getItem(CHEIE_INTERFATA)).toBe("actuala");
    expect(citesteInterfata(s)).toBe("actuala");
    expect(citesteInterfata(stocare({ [CHEIE_INTERFATA]: "altceva" }))).toBe("noua");
  });
  it("nu se sufoca fara stocare sau cu una care arunca", () => {
    expect(citesteInterfata(undefined)).toBe("noua");
    expect(citesteInterfata({ getItem: () => { throw new Error("blocat"); } })).toBe("noua");
    expect(() => scrieInterfata({ setItem: () => { throw new Error("blocat"); } }, "actuala")).not.toThrow();
  });
});

describe("tema", () => {
  it("implicit urmeaza sistemul; deschis/intunecat il ignora", () => {
    expect(citesteTema(stocare())).toBe("sistem");
    expect(esteIntunecata("sistem", true)).toBe(true);
    expect(esteIntunecata("sistem", false)).toBe(false);
    expect(esteIntunecata("deschis", true)).toBe(false);
    expect(esteIntunecata("intunecat", false)).toBe(true);
    const s = stocare();
    scrieTema(s, "intunecat");
    expect(s.getItem(CHEIE_TEMA)).toBe("intunecat");
    expect(citesteTema(stocare({ [CHEIE_TEMA]: "roz" }))).toBe("sistem");
  });

  it("pune clasa pe <html> si, pe „sistem”, urmareste schimbarile telefonului", () => {
    const html = { classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); } } };
    const doc = { documentElement: html };
    const ascultatori = [];
    let intunecat = false;
    const matchMedia = () => ({
      get matches() { return intunecat; },
      addEventListener: (_, f) => ascultatori.push(f),
      removeEventListener: (_, f) => ascultatori.splice(ascultatori.indexOf(f), 1),
    });
    const opreste = aplicaTema(doc, "sistem", matchMedia);
    expect(html.classList.set.has(CLASA_INTUNECAT)).toBe(false);
    intunecat = true; ascultatori.forEach((f) => f());
    expect(html.classList.set.has(CLASA_INTUNECAT)).toBe(true);
    opreste();
    expect(ascultatori).toHaveLength(0);

    aplicaTema(doc, "deschis", matchMedia);
    expect(html.classList.set.has(CLASA_INTUNECAT)).toBe(false);
    aplicaTema(doc, "intunecat", () => undefined);
    expect(html.classList.set.has(CLASA_INTUNECAT)).toBe(true);
  });

  it("fara matchMedia (medii vechi), „sistem” inseamna deschis si nu arunca", () => {
    const doc = { documentElement: { classList: { toggle: vi.fn() } } };
    expect(() => aplicaTema(doc, "sistem", undefined)).not.toThrow();
    expect(doc.documentElement.classList.toggle).toHaveBeenCalledWith(CLASA_INTUNECAT, false);
  });
});
