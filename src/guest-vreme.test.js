/* Traducerea codurilor WMO in cele sase stari de vreme.
 *
 * E un tabel de numere scris de mana, adica exact felul de cod care se
 * strica in tacere: un cod scapat din lista nu da nicio eroare, doar arata
 * un nor cand afara ninge. */
import { describe, it, expect } from "vitest";
import { stareaVremii } from "./guest/vreme.js";

describe("stareaVremii", () => {
  it("recunoaște cerul senin și cel înnorat", () => {
    expect(stareaVremii(0).fel).toBe("senin");
    expect(stareaVremii(1).fel).toBe("parcial");
    expect(stareaVremii(2).fel).toBe("parcial");
    expect(stareaVremii(3).fel).toBe("innorat");
  });

  it("pune burnița, ploaia și aversele la fel", () => {
    for (const cod of [51, 55, 61, 65, 80, 82]) {
      expect(stareaVremii(cod).fel).toBe("ploaie");
    }
  });

  it("separă ninsoarea de ploaie", () => {
    for (const cod of [71, 75, 77, 85, 86]) {
      expect(stareaVremii(cod).fel).toBe("ninsoare");
    }
  });

  it("are stări proprii pentru ceață și furtună", () => {
    expect(stareaVremii(45).fel).toBe("ceata");
    expect(stareaVremii(48).fel).toBe("ceata");
    expect(stareaVremii(95).fel).toBe("furtuna");
    expect(stareaVremii(99).fel).toBe("furtuna");
  });

  /* Open-Meteo poate adauga oricand un cod nou, iar pagina n-are voie sa
     ramana atunci fara pictograma — mai bine un nor generic decat un gol. */
  it("nu întoarce niciodată gol, nici pentru un cod necunoscut", () => {
    for (const cod of [7, 42, 100, -1, undefined, null]) {
      const s = stareaVremii(cod);
      expect(s).toBeTruthy();
      expect(typeof s.fel).toBe("string");
      expect(s.fel.length).toBeGreaterThan(0);
    }
  });
});
