/* Reguli de tranzitie a unei rezervari — logica pura, fara React si fara
 * acces la baza de date, ca sa poata fi testata direct.
 *
 * Extrase din pms-app.jsx dintr-un motiv concret: comentariul de acolo
 * pretindea ca sunt "single source of truth", dar ReservationModal.saveInner
 * reimplementa regula de check-in cu isSameDay direct. Doua implementari ale
 * aceleiasi reguli diverg mai devreme sau mai tarziu — si atunci butonul
 * permite ceva ce salvarea refuza. Aici exista o singura definitie, iar
 * pms-app.jsx o importa.
 */

import { startOfDay } from "./availability.js";

export function isSameDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function isToday(d) { return isSameDay(d, new Date()); }

/* Cat de devreme se poate caza un oaspete, fata de ora sosirii. */
export const ORE_CHECKIN_DEVREME = 48;

/* Check-in-ul e permis cu pana la 48h inainte de ora sosirii.
 *
 * Capatul dinspre TRECUT ramane inchis: o sosire de ieri nu se mai poate
 * caza fara sa fie corectata data, altfel o rezervare uitata ar fi cazata
 * saptamani mai tarziu ca si cum nimic nu s-ar fi intamplat.
 *
 * De retinut: fereastra fiind in ore, nu in zile, "poimaine" devine
 * disponibil abia cand mai sunt sub 48h pana la ora sosirii — deci depinde
 * de ora curenta. E consecinta directa a unei reguli exprimate in ore. */
export const canCheckIn = (r, now = new Date()) =>
  r.status === "confirmed"
  && startOfDay(r.checkin) >= startOfDay(now)
  && new Date(r.checkin).getTime() - new Date(now).getTime() <= ORE_CHECKIN_DEVREME * 3600_000;

export const canCheckOut = (r) => r.status === "checkedin";
export const canCancel   = (r) => r.status === "confirmed";

export const canNoShow = (r, now = new Date()) =>
  r.status === "confirmed" && startOfDay(r.checkin) < startOfDay(now);

/* Night audit: rezervari inca "checked-in" a caror zi de plecare a trecut.
 *
 * Pragul e ZIUA, nu ora: un oaspete care pleaca azi la 11:00 nu e restant
 * azi, oricat de tarziu ar fi — abia maine. Altfel o intarziere obisnuita
 * la plecare ar bloca receptia in mijlocul zilei.
 *
 * canCheckOut cere doar `status === "checkedin"`, deci fiecare rezervare
 * intoarsa de aici poate fi inchisa pe loc — lista nu poate contine ceva
 * ce nu se poate rezolva. */
export function checkouturiRestante(reservations, now = new Date()) {
  const azi = startOfDay(now);
  return (reservations || []).filter(
    (r) => r.status === "checkedin" && startOfDay(r.checkout) < azi);
}

/* Cate zile a trecut peste plecarea programata — pentru afisaj. */
export function zileIntarziere(r, now = new Date()) {
  return Math.max(1, Math.round((startOfDay(now) - startOfDay(r.checkout)) / 86400000));
}
