/* Matricele de referință pentru preț.
 *
 * ACESTA E CONTRACTUL dintre cele două implementări. Are două părți:
 *   1. tariful pe noapte — nightlyRate() ↔ nightly_rate()
 *   2. ajustarea online  — onlineNightAdjustmentPct() ↔
 *      online_adjustment_for_occupancy(), plus însumarea și rotunjirea
 *      din liveReservationTotalOnline() ↔ stay_total()
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

/* ------------------------------------------------------------------
   Partea a doua a contractului: ajustarea online pe grad de ocupare.
   · JS  — onlineNightAdjustmentPct() + bucla din liveReservationTotalOnline()
   · SQL — online_adjustment_for_occupancy() + expresia din stay_total()
   ------------------------------------------------------------------ */

/* Pragurile pe care le presupun matricele de mai jos. NU sunt neapărat
   cele configurate în baza de date — testul verifică formula, nu
   configurarea curentă. Partea SQL le injectează într-o tranzacție care
   se anulează la final. */
export const PRAGURI_ONLINE_REFERINTA = [
  { min: 0,  max: 30,  adjustmentPct: -5 },
  { min: 30, max: 50,  adjustmentPct: 0 },
  { min: 50, max: 70,  adjustmentPct: 5 },
  { min: 70, max: 90,  adjustmentPct: 10 },
  { min: 90, max: 100, adjustmentPct: 15 },
];

/* [grad de ocupare %, ajustare aplicată %]
 *
 * Codifică trei reguli:
 *  · pragul se prinde pe [min, max) — capătul de jos inclusiv;
 *  · ultimul prag e inclusiv și la capătul de sus, altfel 100% n-ar
 *    cădea nicăieri;
 *  · procentele negative se taie la 0 — online nu se coboară niciodată
 *    sub tariful de bază.
 */
export const MATRICE_AJUSTARE = [
  [0,      0],   // pragul spune −5, dar reducerile nu se aplică
  [15,     0],
  [29.99,  0],
  [30,     0],   // limita de jos aparține pragului următor
  [49.99,  0],
  [50,     5],
  [69.99,  5],
  [70,    10],
  [89.99, 10],
  [90,    15],
  [99.99, 15],
  [100,   15],   // capătul de sus, tratat inclusiv
];

/* [[tarif noapte, ajustare %], …] → total rotunjit pe sejur.
 *
 * Aici a apărut divergența reală din 19 august 2026: SQL dădea 403 și JS
 * 402 pentru 350 lei la +15%. `350 * 1.15` în virgulă mobilă e
 * 402,49999999999997, deci Math.round coboară; `numeric` în Postgres
 * obține exact 402,50 și urcă. Ambele calculează acum ca
 * `tarif * (100 + pct) / 100`, formă în care valorile de tip „exact .5"
 * rămân exacte și în binar.
 *
 * Cazurile cu .5 sunt majoritare deliberat — restul rotunjirilor nu au
 * cum să diveargă. Notă: Math.round urcă la +∞, iar round() din Postgres
 * se depărtează de zero; pentru sume pozitive coincid, iar ajustările
 * fiind tăiate la 0 nu pot apărea valori negative aici.
 */
export const MATRICE_ROTUNJIRE = [
  [[[350, 15]],            403],  // 402,50 — cazul care diverge
  [[[350,  5]],            368],  // 367,50
  [[[330, 15]],            380],  // 379,50
  [[[410,  5]],            431],  // 430,50
  [[[350,  5], [350, 10]], 753],  // 367,50 + 385 = 752,50
  [[[300, 10], [300, 15]], 675],  // 330 + 345, fără fracții
  [[[300,  0]],            300],  // zi goală: tariful neatins
  [[[280,  5]],            294],
];
