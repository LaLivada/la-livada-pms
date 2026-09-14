/* Insigna cu sursa rezervarii de pe barele din calendar. Ce s-ar strica
 * tacut: o sursa noua in SOURCES fara insigna (bara ramane fara, nu cu una
 * goala), sau o insigna cu litera fara numele sursei pentru cititorul de
 * ecran.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InsignaSursa } from "./features/rezervari/insigna-sursa.jsx";
import { SOURCES } from "./lib/constante.js";

const html = (sursa) => renderToStaticMarkup(React.createElement(InsignaSursa, { sursa }));

describe("InsignaSursa", () => {
  it("Booking.com si Airbnb au litera lor, cu numele sursei pentru cititorul de ecran", () => {
    expect(html("booking")).toContain(">B<");
    expect(html("booking")).toContain('aria-label="Booking.com"');
    expect(html("booking")).toContain("bar-sursa-booking");
    expect(html("airbnb")).toContain(">A<");
    expect(html("airbnb")).toContain('aria-label="Airbnb"');
  });

  it("sursele generice au pictograma; o sursa necunoscuta n-are insigna deloc", () => {
    expect(html("phone")).toContain("<svg");
    expect(html("phone")).toContain('aria-label="Telefon"');
    expect(html("necunoscuta")).toBe("");
    expect(html(undefined)).toBe("");
  });

  it("fiecare sursa din SOURCES are o insigna", () => {
    for (const { key } of SOURCES) expect(html(key), key).toContain("bar-sursa-" + key);
  });
});
