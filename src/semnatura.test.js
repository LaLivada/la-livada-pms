import { describe, it, expect } from "vitest";
import { traseuSvg, esteGoala, LATIME_PANZA } from "./lib/semnatura.js";

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
