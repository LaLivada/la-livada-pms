/* Filtrarea jurnalului pe camera si pe zi, si gruparea pe zile calendaristice.
 *
 * Camera NU e un camp in `activity_log` — e text liber in `detail`. Tot ce
 * se poate strica aici se strica TACUT: o citire lacoma scoate camere care
 * nu exista (un pret de 1002 lei devine camera 1002), iar o grupare fara
 * cheie secundara amesteca intrarile unei zile.
 *
 * Sirurile de mai jos sunt copiate din jurnalul real, nu inventate.
 */
import { describe, it, expect } from "vitest";
import { cameraDinDetaliu, ziLocala, filtreazaJurnal, ziiDistincte, grupeazaPeZi, etichetaZi }
  from "./lib/jurnal.js";

const CAMERE = [
  "1001", "1002", "1003", "1004", "1005", "1006", "1007", "1008",
  "1009", "1010", "1011", "1012", "1013", "1014", "1101", "1102",
];

describe("cameraDinDetaliu", () => {
  it("citeste camera din formele reale din jurnal", () => {
    const cazuri = [
      ["1102 · perioadă schimbată", "1102"],
      ["1003 — de la cardul de status", "1003"],
      ["1001 → Curată", "1001"],
      ["1001 · camera trecută pe „murdară”", "1001"],
      ["1002 · Cotaie Andrei", "1002"],
      ["Jarpalau Alexandru · 1102 · 11.09 → 13.09", "1102"],
      ["Nunta Grand'Or 12.09 · 1014: Olaru Florin", "1014"],
      ["Nunta Grand'Or 12.09: 1014", "1014"],
      ["Boiler · 1003, 1005", "1003"],
      ["Jarpalau Alexandru: 1001 12.09 → 1002 12.09", "1001"],
    ];
    for (const [detaliu, asteptat] of cazuri) {
      expect(cameraDinDetaliu(detaliu, CAMERE), detaliu).toBe(asteptat);
    }
  });

  it("tace cand actiunea n-are nicio camera", () => {
    for (const d of [
      "Configurare tarife actualizată",
      "Manolache Constantin",
      "Carmen (Cameristă)",
      "Iluminat exterior · 7 din 7",
      "", null, undefined,
    ]) {
      expect(cameraDinDetaliu(d, CAMERE), String(d)).toBe("");
    }
  });

  /* Testul care conteaza. `\b\d{4}\b` ar fi trecut toate cazurile de mai
     sus si ar fi cazut aici: 1000 nu e camera, iar 1002 e pret, nu camera. */
  it("nu confunda un pret cu o camera", () => {
    expect(cameraDinDetaliu("preț 1000 lei → 900 lei", CAMERE)).toBe("");
    expect(cameraDinDetaliu("Ion · preț 1002 lei → 900 lei", CAMERE)).toBe("");
  });

  it("gaseste camera adevarata chiar daca un pret o preceda", () => {
    expect(cameraDinDetaliu("preț 1002 lei · 1005 · 11.09", CAMERE)).toBe("1005");
  });

  /* Prima camera mentionata, nu prima din lista de camere: la o mutare,
     „de unde" e informatia care conteaza. */
  it("ia prima camera din text, nu cea mai mica", () => {
    expect(cameraDinDetaliu("Boiler · 1013, 1011", CAMERE)).toBe("1013");
    expect(cameraDinDetaliu("X: 1014 12.09 → 1002 12.09", CAMERE)).toBe("1014");
  });

  it("nu prinde un numar lipit de altceva", () => {
    expect(cameraDinDetaliu("cod 11002 generat", CAMERE)).toBe("");
    expect(cameraDinDetaliu("A1002B", CAMERE)).toBe("");
  });
});

/* Ziua e LOCALA, nu UTC: receptia lucreaza si dupa miezul noptii, iar o
   actiune de la 01:30 trebuie sa cada in ziua in care omul crede ca a
   facut-o. Datele sunt scrise fara `Z` tocmai ca testul sa nu depinda de
   fusul masinii care il ruleaza. */
describe("ziLocala", () => {
  it("da ziua calendaristica locala", () => {
    expect(ziLocala("2026-09-11T01:30:00")).toBe("2026-09-11");
    expect(ziLocala("2026-09-11T23:59:00")).toBe("2026-09-11");
  });

  it("tace pe o data stricata sau lipsa", () => {
    expect(ziLocala("nu-e-o-data")).toBe("");
    expect(ziLocala(null)).toBe("");
  });
});

const e = (id, ts, detail) => ({ id, ts, detail, action: "X", userName: "Y" });

const JURNAL = [
  e("a", "2026-09-10T08:00:00", "1005 → Curată"),
  e("b", "2026-09-11T09:00:00", "1002 · Cotaie Andrei"),
  e("c", "2026-09-09T07:00:00", "1005 · perioadă schimbată"),
  e("d", "2026-09-11T10:00:00", "Configurare tarife actualizată"),
  e("f", "2026-09-11T07:00:00", "1005 → Curată"),
];

describe("filtreazaJurnal", () => {
  it("camera goala inseamna toate", () => {
    expect(filtreazaJurnal(JURNAL, { camera: "" }, CAMERE)).toHaveLength(5);
  });

  it("filtreaza dupa camera aleasa, la fel ca selectul din ecran", () => {
    expect(filtreazaJurnal(JURNAL, { camera: "1005" }, CAMERE).map((x) => x.id))
      .toEqual(["a", "c", "f"]);
  });

  it("filtreaza dupa zi", () => {
    expect(filtreazaJurnal(JURNAL, { zi: "2026-09-11" }, CAMERE).map((x) => x.id))
      .toEqual(["b", "d", "f"]);
  });

  it("combina camera si zi", () => {
    expect(filtreazaJurnal(JURNAL, { camera: "1005", zi: "2026-09-11" }, CAMERE).map((x) => x.id))
      .toEqual(["f"]);
  });

  it("o camera fara nicio intrare da lista goala, nu toate", () => {
    expect(filtreazaJurnal(JURNAL, { camera: "1099" }, CAMERE)).toEqual([]);
  });

  it("nu se sufoca pe o lista lipsa", () => {
    expect(filtreazaJurnal(undefined, { camera: "1005" }, CAMERE)).toEqual([]);
  });
});

describe("ziiDistincte", () => {
  it("da zilele care chiar au o intrare, cea mai noua prima", () => {
    expect(ziiDistincte(JURNAL)).toEqual(["2026-09-11", "2026-09-10", "2026-09-09"]);
  });

  /* Motivul pentru care exista functia separat de grupeazaPeZi: optiunile
     selectului de Zi trebuie calculate DIN CAMERA ALEASA, nu din tot
     jurnalul — altfel ai putea alege o zi in care camera n-a avut nimic. */
  it("se ingusteaza la zilele unei singure camere", () => {
    const dinCamera = filtreazaJurnal(JURNAL, { camera: "1005" }, CAMERE);
    expect(ziiDistincte(dinCamera)).toEqual(["2026-09-11", "2026-09-10", "2026-09-09"]);
    const dinAlta = filtreazaJurnal(JURNAL, { camera: "1002" }, CAMERE);
    expect(ziiDistincte(dinAlta)).toEqual(["2026-09-11"]);
  });

  it("nu repeta o zi cu doua intrari", () => {
    expect(ziiDistincte(JURNAL).filter((z) => z === "2026-09-11")).toHaveLength(1);
  });

  it("nu se sufoca pe o lista lipsa", () => {
    expect(ziiDistincte(undefined)).toEqual([]);
  });
});

describe("grupeazaPeZi", () => {
  it("grupeaza pe zi calendaristica, cea mai noua zi prima", () => {
    const grupuri = grupeazaPeZi(JURNAL);
    expect(grupuri.map((g) => g.zi)).toEqual(["2026-09-11", "2026-09-10", "2026-09-09"]);
  });

  /* Testul care conteaza: in interiorul unei zile, ordinea NU e cea din
     lista primita — e cea mai noua intrare intai, mereu. Grupul de 11
     septembrie primeste b (09:00), d (10:00), f (07:00) in aceasta ordine
     din `JURNAL`, si trebuie sa iasa d, b, f — sortate descrescator pe ora,
     nu pastrate in ordinea de intrare. */
  it("in interiorul zilei, cea mai noua intrare e prima", () => {
    const grup11 = grupeazaPeZi(JURNAL).find((g) => g.zi === "2026-09-11");
    expect(grup11.intrari.map((x) => x.id)).toEqual(["d", "b", "f"]);
  });

  it("un singur grup pentru o singura zi", () => {
    const grupuri = grupeazaPeZi([e("x", "2026-09-05T10:00:00", "1001"), e("y", "2026-09-05T11:00:00", "1002")]);
    expect(grupuri).toHaveLength(1);
    expect(grupuri[0].intrari.map((z) => z.id)).toEqual(["y", "x"]);
  });

  it("nu se sufoca pe o lista lipsa", () => {
    expect(grupeazaPeZi(undefined)).toEqual([]);
  });
});

describe("etichetaZi", () => {
  /* Constructia trebuie sa fie din PARTILE sirului, nu din `new Date(zi)`:
     acela e miezul noptii UTC, iar la vest de Greenwich formatarea cu fus
     local ar fi aratat ziua precedenta. 11 septembrie 2026 e o vineri. */
  it("da ziua saptamanii si data, pentru o zi cunoscuta", () => {
    expect(etichetaZi("2026-09-11")).toBe("Vineri, 11.09.2026");
  });

  it("nu aluneca o zi in spate", () => {
    expect(etichetaZi("2026-01-01")).toMatch(/01\.01\.2026$/);
  });

  it("are un raspuns si pentru o zi lipsa/stricata", () => {
    expect(etichetaZi("")).toBe("Fără dată");
    expect(etichetaZi(undefined)).toBe("Fără dată");
  });
});
