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

/* ---------- ce adrese are voie să ceară funcția ---------- */

/* Adresa vine de la un admin al PMS-ului, dar `fetch`-ul se face cu
   drepturi de service role, dinăuntrul infrastructurii Supabase. Fără garda
   asta, o adresă ca `http://169.254.169.254/…` (metadatele instanței) sau
   `http://127.0.0.1:…` ar pune serverul să ceară singur resurse la care
   nimeni din afară n-ar ajunge — SSRF, chiar dacă răspunsul nu se vede
   nicăieri (corpul se aruncă dacă nu e un VCALENDAR).
   Listă de gazde permise NU se poate face: „orice altă agenție" e chiar
   cerința. Deci se blochează ce e sigur intern, nu se permite ce e
   cunoscut. */
const GAZDE_LOCALE = /^(localhost|ip6-\w+|.+\.(localhost|local|internal|home\.arpa))$/i;

function octetiIpv4(gazda: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(gazda);
  if (!m) return null;
  const o = m.slice(1, 5).map(Number);
  return o.every((x) => x <= 255) ? o : null;
}

/* Blocuri care nu ies niciodată în internet: 0.0.0.0/8, 10/8, 127/8,
   169.254/16 (link-local — acolo stau metadatele cloud), 172.16/12,
   192.168/16, 100.64/10 (CGNAT) și tot ce e de la 224 în sus. */
function esteIpv4Intern([a, b]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

/* IPv6 literal, fără brackets. `::1` (loopback), `fc00::/7` (unique local),
   `fe80::/10` (link-local) și adresele IPv4 împachetate.
   ATENȚIE la ultima categorie: parserul de URL NU păstrează forma scrisă de
   om. `[::ffff:127.0.0.1]` devine `[::ffff:7f00:1]`, deci o căutare după
   puncte n-ar găsi nimic și garda ar fi ocolită — exact ce a prins testul.
   Ultimele două hexteți se citesc ca cei patru octeți ai unui IPv4. */
function esteIpv6Intern(gazda: string): boolean {
  const g = gazda.toLowerCase();
  if (g === "::" || g === "::1") return true;
  if (/^(f[cd]|fe[89ab])/.test(g)) return true;
  const m = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(g);
  if (m) {
    const sus = parseInt(m[1], 16);
    return esteIpv4Intern([(sus >> 8) & 255, sus & 255]);
  }
  return false;
}

/**
 * Adresa unui feed, verificată. Aruncă dacă nu e bună — apelantul tratează
 * eroarea ca pe orice feed picat, adică sare peste rând fără să atingă
 * rezervările camerei.
 *
 * CE NU ACOPERĂ: un nume de gazdă care se rezolvă la o adresă internă
 * (`intern.exemplu.ro` → 10.0.0.5), fiindcă `fetch` din Deno nu lasă DNS-ul
 * să fie rezolvat separat și apoi fixat pe conexiune. Rămâne o gaură
 * teoretică, deschisă doar unui admin al PMS-ului — adică cineva care are
 * oricum drepturi mult mai mari — și fără canal de citire: corpul unui
 * răspuns care nu e VCALENDAR se aruncă, iar în `ultima_eroare` ajunge doar
 * textul nostru, niciodată corpul primit.
 */
export function adresaDeFeed(url: string | URL): URL {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("Adresa nu e validă."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Adresa nu e http(s).");

  const gazda = u.hostname.replace(/^\[|\]$/g, "");
  if (!gazda || GAZDE_LOCALE.test(gazda)) throw new Error("Adresa duce în rețeaua internă.");
  const v4 = octetiIpv4(gazda);
  if (v4 ? esteIpv4Intern(v4) : (gazda.includes(":") && esteIpv6Intern(gazda))) {
    throw new Error("Adresa duce în rețeaua internă.");
  }
  return u;
}

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
