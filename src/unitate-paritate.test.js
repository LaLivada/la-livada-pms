/* Coloana „UM" de pe coala din PMS și `measuringUnit` trimis în Oblio spun
 * același lucru.
 *
 * Regula stă în două locuri care nu pot împărți cod: `unitateLinie` rulează în
 * browser, `formeazaLinie` în funcția edge. Dacă se despart, omul vede „noapte"
 * pe factura din PMS și primește „buc" pe documentul fiscal din Oblio — și nu
 * află decât când îl întreabă contabila. Testul le dă aceleași linii.
 */
import { describe, it, expect } from "vitest";
import { unitateLinie, unitateProdus, UM_IMPLICITA, UM_TOTAL_GRUP } from "./lib/unitate.js";
import { formeazaLinie } from "../supabase/functions/oblio-facturare/oblio.ts";

const PRODUSE = [
  { id: "prod-cazare", unit: "noapte", category: "cazare" },
  { id: "prod-bar", unit: "buc", category: "bar" },
  { id: "prod-fara", unit: "", category: "diverse" },
];

/* Aceeași linie, în cele două forme: clientul are `product_id` + nomenclatorul,
   funcția edge primește produsul încorporat de PostgREST. */
const linie = (campuri) => {
  const produs = PRODUSE.find((p) => p.id === campuri.product_id) || null;
  return {
    client: campuri,
    edge: { ...campuri, products: produs ? { unit: produs.unit, category: produs.category } : null, invoice_item_links: [] },
  };
};

describe("unitatea de măsură: PMS și Oblio", () => {
  const cazuri = [
    ["unitatea scrisă pe linie câștigă", { unit: "serv", product_id: "prod-cazare" }, "serv"],
    ["fără unitate pe linie, a produsului", { unit: null, product_id: "prod-cazare" }, "noapte"],
    ["produs cu unitatea goală", { unit: null, product_id: "prod-fara" }, UM_IMPLICITA],
    ["linie fără produs și fără unitate", { unit: null, product_id: null }, UM_IMPLICITA],
    ["produs care nu mai există în nomenclator", { unit: null, product_id: "sters" }, UM_IMPLICITA],
    ["șirul gol pe linie nu e o unitate", { unit: "", product_id: "prod-bar" }, "buc"],
  ];
  for (const [nume, campuri, asteptat] of cazuri) {
    it(nume, () => {
      const { client, edge } = linie(campuri);
      expect(unitateLinie(client, PRODUSE)).toBe(asteptat);
      expect(formeazaLinie(edge).unit).toBe(asteptat);
    });
  }

  it("linia „Doar totalul” a grupului nu moștenește „noapte”", () => {
    const { client, edge } = linie({ unit: UM_TOTAL_GRUP, product_id: "prod-cazare" });
    expect(unitateLinie(client, PRODUSE)).toBe("serv");
    expect(formeazaLinie(edge).unit).toBe("serv");
    /* …dar rămâne „Serviciu" pentru Oblio: categoria vine tot din produs. */
    expect(formeazaLinie(edge).category).toBe("cazare");
  });

  it("unitateProdus nu se supără pe un nomenclator lipsă", () => {
    expect(unitateProdus(null, "prod-cazare")).toBe(UM_IMPLICITA);
    expect(unitateProdus(undefined, null)).toBe(UM_IMPLICITA);
  });
});
