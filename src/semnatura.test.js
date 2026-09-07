import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { traseuSvg, esteGoala, LATIME_PANZA, INALTIME_PANZA } from "./lib/semnatura.js";

describe("traseul semnaturii", () => {
  it("o linie devine M urmat de L-uri", () => {
    const d = traseuSvg([[{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]]);
    expect(d).toBe("M0 0L10 5L20 0");
  });

  it("doua linii separate raman separate", () => {
    // Semnatura cu litera taiata: doua atingeri, doua bucati de traseu.
    const d = traseuSvg([[{ x: 0, y: 0 }, { x: 5, y: 5 }],
                         [{ x: 9, y: 1 }, { x: 2, y: 8 }]]);
    expect(d).toBe("M0 0L5 5M9 1L2 8");
  });

  it("rotunjeste la o zecimala", () => {
    /* Coordonatele vin din getBoundingClientRect si au multe zecimale. La
       ~400 de puncte, zecimalele alea sunt kilobytes care nu schimba nimic
       vizibil. */
    const d = traseuSvg([[{ x: 1.23456, y: 7.89012 }, { x: 2, y: 3 }]]);
    expect(d).toBe("M1.2 7.9L2 3");
  });

  it("arunca punctele prea apropiate", () => {
    // Degetul tinut pe loc trimite zeci de evenimente in acelasi pixel.
    const d = traseuSvg([[{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }, { x: 30, y: 30 }]]);
    expect(d).toBe("M0 0L30 30");
  });

  it("pastreaza primul punct al fiecarei linii, oricat de scurta", () => {
    // Un punct pe „i" e o singura atingere. Aruncat, semnatura se schimba.
    const d = traseuSvg([[{ x: 4, y: 4 }]]);
    expect(d).toBe("M4 4");
  });

  it("nu se sufoca pe intrari lipsa", () => {
    expect(traseuSvg([])).toBe("");
    expect(traseuSvg(null)).toBe("");
    expect(traseuSvg([[]])).toBe("");
  });
});

describe("panza goala", () => {
  it("fara nicio linie e goala", () => {
    expect(esteGoala([])).toBe(true);
    expect(esteGoala(null)).toBe(true);
  });

  it("o singura atingere scurta nu e semnatura", () => {
    /* Cineva care atinge din greseala panza n-a semnat. Fara pragul asta,
       butonul „Semnez" s-ar debloca dintr-un scroll. */
    expect(esteGoala([[{ x: 5, y: 5 }, { x: 6, y: 6 }]])).toBe(true);
  });

  it("un traseu de lungime rezonabila e semnatura", () => {
    const linie = Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: 10 }));
    expect(esteGoala([linie])).toBe(false);
  });

  it("mai multe atingeri scurte se aduna", () => {
    /* Un nume scris din trei bucati scurte e tot o semnatura. Pragul se
       masoara pe lungimea TOTALA, nu pe cea mai lunga linie. */
    const bucata = [{ x: 0, y: 0 }, { x: 25, y: 0 }];
    expect(esteGoala([bucata, bucata, bucata])).toBe(false);
  });

  it("panza are latimea declarata", () => {
    expect(LATIME_PANZA).toBeGreaterThan(0);
  });
});

/* Semnatura se deseneaza intr-un loc si se arata in alte trei: pagina
   oaspetelui, fisa de la receptie si coala tiparita. Toate patru trebuie sa
   foloseasca acelasi sistem de coordonate — la alt raport, traseul salvat
   ramane valid dar apare deformat, iar o semnatura deformata nu mai e a
   nimanui.
   Raportul din foaia oaspetelui e prins in guest-stiluri.test.js. Aici sunt
   celelalte doua. Nu e o grija inchipuita: panza a trecut de la 3:1 la 2:1 pe
   7 septembrie 2026 fiindca era prea joasa pentru un deget, iar cele trei
   locuri aveau 600x200 scris de mana. */
describe("randarile semnaturii merg dupa aceleasi numere", () => {
  const RANDARI = ["src/features/fise.jsx", "src/features/documente.jsx"];

  it("PMS-ul ia viewBox-ul din constante, nu scris de mana", () => {
    for (const cale of RANDARI) {
      const sursa = readFileSync(cale, "utf8");
      expect(sursa, cale).toContain("LATIME_PANZA");
      /* Un viewBox cu cifre in el e exact greseala reparata atunci. */
      expect(sursa, cale).not.toMatch(/viewBox="0 0 \d/);
    }
  });

  it("chenarul de la receptie are acelasi raport ca panza", () => {
    const css = readFileSync("src/styles/pms.css", "utf8");
    const de = css.indexOf(".fisa-semnatura{");
    expect(de, "nu am gasit .fisa-semnatura in pms.css").toBeGreaterThan(-1);
    const regula = css.slice(de, css.indexOf("}", de));
    const gasit = regula.match(/aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
    expect(gasit, "lipseste aspect-ratio de pe .fisa-semnatura").toBeTruthy();
    expect(Number(gasit[1]) / Number(gasit[2])).toBeCloseTo(LATIME_PANZA / INALTIME_PANZA, 5);
  });
});
