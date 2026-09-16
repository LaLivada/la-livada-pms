// @ts-check
import { describe, it, expect } from "vitest";
import { valideazaCerere, mesajImplicit, LIMITE } from "./lib/retragere.js";

const buna = {
  nume: "  Ion   Popescu ",
  email: " Ion.Popescu@Example.COM ",
  rezervare: " ll-2026-0042 ",
  sosire: "2026-10-03",
  mesaj: mesajImplicit(),
};

describe("valideazaCerere", () => {
  it("acceptă o cerere completă și curăță câmpurile", () => {
    const r = valideazaCerere(buna);
    expect(r.valid).toBe(true);
    expect(r.erori).toEqual({});
    expect(r.date).toEqual({
      nume: "Ion Popescu",
      email: "ion.popescu@example.com",
      rezervare: "LL-2026-0042",
      sosire: "2026-10-03",
      mesaj: mesajImplicit(),
    });
  });

  it("numărul rezervării și data sosirii sunt opționale", () => {
    const r = valideazaCerere({ ...buna, rezervare: "", sosire: "" });
    expect(r.valid).toBe(true);
  });

  it("cere nume, email și mesaj", () => {
    const r = valideazaCerere({ nume: "", email: "", mesaj: "" });
    expect(r.valid).toBe(false);
    expect(Object.keys(r.erori).sort()).toEqual(["email", "mesaj", "nume"]);
  });

  it("refuză un email fără domeniu și unul cu spații", () => {
    expect(valideazaCerere({ ...buna, email: "ion@" }).erori.email).toBeTruthy();
    expect(valideazaCerere({ ...buna, email: "ion popescu@example.com" }).erori.email).toBeTruthy();
  });

  it("refuză o dată care nu e ISO sau nu există", () => {
    expect(valideazaCerere({ ...buna, sosire: "03.10.2026" }).erori.sosire).toBeTruthy();
    expect(valideazaCerere({ ...buna, sosire: "2026-13-40" }).erori.sosire).toBeTruthy();
  });

  it("respectă limitele de lungime", () => {
    expect(valideazaCerere({ ...buna, nume: "A" }).erori.nume).toBeTruthy();
    expect(valideazaCerere({ ...buna, nume: "A".repeat(LIMITE.nume.max + 1) }).erori.nume).toBeTruthy();
    expect(valideazaCerere({ ...buna, mesaj: "x".repeat(LIMITE.mesaj.max + 1) }).erori.mesaj).toBeTruthy();
    expect(valideazaCerere({ ...buna, rezervare: "x".repeat(LIMITE.rezervare.max + 1) }).erori.rezervare).toBeTruthy();
  });

  it("nu cade pe câmpuri lipsă sau de alt tip", () => {
    const r = valideazaCerere({ nume: 42, email: null });
    expect(r.valid).toBe(false);
    expect(r.date.email).toBe("");
  });
});
