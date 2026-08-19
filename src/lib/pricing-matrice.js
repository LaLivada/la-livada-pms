/* Matricea de referință pentru tariful pe noapte.
 *
 * ACESTA E CONTRACTUL dintre cele două implementări ale prețului:
 *   · JS  — nightlyRate() din ./pricing.js
 *   · SQL — nightly_rate() din schema.sql
 *
 * Amândouă trebuie să producă exact valorile de mai jos. Verificarea:
 *   · JS  → src/pricing.test.js  (rulează la `npm test`)
 *   · SQL → tests/paritate-pret.sql (de rulat în SQL Editor)
 *
 * De ce există: până în 19 august 2026 cele două formule difereau la 22
 * din 24 de combinații, între −220 și +50 lei pe noapte. Motivul era
 * structural — `nightly_rate(room_type, date)` nici nu primea ocuparea,
 * deci nu putea aplica tariful single sau suplimentele. Site-ul public
 * cota un preț, PMS-ul înregistra altul.
 *
 * Dacă modifici formula, actualizează matricea DELIBERAT, într-un commit
 * separat de restul schimbărilor — ca diferența de preț să fie vizibilă
 * la review, nu ascunsă într-un refactor.
 *
 * Valorile presupun tarifele din TARIFE_REFERINTA de mai jos, nu pe cele
 * din baza de date: testul verifică formula, nu configurarea curentă.
 */

export const TARIFE_REFERINTA = {
  base: {
    tiny: 300, loft: 350,
    tinySingle: 280, loftSingle: 300,
    adultSupplement: 80, childSupplement: 30,
  },
  seasons: [],
};

/* [tip, adulți, copii, tarif pe noapte]
 *
 * Regulile pe care le codifică:
 *  · tariful single se aplică STRICT la 1 adult și 0 copii, și
 *    ÎNLOCUIEȘTE standardul (nu se adaugă peste el);
 *  · suplimentul de adult se aplică doar peste 2 adulți;
 *  · suplimentul de copil se aplică pentru fiecare copil, indiferent
 *    câți adulți sunt.
 */
export const MATRICE_TARIF = [
  ["tiny", 1, 0, 280],   // single: 280, nu 300
  ["tiny", 1, 1, 330],   // copilul anulează tariful single: 300 + 30
  ["tiny", 1, 2, 360],
  ["tiny", 2, 0, 300],   // ocuparea standard — singura care coincidea înainte
  ["tiny", 2, 1, 330],
  ["tiny", 2, 2, 360],
  ["tiny", 3, 0, 380],   // 300 + 80 (al treilea adult)
  ["tiny", 3, 1, 410],
  ["tiny", 3, 2, 440],
  ["tiny", 4, 0, 460],   // 300 + 2×80
  ["tiny", 4, 1, 490],
  ["tiny", 4, 2, 520],
  ["loft", 1, 0, 300],
  ["loft", 1, 1, 380],
  ["loft", 1, 2, 410],
  ["loft", 2, 0, 350],
  ["loft", 2, 1, 380],
  ["loft", 2, 2, 410],
  ["loft", 3, 0, 430],
  ["loft", 3, 1, 460],
  ["loft", 3, 2, 490],
  ["loft", 4, 0, 510],
  ["loft", 4, 1, 540],
  ["loft", 4, 2, 570],
];
