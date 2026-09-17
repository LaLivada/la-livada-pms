/* Captura pentru PDF nu are voie să prindă documentul micșorat.
 *
 * Coala facturii stă pe ecran într-un `transform: scale(...)` ca să încapă în
 * fereastră. html2canvas ia dimensiunea VIZUALĂ a elementului, nu pe cea din
 * așezare: cu scara de telefon (0.43), factura de 794px a ieșit pe 17
 * septembrie 2026 într-un canvas de 343px — conținutul unei coli A4 înghesuit
 * pe o treime din lățime, cu literele călcate una peste alta. Pe ecran arăta
 * perfect; se vedea doar în PDF-ul descărcat.
 */
import { describe, it, expect } from "vitest";
import { opresteTransformarile } from "./lib/pdf.js";

/* `bunic > parinte > tinta`, cu transformarea pe mijloc, ca în aplicație:
   `.inv-sheet-wrap > .inv-scaler > .inv-sheet`. */
function arbore({ peTinta = "" } = {}) {
  const bunic = document.createElement("div");
  const parinte = document.createElement("div");
  const tinta = document.createElement("div");
  parinte.style.transform = "scale(0.43)";
  if (peTinta) tinta.style.transform = peTinta;
  parinte.appendChild(tinta);
  bunic.appendChild(parinte);
  document.body.appendChild(bunic);
  return { bunic, parinte, tinta };
}

describe("opresteTransformarile", () => {
  it("oprește scalarea de pe strămoși cât ține captura și o pune la loc", () => {
    const { parinte, tinta } = arbore();
    const reporneste = opresteTransformarile(tinta);
    expect(parinte.style.transform).toBe("none");
    reporneste();
    expect(parinte.style.transform).toBe("scale(0.43)");
  });

  it("nu atinge elementul capturat — transformarea LUI ține de document", () => {
    const { tinta } = arbore({ peTinta: "rotate(2deg)" });
    opresteTransformarile(tinta);
    expect(tinta.style.transform).toBe("rotate(2deg)");
  });

  it("prinde toți strămoșii transformați, nu doar primul", () => {
    const { bunic, parinte, tinta } = arbore();
    bunic.style.transform = "translateY(10px)";
    const reporneste = opresteTransformarile(tinta);
    expect([bunic.style.transform, parinte.style.transform]).toEqual(["none", "none"]);
    reporneste();
    expect([bunic.style.transform, parinte.style.transform]).toEqual(["translateY(10px)", "scale(0.43)"]);
  });

  it("nu se supără pe un element care nu există", () => {
    expect(() => opresteTransformarile(null)()).not.toThrow();
  });
});
