import { describe, it, expect } from "vitest";
import { telefonInternational, PREFIXE_TELEFON, PREFIX_IMPLICIT } from "./booking/nomenclatoare.js";

describe("numărul de telefon în format internațional", () => {
  it("lipește prefixul de număr", () => {
    expect(telefonInternational("+40", "722123456")).toBe("+40 722123456");
  });

  it("taie zeroul cu care încep românii numărul", () => {
    // „+40 0722123456" nu se poate forma de nicăieri.
    expect(telefonInternational("+40", "0722123456")).toBe("+40 722123456");
    expect(telefonInternational("+40", "00722123456")).toBe("+40 722123456");
  });

  it("păstrează zeroul la numerele italiene", () => {
    /* Italia e singura țară din listă care ține zeroul și în forma
       internațională: +39 06 pentru Roma. Tăiat, numărul nu mai sună. */
    expect(telefonInternational("+39", "0612345678")).toBe("+39 0612345678");
  });

  it("scoate spațiile, liniuțele și parantezele din ce a tastat omul", () => {
    expect(telefonInternational("+40", "0722 123 456")).toBe("+40 722123456");
    expect(telefonInternational("+44", "(020) 7946-0958")).toBe("+44 2079460958");
  });

  it("nu întoarce un prefix singur, fără număr", () => {
    // Altfel în PMS ar ajunge „+40", care arată a telefon dar nu e.
    expect(telefonInternational("+40", "")).toBe("");
    expect(telefonInternational("+40", "   ")).toBe("");
    expect(telefonInternational("+40", "0")).toBe("");
    expect(telefonInternational("+40", null)).toBe("");
  });

  it("acceptă un prefix scris de mână, cu spații în plus", () => {
    expect(telefonInternational(" +351 ", "912345678")).toBe("+351 912345678");
  });
});

describe("lista de prefixe", () => {
  it("începe cu România, care e și prefixul implicit", () => {
    expect(PREFIXE_TELEFON[0].cod).toBe("+40");
    expect(PREFIXE_TELEFON[0].tara).toBe("România");
    expect(PREFIX_IMPLICIT).toBe("+40");
  });

  it("nu are două țări pe același cod", () => {
    /* Într-un <select> două opțiuni cu aceeași valoare nu pot fi deosebite:
       a doua devine inaccesibilă. De aceea SUA și Canada sunt o intrare. */
    const coduri = PREFIXE_TELEFON.map((p) => p.cod);
    expect(new Set(coduri).size).toBe(coduri.length);
  });

  it("are toate codurile în forma +cifre", () => {
    for (const p of PREFIXE_TELEFON) {
      expect(p.cod, p.tara).toMatch(/^\+\d{1,4}$/);
    }
  });

  it("nu conține „alt”, valoarea rezervată opțiunii de prefix scris de mână", () => {
    expect(PREFIXE_TELEFON.some((p) => p.cod === "alt")).toBe(false);
  });
});
