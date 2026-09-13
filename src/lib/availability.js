/* Disponibilitate si intervale de sejur — logica pura, fara React si
 * fara acces la baza de date, ca sa poata fi testata direct.
 *
 * Extras din pms-app.jsx fara nicio modificare de comportament: aceleasi
 * functii, aceleasi reguli, doar mutate intr-un loc unde se pot citi si
 * testa fara sa incarci intreaga aplicatie.
 */

import { ziLocala, zileIntre, adaugaZile, momentLocal } from "./timp.js";

/* Statusuri care nu mai tin camera ocupata. */
export const DEAD_STATUSES = ["cancelled", "noshow"];
export const isLive = (r) => !DEAD_STATUSES.includes(r.status);

/* `startOfDay` (miezul noptii al BROWSERULUI) a disparut pe 14 septembrie
   2026: ziua e cea a hotelului — `ziLocala` din lib/timp.js. */

/* Nopti intre doua momente = zile calendaristice la Vaslui, minimum 1. */
export function nightsBetween(ci, co) {
  return Math.max(1, zileIntre(ci, co));
}

/* Interval pe jumatate deschis [start, end) — o rezervare care se termina
   exact cand alta incepe NU se suprapune (turnover in aceeasi zi e permis).
   Single source of truth pentru "camera X e libera in intervalul Y" —
   folosita atat la rezervari individuale cat si la editorul de grup, ca
   sa nu existe doua implementari care ar putea diverge. */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

export function validateStay(checkin, checkout) {
  /* Un sir fara fus (din formular) e ora hotelului — vezi momentLocal. */
  const ci = momentLocal(checkin), co = momentLocal(checkout);
  if (isNaN(ci.getTime())) return "Data de check-in nu este validă.";
  if (isNaN(co.getTime())) return "Data de check-out nu este validă.";
  if (co <= ci) return "Data de check-out trebuie să fie după check-in.";
  if (nightsBetween(ci, co) > 365) return "Sejurul depășește 365 de nopți — verifică datele.";
  return null;
}

/* Ocuparea medie a proprietatii (in %) pe toata durata unui sejur —
   media ocuparii fiecarei nopti din interval, ca sa reflecte cat de
   "plina" e proprietatea in acea perioada, nu doar o singura zi.
   `excludeId` scoate rezervarea insasi din calcul (altfel s-ar numara
   pe sine ca ocupanta a propriilor nopti la o recalculare/editare). */
export function occupancyForStay(checkin, checkout, reservations, roomCount, excludeId) {
  if (!roomCount) return 0;
  const ciDay = ziLocala(checkin);
  const coDay = ziLocala(checkout);
  const nights = Math.max(1, zileIntre(ciDay, coDay));
  /* Zilele fiecarei rezervari se calculeaza o data, nu de `nights` ori. */
  const zile = (reservations || [])
    .filter((r) => r.id !== excludeId && isLive(r))
    .map((r) => [ziLocala(r.checkin).getTime(), ziLocala(r.checkout).getTime()]);
  let sumPct = 0;
  for (let i = 0; i < nights; i++) {
    const dStart = adaugaZile(ciDay, i).getTime();
    let occ = 0;
    for (const [rCiDay, rCoDay] of zile) if (rCiDay <= dStart && rCoDay > dStart) occ++;
    sumPct += (occ / roomCount) * 100;
  }
  return sumPct / nights;
}

/* Rezervarile care intra in cifrele de business (ocupare, venit, ADR, RevPAR).
   Protocolul ocupa camera real, dar nu se incaseaza pe el — daca ar intra in
   venit, ar strica toate mediile. */
export const isStatsEligible = (r) => isLive(r) && r.status !== "protocol";
