/* Sortarea jurnalului dupa zi si dupa camera.
 *
 * Camera NU e un camp in `activity_log` — e text liber in `detail`. Tot ce
 * se poate strica aici se strica TACUT: o citire lacoma scoate camere care
 * nu exista (un pret de 1002 lei devine camera 1002), iar o sortare fara
 * cheie secundara amesteca cele patruzeci de intrari ale unei camere.
 *
 * Sirurile de mai jos sunt copiate din jurnalul real, nu inventate.
 */
import { describe, it, expect } from "vitest";
import { cameraDinDetaliu, ziLocala, sorteazaJurnal, COLOANE } from "./lib/jurnal.js";

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
     „de unde" e informatia care conteaza pentru sortare. */
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

  it("tace pe o data stricata", () => {
    expect(ziLocala("nu-e-o-data")).toBe("");
    expect(ziLocala(null)).toBe("");
  });
});

describe("sorteazaJurnal", () => {
  const e = (id, ts, detail) => ({ id, ts, detail, action: "X", userName: "Y" });
  /* ORDINEA DIN LISTA E DELIBERAT GRESITA pentru perechea de 1005: „c" (9
     sept) sta INAINTEA lui „a" (10 sept). `Array.sort` e stabil, deci un
     comparator care intoarce 0 pentru doua intrari ale aceleiasi camere ar
     lasa perechea asa cum a primit-o si ar trece testul fara sa sorteze
     nimic. Asezate invers, singurul fel in care ies corect e ca timpul sa
     fie chiar a doua cheie. */
  const intrari = [
    e("c", "2026-09-09T07:00:00", "1005 · perioadă schimbată"),
    e("b", "2026-09-11T09:00:00", "1002 · Cotaie Andrei"),
    e("a", "2026-09-10T08:00:00", "1005 → Curată"),
    e("d", "2026-09-11T10:00:00", "Configurare tarife actualizată"),
  ];

  it("implicit: cele mai noi intai", () => {
    expect(sorteazaJurnal(intrari, {}, CAMERE).map((x) => x.id))
      .toEqual(["d", "b", "a", "c"]);
  });

  it("intoarce sensul pe zi", () => {
    expect(sorteazaJurnal(intrari, { dupa: COLOANE.ZI, desc: false }, CAMERE).map((x) => x.id))
      .toEqual(["c", "a", "b", "d"]);
  });

  /* Cheia secundara e timpul, mereu descrescator: cand grupezi pe camera,
     ce cauti e „ce s-a intamplat la 1005, in ordine". Fara ea, cele doua
     intrari ale lui 1005 ar fi iesit intr-o ordine oarecare. */
  it("grupeaza pe camera si tine timpul ca a doua cheie", () => {
    const ids = sorteazaJurnal(intrari, { dupa: COLOANE.CAMERA, desc: false }, CAMERE)
      .map((x) => x.id);
    expect(ids).toEqual(["b", "a", "c", "d"]);
  });

  /* O actiune fara camera n-are ce cauta prima intr-o lista sortata pe
     camere — nici crescator, nici descrescator. */
  it("tine intrarile fara camera la coada in ambele sensuri", () => {
    for (const desc of [true, false]) {
      const ids = sorteazaJurnal(intrari, { dupa: COLOANE.CAMERA, desc }, CAMERE)
        .map((x) => x.id);
      expect(ids[ids.length - 1], `desc=${desc}`).toBe("d");
    }
  });

  it("nu modifica lista primita", () => {
    const copie = intrari.slice();
    sorteazaJurnal(intrari, { dupa: COLOANE.CAMERA }, CAMERE);
    expect(intrari).toEqual(copie);
  });

  it("nu se sufoca pe o lista lipsa", () => {
    expect(sorteazaJurnal(undefined, {}, CAMERE)).toEqual([]);
    expect(sorteazaJurnal(null, { dupa: COLOANE.CAMERA }, CAMERE)).toEqual([]);
  });
});
