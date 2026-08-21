/* Disponibilitate si intervale de sejur — logica pura, fara React si
 * fara acces la baza de date, ca sa poata fi testata direct.
 *
 * Extras din pms-app.jsx fara nicio modificare de comportament: aceleasi
 * functii, aceleasi reguli, doar mutate intr-un loc unde se pot citi si
 * testa fara sa incarci intreaga aplicatie.
 */

/* Statusuri care nu mai tin camera ocupata. */
export const DEAD_STATUSES = ["cancelled", "noshow"];
export const isLive = (r) => !DEAD_STATUSES.includes(r.status);

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function nightsBetween(ci, co) {
  const a = new Date(ci); a.setHours(0, 0, 0, 0);
  const b = new Date(co); b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b - a) / 86400000));
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
  const ci = new Date(checkin), co = new Date(checkout);
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
  const ciDay = startOfDay(checkin);
  const coDay = startOfDay(checkout);
  const nights = Math.max(1, Math.round((coDay - ciDay) / 86400000));
  const live = (reservations || []).filter((r) => r.id !== excludeId && isLive(r));
  let sumPct = 0;
  for (let i = 0; i < nights; i++) {
    const dStart = ciDay.getTime() + i * 86400000;
    let occ = 0;
    for (const r of live) {
      const rCiDay = startOfDay(r.checkin).getTime();
      const rCoDay = startOfDay(r.checkout).getTime();
      if (rCiDay <= dStart && rCoDay > dStart) occ++;
    }
    sumPct += (occ / roomCount) * 100;
  }
  return sumPct / nights;
}

/* Rezervarile care intra in cifrele de business (ocupare, venit, ADR, RevPAR).
   Protocolul ocupa camera real, dar nu se incaseaza pe el — daca ar intra in
   venit, ar strica toate mediile. */
export const isStatsEligible = (r) => isLive(r) && r.status !== "protocol";
