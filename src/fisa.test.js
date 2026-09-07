import { describe, it, expect } from "vitest";
import { CAMPURI, ACT_TIPURI, campuriLipsa, valideazaFisa,
         precompletareDinOaspete } from "./lib/fisa.js";

const completa = {
  nume: "Popescu", prenume: "Ion",
  dataNasterii: "1980-05-14", loculNasterii: "Vaslui",
  nationalitate: "română", tara: "România",
  adresa: "Str. Ștefan cel Mare 12", localitate: "Vaslui",
  scopul: "turism", actTip: "ci", actSeria: "VS", actNumarul: "123456",
};

describe("campurile fisei", () => {
  it("fiecare camp are cheie, eticheta si daca e obligatoriu", () => {
    for (const c of CAMPURI) {
      expect(typeof c.cheie).toBe("string");
      expect(typeof c.eticheta).toBe("string");
      expect(typeof c.obligatoriu).toBe("boolean");
    }
  });

  /* Campurile sensibile nu se precompleteaza niciodata (docs/fisa-cazare.md
     3). Regula traieste in date, nu in componenta, ca sa poata fi verificata
     aici — intr-o componenta ar fi ramas o promisiune. */
  it("campurile sensibile sunt marcate ca atare", () => {
    const sensibile = CAMPURI.filter((c) => c.sensibil).map((c) => c.cheie);
    expect(sensibile).toContain("dataNasterii");
    expect(sensibile).toContain("loculNasterii");
    expect(sensibile).toContain("actTip");
    expect(sensibile).toContain("actSeria");
    expect(sensibile).toContain("actNumarul");
  });

  it("nationalitatea si tara sunt campuri diferite", () => {
    // Coala tiparita le confunda; vezi docs/fisa-cazare.md 1.
    const chei = CAMPURI.map((c) => c.cheie);
    expect(chei).toContain("nationalitate");
    expect(chei).toContain("tara");
  });
});

describe("campuri lipsa", () => {
  it("o fisa completa nu are niciunul", () => {
    expect(campuriLipsa(completa)).toEqual([]);
  });

  it("le numeste pe cele goale", () => {
    const { loculNasterii, actNumarul, ...rest } = completa;
    expect(loculNasterii && actNumarul).toBeTruthy();   // intrarea e valida
    expect(campuriLipsa(rest).sort()).toEqual(["actNumarul", "loculNasterii"]);
  });

  it("spatiile nu tin loc de valoare", () => {
    expect(campuriLipsa({ ...completa, scopul: "   " })).toEqual(["scopul"]);
  });

  it("seria nu e obligatorie — pasapoartele n-au", () => {
    expect(campuriLipsa({ ...completa, actSeria: "" })).toEqual([]);
  });
});

describe("validarea", () => {
  it("trece o fisa completa", () => {
    expect(valideazaFisa(completa).ok).toBe(true);
  });

  it("refuza o data a nasterii din viitor", () => {
    const r = valideazaFisa({ ...completa, dataNasterii: "2100-01-01" });
    expect(r.ok).toBe(false);
    expect(r.erori.dataNasterii).toBeTruthy();
  });

  it("refuza o varsta imposibila", () => {
    // Peste 120 de ani inseamna aproape sigur o cifra gresita la an.
    const r = valideazaFisa({ ...completa, dataNasterii: "1850-01-01" });
    expect(r.ok).toBe(false);
  });

  it("refuza un tip de act necunoscut", () => {
    const r = valideazaFisa({ ...completa, actTip: "card-bibliotecă" });
    expect(r.ok).toBe(false);
    expect(r.erori.actTip).toBeTruthy();
  });

  it("accepta toate tipurile declarate", () => {
    for (const t of ACT_TIPURI) {
      expect(valideazaFisa({ ...completa, actTip: t.cheie }).ok).toBe(true);
    }
  });

  it("aduna toate erorile, nu se opreste la prima", () => {
    // Un formular care arata o singura greseala pe rand se completeaza de
    // trei ori. Oaspetele e in fata usii.
    const r = valideazaFisa({ ...completa, dataNasterii: "", actTip: "" });
    expect(Object.keys(r.erori).length).toBeGreaterThanOrEqual(2);
  });

  it("nu se sufoca pe o fisa lipsa cu totul", () => {
    // Prima randare a formularului trimite `{}`; un throw aici ar cadea
    // pagina inainte ca oaspetele sa vada vreun camp.
    expect(valideazaFisa(undefined).ok).toBe(false);
    expect(campuriLipsa(undefined).length).toBeGreaterThan(0);
  });
});

/* Precompletarea de la receptie. Doua lucruri se pot strica tacut aici:
   sa ajunga in formular ceva sensibil, si sa ajunga valorile de umplutura
   din baza. Niciuna n-ar da vreo eroare — ar da o fisa gresita, aflata la un
   control. */
describe("precompletarea din fisa oaspetelui", () => {
  const oaspete = {
    id: "g1", lastName: "Popescu", firstName: "Ion",
    address: "Str. Ștefan cel Mare 12", city: "Vaslui", country: "România",
    county: "Vaslui", phone: "0722000000", email: "ion@example.com",
  };

  it("ia exact cele cinci campuri nesensibile", () => {
    expect(precompletareDinOaspete(oaspete)).toEqual({
      nume: "Popescu", prenume: "Ion",
      adresa: "Str. Ștefan cel Mare 12", localitate: "Vaslui", tara: "România",
    });
  });

  /* Cheia asta e testul care conteaza. Cine adauga maine o linie in
     DIN_OASPETE pentru data nasterii sau pentru seria actului, o vede cazand
     aici, nu la un control. */
  it("nu scoate niciodata un camp sensibil", () => {
    const sensibile = CAMPURI.filter((c) => c.sensibil).map((c) => c.cheie);
    const scoase = Object.keys(precompletareDinOaspete(oaspete));
    for (const cheie of sensibile) expect(scoase).not.toContain(cheie);
  });

  /* `snakeGuest` scrie „-" ca umplutura la last_name, first_name si city.
     Precompletat cu „-", campul ARATA completat, trece de validare si intra
     asa pe coala. Mai bine gol: golul se vede. */
  it("sare peste valorile de umplutura din baza", () => {
    const date = precompletareDinOaspete({ ...oaspete, city: "-", lastName: "-" });
    expect(date).not.toHaveProperty("localitate");
    expect(date).not.toHaveProperty("nume");
    expect(date.prenume).toBe("Ion");
  });

  it("sare peste golurile si spatiile", () => {
    const date = precompletareDinOaspete({ lastName: "Popescu", firstName: "  ", address: null });
    expect(date).toEqual({ nume: "Popescu" });
  });

  /* Nationalitatea nu se deduce din tara de domiciliu — vezi comentariul de
     la campuri. Un roman cu domiciliul in Germania ar fi iesit „german". */
  it("nu deduce nationalitatea din tara", () => {
    expect(precompletareDinOaspete({ ...oaspete, country: "Germania" }))
      .not.toHaveProperty("nationalitate");
  });

  it("nu se sufoca pe un oaspete lipsa", () => {
    expect(precompletareDinOaspete(null)).toEqual({});
    expect(precompletareDinOaspete(undefined)).toEqual({});
  });
});
