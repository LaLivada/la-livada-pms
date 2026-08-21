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
export const ZILE_CHECKIN_DEVREME = 14;
export const ORE_CHECKIN_DEVREME = ZILE_CHECKIN_DEVREME * 24;

/* Check-in-ul e permis cu pana la 14 zile inainte de ora sosirii.
 *
 * Capatul dinspre TRECUT ramane inchis: o sosire de ieri nu se mai poate
 * caza fara sa fie corectata data, altfel o rezervare uitata ar fi cazata
 * saptamani mai tarziu ca si cum nimic nu s-ar fi intamplat.
 *
 * De retinut: fereastra fiind in ore, nu in zile, ziua 15 devine disponibila
 * abia cand mai sunt sub 336h pana la ora sosirii — deci depinde de ora
 * curenta. E consecinta directa a unei reguli exprimate in ore.
 *
 * Un check-in facut cu mult inainte de ziua sosirii nu inseamna ca oaspetele
 * poate intra imediat in camera — vezi inceputCod in lib/acces.js, care tine
 * codul de acces inactiv pana in ziua rezervarii. */
export const canCheckIn = (r, now = new Date()) =>
  r.status === "confirmed"
  && startOfDay(r.checkin) >= startOfDay(now)
  && new Date(r.checkin).getTime() - new Date(now).getTime() <= ORE_CHECKIN_DEVREME * 3600_000;

export const canCheckOut = (r) => r.status === "checkedin";

/* "pending" (Cerere) alaturi de "confirmed": o cerere netratata trebuie sa
   se poata anula in orice moment, la fel ca o rezervare confirmata — altfel
   ramane agatata la nesfarsit fara nicio iesire. */
export const STATUSURI_NEREZOLVATE = ["pending", "confirmed"];

export const canCancel = (r) => STATUSURI_NEREZOLVATE.includes(r.status);

export const canNoShow = (r, now = new Date()) =>
  STATUSURI_NEREZOLVATE.includes(r.status) && startOfDay(r.checkin) < startOfDay(now);

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

/* Night audit: rezervari "pending" sau "confirmed" a caror zi de sosire a
 * trecut fara nicio decizie — o rezervare nu are voie sa ramana agatata la
 * nesfarsit intre "cerere"/"confirmata" dupa ce ziua de checkin a venit si
 * a trecut; un operator (admin sau receptioner) trebuie sa o rezolve in
 * check-in, no-show sau anulare.
 *
 * Fix la exact aceeasi regula ca la checkouturiRestante, doar oglindita pe
 * sosire in loc de plecare: refolosim canNoShow (nu o reimplementam), deci
 * fiecare rand din lista are garantat cel putin no-show ca rezolvare —
 * plus anularea, mereu posibila pentru pending/confirmed. Check-in-ul de
 * pe ziua exacta ramane blocat de canCheckIn (sosire trecuta, vezi mai
 * sus) — corect: o sosire de acum cateva zile nu se mai cazeaza direct,
 * intai se corecteaza data. */
export function sosiriRestante(reservations, now = new Date()) {
  return (reservations || []).filter((r) => canNoShow(r, now));
}

/* Cate zile a trecut peste sosirea programata — pentru afisaj. */
export function zileIntarziereSosire(r, now = new Date()) {
  return Math.max(1, Math.round((startOfDay(now) - startOfDay(r.checkin)) / 86400000));
}
