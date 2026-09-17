/* Liniile unei facturi de grup.
 *
 * Aici se decide ce scrie pe factura firmei care plătește pentru zece
 * camere: fie fiecare consum pe rândul lui, fie un singur total. Greșelile
 * posibile sunt greșeli de bani — o poziție pierdută, o cotă de TVA
 * amestecată cu alta, un total care nu mai iese — de-aia are test propriu,
 * separat de fereastra care îl folosește.
 */
import { describe, it, expect } from "vitest";
import { liniiDinCamere } from "./lib/factura-grup.js";

const pozitie = (id, name, total, cota = 9, extra = {}) => ({
  id, name, category: "cazare", product_id: "p1",
  quantity: 1, unit_price: total, vat_rate: cota,
  net_amount: Math.round((total / (1 + cota / 100)) * 100) / 100,
  vat_amount: Math.round((total - total / (1 + cota / 100)) * 100) / 100,
  total_amount: total, ...extra,
});

const CAMERE = [
  { camera: { name: "1001" }, pozitii: [pozitie("a", "Cazare", 300), pozitie("b", "Mic dejun", 60, 9)] },
  { camera: { name: "1002" }, pozitii: [pozitie("c", "Cazare", 300)] },
];

describe("liniiDinCamere — detaliat pe camere", () => {
  it("scoate o linie de fiecare poziție, cu numărul camerei în nume", () => {
    const linii = liniiDinCamere(CAMERE, "camere", "Excursie Cluj");
    expect(linii.map((l) => l.name)).toEqual([
      "Cazare · camera 1001", "Mic dejun · camera 1001", "Cazare · camera 1002",
    ]);
    expect(linii.map((l) => l.sourceIds)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("copiază sumele neatinse — factura arată exact ce s-a consumat", () => {
    const [prima] = liniiDinCamere(CAMERE, "camere", "Excursie Cluj");
    expect(prima.totalAmount).toBe(300);
    expect(prima.netAmount).toBe(CAMERE[0].pozitii[0].net_amount);
    expect(prima.vatAmount).toBe(CAMERE[0].pozitii[0].vat_amount);
    expect(prima.vatRate).toBe(9);
    expect(prima.productId).toBe("p1");
  });

  it("pune pe fiecare linie unitatea produsului ei", () => {
    const produse = [{ id: "p1", unit: "noapte" }];
    const linii = liniiDinCamere(CAMERE, "camere", "G", produse);
    expect(linii.map((l) => l.unit)).toEqual(["noapte", "noapte", "noapte"]);
    /* Fără nomenclator nu ghicește: „buc", ca în funcția edge. */
    expect(liniiDinCamere(CAMERE, "camere", "G").map((l) => l.unit)).toEqual(["buc", "buc", "buc"]);
  });

  it("sare peste camerele fără poziții de facturat", () => {
    const cu = [...CAMERE, { camera: { name: "1003" }, pozitii: [] }];
    expect(liniiDinCamere(cu, "camere", "G").length).toBe(3);
  });
});

describe("liniiDinCamere — doar totalul", () => {
  it("adună tot într-o linie când cota e una singură", () => {
    const linii = liniiDinCamere(CAMERE, "total", "Excursie Cluj");
    expect(linii.length).toBe(1);
    expect(linii[0].name).toBe("Servicii de cazare · grupul Excursie Cluj");
    expect(linii[0].totalAmount).toBe(660);
    expect(linii[0].quantity).toBe(1);
    /* „1 noapte" pentru tot sejurul a două camere ar fi fals: linia de total
       își are unitatea ei, chiar dacă produsul e cazarea. */
    expect(linii[0].unit).toBe("serv");
    expect(liniiDinCamere(CAMERE, "total", "G", [{ id: "p1", unit: "noapte" }])[0].unit).toBe("serv");
    expect(linii[0].sourceIds).toEqual(["a", "b", "c"]);
  });

  it("rupe pe cote de TVA — o linie nu poate purta două", () => {
    const amestec = [
      { camera: { name: "1001" }, pozitii: [pozitie("a", "Cazare", 300, 9)] },
      { camera: { name: "1002" }, pozitii: [pozitie("b", "Bar", 100, 21)] },
    ];
    const linii = liniiDinCamere(amestec, "total", "Firma X");
    expect(linii.length).toBe(2);
    expect(linii.map((l) => l.name)).toEqual([
      "Servicii de cazare · grupul Firma X · TVA 9%",
      "Servicii de cazare · grupul Firma X · TVA 21%",
    ]);
    expect(linii.map((l) => l.totalAmount)).toEqual([300, 100]);
  });

  it("nu pierde bani: suma liniilor e suma pozițiilor", () => {
    const camere = [
      { camera: { name: "1001" }, pozitii: [pozitie("a", "Cazare", 166.67), pozitie("b", "Cazare", 166.67)] },
      { camera: { name: "1002" }, pozitii: [pozitie("c", "Cazare", 166.66, 21)] },
    ];
    const linii = liniiDinCamere(camere, "total", "G");
    const totalPozitii = camere.flatMap((c) => c.pozitii).reduce((s, p) => s + p.total_amount, 0);
    const totalLinii = linii.reduce((s, l) => s + l.totalAmount, 0);
    expect(Math.round(totalLinii * 100)).toBe(Math.round(totalPozitii * 100));
    /* Și baza + TVA se închid pe fiecare linie. */
    for (const l of linii) expect(l.netAmount + l.vatAmount).toBeCloseTo(l.totalAmount, 2);
  });

  it("fără camere alese nu scoate nicio linie", () => {
    expect(liniiDinCamere([], "total", "G")).toEqual([]);
    expect(liniiDinCamere([{ camera: { name: "1001" }, pozitii: [] }], "total", "G")).toEqual([]);
  });
});
