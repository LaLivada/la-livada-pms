/* Latimea zilelor din calendar (faza 3, C3) — regulile pure.
 *
 * Ce s-ar strica tacut: pe tableta sa ramana zilele late (5 pe ecran) desi
 * „7 zile" e rostul punctului; pe telefon sa se activeze „7 zile" (40px pe
 * zi); un pinch abia simtit sa schimbe latimea; „7 zile" pe un ecran ingust
 * sa dea coloane de 20px.
 */
import { describe, it, expect } from "vitest";
import {
  LATIMI, latimeImplicita, latimeSalvata, urmatoareaLatime, latimeDupaPinch, latimeZiPx,
  decidePinch, distantaAtingeri, CHEIE_LATIME, numeZiIntreg, ZI_NUME_INTREG_PX,
} from "./lib/calendar-latime.js";

describe("latimeImplicita", () => {
  it("tableta (deget, de la 700px) porneste pe 7 zile; telefonul si desktopul pe zile late", () => {
    expect(latimeImplicita({ tactil: true, latimeEcran: 1024 })).toBe("saptamana");
    expect(latimeImplicita({ tactil: true, latimeEcran: 768 })).toBe("saptamana");
    expect(latimeImplicita({ tactil: true, latimeEcran: 390 })).toBe("larg");
    expect(latimeImplicita({ tactil: false, latimeEcran: 1440 })).toBe("larg");
    expect(latimeImplicita()).toBe("larg");
  });
});

describe("latimeSalvata", () => {
  const stocare = (v) => ({ getItem: (k) => (k === CHEIE_LATIME ? v : null) });
  it("ia alegerea ramasa in browser doar daca e una valida", () => {
    expect(latimeSalvata(stocare("ingust"))).toBe("ingust");
    expect(latimeSalvata(stocare("altceva"))).toBeNull();
    expect(latimeSalvata(stocare(null))).toBeNull();
  });
  it("nu se sufoca fara stocare sau cu una care arunca", () => {
    expect(latimeSalvata(undefined)).toBeNull();
    expect(latimeSalvata({ getItem: () => { throw new Error("blocat"); } })).toBeNull();
  });
});

describe("urmatoareaLatime / latimeDupaPinch", () => {
  it("butonul parcurge cele trei trepte in cerc", () => {
    expect(LATIMI).toEqual(["ingust", "saptamana", "larg"]);
    expect(urmatoareaLatime("ingust")).toBe("saptamana");
    expect(urmatoareaLatime("saptamana")).toBe("larg");
    expect(urmatoareaLatime("larg")).toBe("ingust");
  });
  /* Pinch-ul nu se invarte la capete: pe zile late, „mai lat" ramane late. */
  it("pinch-ul face un pas si se opreste la capete", () => {
    expect(latimeDupaPinch("ingust", 1)).toBe("saptamana");
    expect(latimeDupaPinch("saptamana", 1)).toBe("larg");
    expect(latimeDupaPinch("larg", 1)).toBe("larg");
    expect(latimeDupaPinch("larg", -1)).toBe("saptamana");
    expect(latimeDupaPinch("ingust", -1)).toBe("ingust");
    expect(latimeDupaPinch("necunoscut", 1)).toBe("saptamana");
  });
});

describe("latimeZiPx", () => {
  it("7 zile pe o tableta de 1024px dau ~135px pe zi; late 190; inguste 66", () => {
    expect(latimeZiPx("saptamana", 1024)).toBe(135);
    expect(latimeZiPx("saptamana", 1366)).toBe(184);
    expect(latimeZiPx("larg", 1024)).toBe(190);
    expect(latimeZiPx("ingust", 1024)).toBe(66);
  });
  it("pe un ecran ingust nu coboara sub 66px — se deruleaza", () => {
    expect(latimeZiPx("saptamana", 360)).toBe(66);
    expect(latimeZiPx("saptamana", 0)).toBe(66);
    expect(latimeZiPx("saptamana", undefined)).toBe(66);
  });
});

describe("decidePinch / distantaAtingeri", () => {
  it("departarea degetelor cu 30% largeste, apropierea ingusteaza, tremurul nu face nimic", () => {
    expect(decidePinch(100, 130)).toBe(1);
    expect(decidePinch(100, 129)).toBe(0);
    expect(decidePinch(100, 76)).toBe(-1);
    expect(decidePinch(100, 80)).toBe(0);
    expect(decidePinch(100, 100)).toBe(0);
  });
  it("fara doua degete nu e pinch", () => {
    expect(decidePinch(0, 100)).toBe(0);
    expect(decidePinch(100, 0)).toBe(0);
    expect(distantaAtingeri([{ clientX: 0, clientY: 0 }])).toBe(0);
    expect(distantaAtingeri(null)).toBe(0);
  });
  it("distanta e cea euclidiana dintre primele doua atingeri", () => {
    expect(distantaAtingeri([{ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 }])).toBe(5);
  });
});

describe("numeZiIntreg", () => {
  it("numele intreg al zilei doar cand coloana are loc: zile late si „7 zile” pe tableta, nu pe zile inguste", () => {
    expect(numeZiIntreg(190)).toBe(true);
    expect(numeZiIntreg(135)).toBe(true);
    expect(numeZiIntreg(ZI_NUME_INTREG_PX)).toBe(true);
    expect(numeZiIntreg(ZI_NUME_INTREG_PX - 1)).toBe(false);
    expect(numeZiIntreg(66)).toBe(false);
    expect(numeZiIntreg(undefined)).toBe(false);
  });
});
