// @ts-check
/* Datele emitentului care au o valoare de pornire.
 *
 * Emitentul se completează în Financiar → Date emitent și stă ca obiect simplu
 * în setări. Trei câmpuri au apărut după ce obiectul era deja salvat (capitalul
 * social, site-ul) sau pot lipsi (emailul); până le scrie cineva, antetul
 * facturii și formularul arată valorile de aici — aceleași în ambele locuri,
 * ca omul să nu vadă „5000 RON" pe factură și un câmp gol în setări.
 *
 * Testul e pe `undefined`, nu pe „fals": un câmp golit dinadins (șir gol)
 * rămâne gol și ascunde rândul de pe factură.
 */
export const ANTET_IMPLICIT = Object.freeze({
  capitalSocial: "5000 RON",
  website: "www.lalivada.ro",
  email: "office@lalivada.com",
});

/**
 * @param {Record<string, any>|null|undefined} emitent
 * @param {keyof typeof ANTET_IMPLICIT} camp
 * @returns {string}
 */
export function dinAntet(emitent, camp) {
  const valoare = emitent?.[camp];
  return valoare === undefined || valoare === null ? ANTET_IMPLICIT[camp] : String(valoare);
}
