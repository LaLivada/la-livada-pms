/* Calculul preturilor — logica pura, extrasa din pms-app.jsx fara nicio
 * schimbare de comportament.
 *
 * Ierarhia preturilor, pe scurt (detalii la fiecare functie):
 *   priceOverride (manual)  >  bookedPrice (inghetat la creare)  >  calcul live
 */

import { nightsBetween, occupancyForStay } from "./availability.js";
import { round2 } from "./money.js";

export function inSeason(date, season) {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (season.start <= season.end) return md >= season.start && md <= season.end;
  return md >= season.start || md <= season.end; // wraps across new year
}

/* occupancy = {adults, children}; implicit 2 adulti/0 copii (ocuparea
   standard) cand nu se cunoaste rezervarea (ex. rapoarte agregate).
   Single (tarif redus) se aplica STRICT la 1 adult si 0 copii. Peste
   ocuparea standard, suplimentul de adult se aplica per adult peste 2,
   iar suplimentul de copil se aplica pentru fiecare copil, indiferent
   de ocuparea totala. */
export function nightlyRate(date, roomType, rates, occupancy) {
  if (!rates) return 0;
  const adultsRaw = Number(occupancy?.adults);
  const adults = Number.isFinite(adultsRaw) ? adultsRaw : 2;
  const childrenRaw = Number(occupancy?.children);
  const children = Number.isFinite(childrenRaw) ? childrenRaw : 0;
  const season = (rates.seasons || []).find((sn) => inSeason(date, sn));
  const src = season || rates.base;
  const standard = Number(src?.[roomType] ?? rates.base?.[roomType] ?? 0);
  if (adults === 1 && children === 0) {
    const single = Number(rates.base?.[roomType + "Single"]) || 0;
    if (single > 0) return single;
  }
  const adultSupplement = Number(rates.base?.adultSupplement) || 0;
  const childSupplement = Number(rates.base?.childSupplement) || 0;
  return standard + Math.max(0, adults - 2) * adultSupplement + children * childSupplement;
}

/* Calcul LIVE, mereu proaspat din tarifele curente — folosit doar ca sa
   producem un nou pret inghetat (la creare/editare) sau ca ultim fallback
   pentru rezervari vechi care inca nu au un snapshot. NU se foloseste
   direct pentru afisare — vezi reservationTotal mai jos. */
export function liveReservationTotal(res, core) {
  const room = core.rooms.find((r) => r.id === res.roomId);
  if (!room) return 0;
  const n = nightsBetween(res.checkin, res.checkout);
  const occupancy = { adults: res.adults ?? 2, children: res.children ?? 0 };
  let total = 0;
  const d = new Date(res.checkin); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    total += nightlyRate(d, room.type, core.rates, occupancy);
    d.setDate(d.getDate() + 1);
  }
  /* Suma de nopti poate acumula zecimale din tarife/suplimente cu
     fractii; rotunjim aici, nu la afisare, ca valoarea inghetata in
     bookedPrice sa fie exact cea aratata utilizatorului. */
  return round2(total);
}

/* Pragul de ocupare in care se incadreaza occPct. Ultimul prag e tratat
   inclusiv la capatul de sus (100% trebuie sa cada tot in pragul cel
   mai ocupat, nu sa ramana neacoperit de niciun prag). */
export function onlinePriceAdjustmentPct(occPct, tiers) {
  if (!tiers || !tiers.length) return 0;
  const maxOverall = Math.max(...tiers.map((t) => Number(t.max) || 0));
  const eff = Math.min(occPct, maxOverall - 0.0001);
  const tier = tiers.find((t) => eff >= Number(t.min) && eff < Number(t.max));
  return tier ? Number(tier.adjustmentPct) || 0 : 0;
}

/* Ziua calendaristica in ora Romaniei, ca "YYYY-MM-DD" (en-CA da exact
   formatul ISO). Fixam fusul explicit fiindca "azi" trebuie sa insemne
   acelasi lucru peste tot: in SQL, unde baza ruleaza pe UTC si intre
   miezul noptii si ora 3 data UTC e inca cea de ieri, si in browser,
   care ar folosi altfel fusul calculatorului. */
const ziuaRomania = (d) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(d));

/* Varianta de liveReservationTotal care mai aplica, DOAR pentru
   rezervarile facute de oaspete prin site-ul propriu de rezervari
   (source "site"), ajustarea procentuala din optimizatorul de pret pe
   grad de ocupare — vezi OnlinePricingView. NU se aplica rezervarilor
   introduse manual de receptie (Direct/Telefon/Walk-in etc.), chiar
   daca sunt fara plata online — doar strict celor prin site. Booking.com/
   Airbnb nu pot primi preturi prin feedul iCal (doar disponibilitate),
   asa ca nu sunt incluse aici.

   Si numai pentru sosiri CHIAR AZI. Optimizatorul se uita la gradul de
   ocupare de acum; pentru o data peste doua luni acela e aproape zero
   indiferent de cerere, fiindca rezervarile nu s-au strans inca, iar
   pragul cel mai de jos ar da o reducere nemeritata. E gandit ca parghie
   de last-minute: cine cere o camera pentru la noapte plateste mai mult
   sau mai putin dupa cat de plina e pensiunea in seara aceea.
   Aceeasi regula e impusa si in SQL, in stay_total. */
export function liveReservationTotalOnline(res, core, reservations, acum = new Date()) {
  const base = liveReservationTotal(res, core);
  if (res.source !== "site") return base;
  if (ziuaRomania(res.checkin) !== ziuaRomania(acum)) return base;
  const tiers = core.onlinePricing;
  if (!tiers || !tiers.length) return base;
  const occPct = occupancyForStay(res.checkin, res.checkout, reservations, core.rooms.length, res.id);
  const pct = onlinePriceAdjustmentPct(occPct, tiers);
  return Math.round(base * (1 + pct / 100));
}

/* Pretul afisat/facturat: suprascrierea manuala are mereu prioritate;
   apoi pretul inghetat la creare (sau la ultima modificare de
   data/ocupare/camera) — asa raman neschimbate rezervarile deja facute
   cand se modifica doar tarifele, nu si rezervarea insasi. Calculul
   live e ultim fallback, doar pentru rezervari vechi fara snapshot
   inca (migrate automat la incarcarea aplicatiei). */
export function reservationTotal(res, core) {
  if (res.priceOverride != null && res.priceOverride !== "") {
    const n = Number(res.priceOverride);
    return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  }
  if (res.bookedPrice != null && res.bookedPrice !== "") {
    const n = Number(res.bookedPrice);
    if (Number.isFinite(n) && n >= 0) return round2(n);
  }
  return liveReservationTotal(res, core);
}
