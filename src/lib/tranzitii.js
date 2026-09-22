// @ts-check
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

import { ziLocala, zileIntre, esteAceeasiZi, partiLocale, adaugaZile } from "./timp.js";

/* Aceeasi zi LA VASLUI, nu in fusul browserului — vezi lib/timp.js. */
export function isSameDay(a, b) { return esteAceeasiZi(a, b); }

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
/* Se cazeaza si protocolul: e o rezervare ca oricare, doar neincasata
   (atributul `protocol` ramane dupa check-in — vezi esteProtocol in
   lib/availability.js). Pana pe 15 septembrie 2026 trecea doar „confirmed",
   iar un sejur protocol nu putea fi cazat deloc. */
export const STATUSURI_CAZABILE = ["confirmed", "protocol"];
export const canCheckIn = (r, now = new Date()) =>
  STATUSURI_CAZABILE.includes(r.status)
  && ziLocala(r.checkin) >= ziLocala(now)
  && new Date(r.checkin).getTime() - new Date(now).getTime() <= ORE_CHECKIN_DEVREME * 3600_000;

export const canCheckOut = (r) => r.status === "checkedin";

/* Sta cineva ACUM in camera?
 *
 * Nu e acelasi lucru cu `status === 'checkedin'`, si diferenta a costat o
 * camera blocata trei zile: check-in-ul se poate face cu 14 zile inainte
 * (vezi canCheckIn), iar pana la ora sosirii nu e nimeni inauntru. Camera
 * 1102, cazata pe 8 septembrie 2026 pentru o sosire pe 11, nu mai putea fi
 * deschisa de receptie — garda din access-provider o socotea ocupata.
 *
 * Pragul e ORA SOSIRII, nu inceputul zilei, fiindca asta e deja regula casei
 * peste tot: inceputCod (lib/acces.js) porneste codul de acces exact atunci,
 * iar guest_poate_deschide refuza butonul oaspetelui inainte cu motivul
 * „prea-devreme". Pentru oaspetele care ajunge mai devreme exista portita
 * documentata acolo — receptia muta ora sosirii, si atunci camera devine
 * ocupata odata cu codul.
 *
 * Capatul de sus ramane deschis intentionat: o rezervare inca „checkedin"
 * dupa ora plecarii inseamna ca nimeni n-a apasat check-out, iar oaspetele
 * poate fi foarte bine inauntru. Acolo greseala sigura e sa ramana blocata.
 *
 * O SINGURA DEFINITIE, si pe server, si in interfata: access-provider
 * importa functia asta direct (poate — importa deja din src/lib/acces.js),
 * iar features/camere.jsx o cheama pentru eticheta „Cazată". Asa ce arata
 * interfata si ce refuza functia edge nu pot diverge. */
export const cazatAcum = (r, now = new Date()) =>
  r.status === "checkedin" && new Date(r.checkin).getTime() <= new Date(now).getTime();

/* "pending" (Cerere) alaturi de "confirmed": o cerere netratata trebuie sa
   se poata anula in orice moment, la fel ca o rezervare confirmata — altfel
   ramane agatata la nesfarsit fara nicio iesire. Protocolul la fel: si el
   asteapta o sosire, deci se anuleaza si trece pe no-show ca oricare. */
export const STATUSURI_NEREZOLVATE = ["pending", "confirmed", "protocol"];

export const canCancel = (r) => STATUSURI_NEREZOLVATE.includes(r.status);

export const canNoShow = (r, now = new Date()) =>
  STATUSURI_NEREZOLVATE.includes(r.status) && ziLocala(r.checkin) < ziLocala(now);

/* POARTA DE NIGHT AUDIT E OPRITA — cerut de Ovidiu pe 22 septembrie 2026.
 *
 * Nu s-a sters nimic: regulile de mai jos, componenta NightAuditGate
 * (features/rezervari/night-audit.jsx) si testele lor raman intregi, iar
 * reaprinderea e `true` aici si atat. Cat timp e `false`, nimeni nu mai e
 * oprit la pornirea aplicatiei de plecarile sau sosirile ramase
 * nerezolvate — ele se vad si se rezolva ca orice alta rezervare, din
 * calendar sau din ecranul Azi.
 *
 * Singurul loc care citeste steagul e pms-app.jsx, la poarta; functiile de
 * mai jos raspund la fel ca inainte, ca sa poata fi folosite si de
 * altcineva (un raport, o alerta) fara sa depinda de blocaj. */
export const NIGHT_AUDIT_ACTIV = false;

/* Ora de la care se semnaleaza restantele zilei tocmai incheiate. */
export const ORA_NIGHT_AUDIT = 8;

/* Ziua de lucru a night audit-ului, care NU e mereu ziua calendaristica.
 *
 * Pana la ora 8 dimineata e inca ziua de ieri: cine e la receptie la 3
 * noaptea tine tura de ieri, iar o plecare de ieri de la 11:00 nu e o
 * restanta pe care sa o rezolve el — e treaba turei care vine. Pana acum,
 * poarta se inchidea peste el fix la miezul noptii.
 *
 * Restantele mai vechi de o zi raman semnalate la orice ora: pe acelea
 * le-a vazut deja o zi intreaga toata lumea, deci intarzierea nu mai e a
 * schimbului de tura. */
export function ziDeAudit(now = new Date()) {
  const azi = ziLocala(now);
  const p = partiLocale(now);
  return p && p.ore < ORA_NIGHT_AUDIT ? adaugaZile(azi, -1) : azi;
}

/* Night audit: rezervari inca "checked-in" a caror zi de plecare a trecut.
 *
 * Pragul e ZIUA, nu ora: un oaspete care pleaca azi la 11:00 nu e restant
 * azi, oricat de tarziu ar fi — abia maine, de la ora 8 (vezi ziDeAudit).
 * Altfel o intarziere obisnuita la plecare ar bloca receptia in mijlocul
 * zilei.
 *
 * canCheckOut cere doar `status === "checkedin"`, deci fiecare rezervare
 * intoarsa de aici poate fi inchisa pe loc — lista nu poate contine ceva
 * ce nu se poate rezolva. */
export function checkouturiRestante(reservations, now = new Date()) {
  const azi = ziDeAudit(now);
  return (reservations || []).filter(
    (r) => r.status === "checkedin" && ziLocala(r.checkout) < azi);
}

/* Cate zile a trecut peste plecarea programata — pentru afisaj. */
export function zileIntarziere(r, now = new Date()) {
  return Math.max(1, zileIntre(r.checkout, now));
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
 * intai se corecteaza data.
 *
 * Ora 8 se aplica si aici, prin ziDeAudit: poarta e una singura, deci n-are
 * sens sa se deschida noaptea pentru sosiri si nu si pentru plecari.
 * `canNoShow` ramane in filtru, nu e inlocuit: el e garantia ca fiecare rand
 * din lista are cel putin o iesire. */
export function sosiriRestante(reservations, now = new Date()) {
  const azi = ziDeAudit(now);
  return (reservations || []).filter((r) => canNoShow(r, now) && ziLocala(r.checkin) < azi);
}

/* Cate zile a trecut peste sosirea programata — pentru afisaj. */
export function zileIntarziereSosire(r, now = new Date()) {
  return Math.max(1, zileIntre(r.checkin, now));
}
