/* Bani — un singur loc unde se decide cum se rotunjeste.
 *
 * Motivul existentei acestui fisier: pana acum sumele se calculau in
 * virgula mobila si se rotunjeau DOAR la afisare. O impartire obisnuita
 * (ex. 500 lei / 3 nopti) producea 166.66666666666666, valoare care
 * ajungea ca atare in baza de date, in timp ce ecranul arata 167 —
 * doua adevaruri diferite despre aceeasi factura.
 *
 * Regula: orice suma care ajunge intr-un insert/update trece intai prin
 * `round2`. Afisarea poate rotunji mai departe cum vrea, dar nu mai
 * poate diverge de ce e stocat.
 */

/* Conversie la numar care nu arunca NICIODATA.
 *
 * `Number(v)` pare inofensiv, dar arunca TypeError pentru obiectele care
 * nu au nicio cale de conversie la primitiva — de pilda `{toString: null}`,
 * unde nici valueOf nici toString nu pot fi apelate. Nu sunt valori pe
 * care le scrie cineva de mana, dar ajung usor dintr-un JSON stricat sau
 * dintr-un raspuns neasteptat. Iar aici vorbim de bani: o exceptie in
 * mijlocul unui calcul de factura opreste salvarea cu totul, in loc sa
 * lase functia sa-si respecte contractul.
 *
 * Gasit de testele de proprietate, dar in CI, nu local: fast-check
 * foloseste alt seed la fiecare rulare, deci contraexemplul apare doar
 * uneori. Rulase de zeci de ori aici fara sa-l nimereasca. */
function numar(v) {
  try {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  } catch {
    return 0;
  }
}

/* Rotunjire la 2 zecimali, ferita de erorile clasice de virgula mobila
 * (Math.round(1.005 * 100) da 100 in loc de 101, pentru ca 1.005 e de
 * fapt 1.00499999... in binar). Trecerea prin reprezentarea zecimala
 * inainte de inmultire evita cazul. */
export function round2(n) {
  const x = numar(n);
  const rotunjit = Math.round((x + Number.EPSILON) * 100) / 100;
  /* Inmultirea cu 100 poate depasi limita numerelor pentru valori
     absurd de mari (peste ~1.79e306) si intoarce Infinity — adica exact
     ce promite functia ca nu face. Verificam si rezultatul, nu doar
     intrarea. Gasit de testele de proprietate din invarianti.property.test.js.  */
  return Number.isFinite(rotunjit) ? rotunjit : 0;
}

/* Impartirea unei sume la un numar de parti, fara sa se piarda bani:
 * restul se distribuie cate un ban la primele parti, astfel incat suma
 * partilor sa fie exact totalul initial. */
export function splitEvenly(total, parts) {
  // `numar` si aici: Math.floor arunca pe aceleasi valori ca Number.
  const n = Math.max(1, Math.floor(numar(parts)));
  const bani = Math.round(round2(total) * 100);
  const cota = Math.floor(bani / n);
  const rest = bani - cota * n;
  return Array.from({ length: n }, (_, i) => (cota + (i < rest ? 1 : 0)) / 100);
}

/* Descompune o suma CU TVA inclus (conventia din aplicatie: tarifele
 * afisate sunt cu TVA) in baza + TVA. Toate cele trei valori se
 * rotunjesc, iar TVA-ul se calculeaza ca diferenta fata de total ca sa
 * nu apara un ban in plus/minus din dubla rotunjire. */
export function calcAmounts(unitPrice, quantity, vatRate) {
  const total = round2(numar(unitPrice) * numar(quantity));
  const vat = numar(vatRate);
  const net = round2(total / (1 + vat / 100));
  return { totalAmount: total, netAmount: net, vatAmount: round2(total - net) };
}
