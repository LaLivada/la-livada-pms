/* Foaia de stil a paginii oaspetelui e un template literal dintr-un fisier
 * .js, iar asta are o capcana care s-a inchis peste mine de patru ori in
 * proiectul asta: un backtick scris intr-un comentariu CSS inchide sirul.
 * Rezultatul nu e o eroare care sa spuna asta, ci un 500 pe modul sau un
 * mesaj despre un punct si virgula lipsa, la sute de linii distanta.
 *
 * Fisierul nu e importat de niciun alt test — se incarca doar in main.jsx,
 * la rulare — deci pana acum nimic din suita nu-l atingea. Testul asta il
 * atinge: daca sirul e rupt, importul cade si suita devine rosie, in loc sa
 * afle utilizatorul din pagina alba.
 */
import { describe, it, expect } from "vitest";
import { STILURI } from "./guest/styles.js";

describe("stilurile paginii oaspetelui", () => {
  it("se încarcă fără să crape", () => {
    expect(typeof STILURI).toBe("string");
    expect(STILURI.length).toBeGreaterThan(1000);
  });

  /* Numarul de acolade trebuie sa fie egal. E verificarea cea mai ieftina
     care prinde un sir taiat la mijloc: o foaie de stil trunchiata pierde
     mai multe `}` decat `{`. */
  it("are acoladele în echilibru", () => {
    const deschise = (STILURI.match(/{/g) || []).length;
    const inchise = (STILURI.match(/}/g) || []).length;
    expect(deschise).toBe(inchise);
  });

  it("conține regulile de care depinde pagina", () => {
    for (const bucata of [".g-hero", ".g-usa", ".g-cod", ".g-scurtatura",
                          ".g-fereastra", ".g-vreme", ".g-leg", ".g-atractie"]) {
      expect(STILURI).toContain(bucata);
    }
  });

  /* Cardul inchis are culorile scrise ca valori, nu ca jetoane, tocmai
     fiindca --ivory si --charcoal se inverseaza in tema de noapte. Daca
     cineva le „curata" inapoi in jetoane, textul devine negru pe negru pe
     telefoanele cu tema intunecata — o greseala care nu se vede la lumina
     zilei si de care afli de la un oaspete. */
  it("nu ia culorile cardului închis din jetoane", () => {
    const hero = STILURI.slice(STILURI.indexOf(".g-hero{"));
    const regula = hero.slice(0, hero.indexOf("}"));
    expect(regula).not.toContain("var(--ivory)");
    expect(regula).not.toContain("var(--charcoal)");
  });
});
