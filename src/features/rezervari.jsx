/* REZERVARI — calendarul, fereastra de rezervare, actiunile pe ea,
 * check-in / check-out si ecranul Azi.
 *
 * Inima aplicatiei. Regulile de tranzitie (cine poate face check-in si cand,
 * fereastra de check-in, night audit-ul) NU sunt aici: stau in lib/tranzitii.js,
 * testate — o regula despre timp verificata cu "acum" real trece sau cade
 * dupa ora la care ruleaza suita.
 *
 * Din faza 4 (D1, docs/audit-2026-09.md) fisierul e doar poarta de intrare:
 * componentele stau in features/rezervari/, cate una pe fisier, cu aceleasi
 * nume si acelasi comportament. Cine importa de aici (pms-app, testele) n-a
 * trebuit sa se schimbe; codul nou se pune direct in fisierul potrivit.
 */
export { NightAuditGate } from "./rezervari/night-audit.jsx";
export { EtichetaNou } from "./rezervari/eticheta-nou.jsx";
export { CalendarView } from "./rezervari/calendar.jsx";
export { ReservationViewModal } from "./rezervari/vizualizare.jsx";
export { ReservationModal } from "./rezervari/fisa-rezervare.jsx";
export { doCheckIn, doCheckOut } from "./rezervari/checkin-checkout.jsx";
export { CardOnline, TodayView } from "./rezervari/azi.jsx";
export { ReservationActions } from "./rezervari/actiuni.jsx";
