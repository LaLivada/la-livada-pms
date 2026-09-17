// @ts-check
/* Unitatea de măsură a unei linii de factură — coloana „UM" de pe coală.
 *
 * Aceeași regulă ca în funcția edge (`formeazaLinie` din
 * supabase/functions/oblio-facturare/oblio.ts), fiindcă ce scrie pe coala din
 * PMS și ce ajunge pe documentul din Oblio trebuie să fie același lucru.
 * Cele două nu pot împărți cod (rulează în locuri diferite), așa că
 * `src/unitate-paritate.test.js` le compară pe aceleași intrări.
 */

/** Ce scrie când nu se știe nimic despre linie. La fel ca în funcția edge. */
export const UM_IMPLICITA = "buc";

/* Linia „Doar totalul" a unei facturi de grup adună zeci de nopți din camere
   diferite într-o singură poziție cu cantitatea 1. N-are un produs al ei, iar
   dacă ar moșteni unitatea cazării ar ieși „1 noapte" pentru tot sejurul. */
export const UM_TOTAL_GRUP = "serv";

/**
 * Unitatea unui produs din nomenclator, după id.
 * @param {{ id: string, unit?: string|null }[]|null|undefined} produse
 * @param {string|null|undefined} idProdus
 */
export function unitateProdus(produse, idProdus) {
  if (!idProdus) return UM_IMPLICITA;
  return (produse || []).find((p) => p.id === idProdus)?.unit || UM_IMPLICITA;
}

/**
 * Unitatea de afișat pentru o linie de factură: întâi cea scrisă pe linie
 * (instantaneul de la crearea facturii), apoi a produsului, apoi „buc".
 * @param {{ unit?: string|null, product_id?: string|null }} linie
 * @param {{ id: string, unit?: string|null }[]|null|undefined} produse
 */
export function unitateLinie(linie, produse) {
  return linie?.unit || unitateProdus(produse, linie?.product_id);
}
