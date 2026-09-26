/* Tema — regulile pure. Ce s-ar strica tacut: o valoare straina sau o
 * stocare blocata sa lase PMS-ul fara tema; tema „sistem" sa nu mai
 * urmareasca telefonul, sau „deschis" sa ramana intunecata pe un telefon pe
 * intunecat.
 */
import { describe, it, expect, vi } from "vitest";
import { citesteTema, scrieTema, CHEIE_TEMA, esteIntunecata, aplicaTema, CLASA_INTUNECAT } from "./lib/tema.js";

const stocare = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

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

  it("nu se sufoca fara stocare sau cu una care arunca (navigare privata)", () => {
    expect(citesteTema(undefined)).toBe("sistem");
    expect(citesteTema({ getItem: () => { throw new Error("blocat"); } })).toBe("sistem");
    expect(() => scrieTema({ setItem: () => { throw new Error("blocat"); } }, "intunecat")).not.toThrow();
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
