import { describe, it, expect } from "vitest";
import { eDubluTap, PRAG_DUBLU_TAP, FARA_TAP } from "./lib/gest.js";

describe("eDubluTap", () => {
  it("doua apasari apropiate sunt o pereche", () => {
    expect(eDubluTap(1000, 1080)).toBe(true);
  });

  it("doua apasari departate nu sunt", () => {
    expect(eDubluTap(1000, 1000 + PRAG_DUBLU_TAP)).toBe(false);
    expect(eDubluTap(1000, 5000)).toBe(false);
  });

  /* Cazul care chiar s-a intamplat: fila abia incarcata, deci
     `performance.now()` inca sub prag. Cu 0 la pornire, prima apasare
     singura trecea drept pereche si reincarca pagina la nesfarsit. */
  it("prima apasare dintr-o fila proaspata nu e pereche", () => {
    expect(eDubluTap(FARA_TAP, 150)).toBe(false);
    expect(eDubluTap(FARA_TAP, 0)).toBe(false);
    expect(eDubluTap(0, 150)).toBe(true);   // exact greseala de evitat
  });
});
