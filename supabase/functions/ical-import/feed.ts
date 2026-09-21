/* De la textul unui feed OTA la zile de cazare.
 *
 * Fara `Deno.*` si fara retea, ca sa se testeze din vitest
 * (src/ical-import-feed.test.js) — acelasi tipar ca
 * device-provider/reguli-automate.ts. Aici stau exact cele doua lucruri pe
 * care nu le poate prinde niciun test al partilor: cum se citeste ziua
 * dintr-un DTSTART si ce ora primeste ea.
 *
 * Parserul nu e scris a doua oara: `imparteInObiecte` si `rezumaObiect` sunt
 * cele ale serverului CalDAV, care stiu deja DTEND lipsa, DURATION, zilele
 * intregi, liniile impaturite si STATUS:CANCELLED.
 */
import { imparteInObiecte, rezumaObiect } from "../caldav/ics.ts";
import { ORA_SOSIRE, ORA_PLECARE } from "../../../src/lib/ical-ota.js";
import { partiLocale, dinPartiLocale } from "../../../src/lib/timp.js";

export interface EvenimentFeed { uid: string; checkin: Date; checkout: Date }

/* Ziua din feed + ora hotelului. Ziua se citeste in fusul pensiunii, nu in
   UTC: un DTSTART la 23:00Z e deja ziua urmatoare la Vaslui, iar rezervarea
   trebuie sa cada pe ziua pe care o vede recepția in calendar. */
export function laOraHotelului(d: Date, ora: number): Date {
  const p = partiLocale(d);
  if (!p) return new Date(NaN);
  return dinPartiLocale(p.an, p.luna, p.zi, ora, 0, 0);
}

/* DTEND e EXCLUSIV in iCalendar: `DTEND;VALUE=DATE:20261014` inseamna ca
   ultima noapte e 13 spre 14, deci plecarea CHIAR e pe 14, la ora 11. Nu se
   scade o zi nicaieri — greseala clasica la importul .ics. */
export function evenimenteDin(text: string): { evenimente: EvenimentFeed[]; faraUid: number } {
  const evenimente: EvenimentFeed[] = [];
  let faraUid = 0;
  for (const obiect of imparteInObiecte(text)) {
    const r = rezumaObiect(obiect.ics);
    if (!r) continue;
    /* Un eveniment fara UID n-ar avea identitate stabila intre rulari: l-am
       insera acum si l-am anula la rularea urmatoare, la nesfarsit. */
    if (!r.uid) { faraUid++; continue; }
    if (r.anulat) continue;                       // absenta din feed = anulare, la fel
    if (!r.incepe || !r.seTermina) continue;
    const checkin = laOraHotelului(r.incepe, ORA_SOSIRE);
    const checkout = laOraHotelului(r.seTermina, ORA_PLECARE);
    /* O rezervare de o zi (DTSTART = DTEND, cum mai trimite Booking.com
       pentru zilele inchise) ar da 14:00 → 11:00, adica un interval negativ
       pe care `check (checkout > checkin)` din schema l-ar respinge oricum. */
    if (!(checkout > checkin)) continue;
    evenimente.push({ uid: r.uid, checkin, checkout });
  }
  return { evenimente, faraUid };
}
