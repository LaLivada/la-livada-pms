/* Timpul hotelului — O SINGURA definitie a „zilei" pentru tot PMS-ul.
 *
 * DE CE. Pana pe 14 septembrie 2026 „azi", „ziua sosirii" si „miezul
 * noptii" se calculau cu `setHours(0, 0, 0, 0)` — adica in fusul
 * BROWSERULUI. Cat timp toate tabletele sunt la Vaslui nu se vede. Se vede
 * cand proprietarul deschide aplicatia din alt fus (night audit-ul gaseste
 * „plecari restante" de la ora 18, fiindca in Tokyo e deja maine) sau pe un
 * dispozitiv cu fusul setat gresit. Vezi docs/audit-2026-09.md, B6.
 *
 * Regula: rezervarile tin MOMENTE (timestamptz, ISO cu Z). Orice trecere de
 * la moment la zi/ora de perete, si inapoi, se face AICI, in fusul
 * hotelului (`FUS_HOTEL`), prin Intl — care are baza IANA completa in orice
 * browser modern, in Node si in Deno, si trece corect peste schimbarea
 * orei fara nicio ajustare manuala. Nicio librarie noua.
 *
 * Fara React, fara retea, fara Deno.*: fisierul e importat si de functia
 * edge access-provider (prin src/lib/acces.js), deci trebuie sa ramana ESM
 * pur. Testat direct in src/timp.test.js, cu asteptari scrise in UTC.
 */

export const FUS_HOTEL = "Europe/Bucharest";
export const ZI_MS = 86400000;

/* Formatoarele Intl se construiesc o data per fus si se refolosesc:
   `new Intl.DateTimeFormat` costa cat sute de apeluri `formatToParts`.
   `hourCycle: "h23"` fiindca unele medii ICU scriu miezul noptii ca „24". */
const formatoare = new Map();
function formator(fus) {
  let f = formatoare.get(fus);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fus, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    formatoare.set(fus, f);
  }
  return f;
}

const ZILE_SAPT = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/* Cache pe moment: calendarul si rapoartele cer aceleasi checkin/checkout
   de mii de ori intre doua schimbari de date, iar `formatToParts` e de
   ~100 de ori mai lent decat `setHours`. Golit cand creste prea mult — nu
   e un LRU, dar nici nu are nevoie: valorile revin oricum. */
const LIMITA_CACHE = 20000;
const cache = new Map();

/* Un sir fara fus („2026-09-14T14:00", din formular) e ora hotelului — vezi
   momentLocal. Un Date sau un numar sunt deja momente. */
function momentul(d) {
  if (d instanceof Date) return d.getTime();
  if (typeof d === "number") return d;
  return momentLocal(d).getTime();
}

/* Componentele orei de perete din fusul hotelului: an, luna (1-12), zi,
   ore (0-23), minute, secunde, ziSapt (0 = duminica, ca `getDay`).
   `null` pentru o data invalida — un singur loc de verificat, nu NaN-uri
   care se propaga in aritmetica de mai jos. */
export function partiLocale(d, fus = FUS_HOTEL) {
  const t = momentul(d);
  if (!Number.isFinite(t)) return null;
  const cheie = fus + "|" + t;
  const gata = cache.get(cheie);
  if (gata) return gata;
  const p = {};
  for (const x of formator(fus).formatToParts(t)) p[x.type] = x.value;
  const parti = {
    an: +p.year, luna: +p.month, zi: +p.day,
    ore: +p.hour % 24, minute: +p.minute, secunde: +p.second,
    ziSapt: ZILE_SAPT[p.weekday],
  };
  if (cache.size >= LIMITA_CACHE) cache.clear();
  cache.set(cheie, parti);
  return parti;
}

/* Decalajul fusului fata de UTC, in milisecunde, la un moment dat.
   Calculat, nu presupus: Romania e +2 iarna si +3 vara, iar un sejur poate
   traversa schimbarea. O constanta ar fi gresita jumatate de an. */
export function decalajFus(d, fus = FUS_HOTEL) {
  const p = partiLocale(d, fus);
  if (!p) return NaN;
  return Date.UTC(p.an, p.luna - 1, p.zi, p.ore, p.minute, p.secunde) - momentul(d);
}

/* De la ora de perete (in fusul hotelului) la moment. Prin Date.UTC, nu prin
   sir: „11:90" ca text ar da o data invalida, in timp ce Date.UTC reporteaza
   singur minutele peste 59 in ore, orele peste 23 in zile si ziua 32 in luna
   urmatoare — pe asta se sprijina si aritmetica pe zile de mai jos.

   Doua treceri: decalajul se citeste intai la estimarea UTC (care sta cu
   2-3 ore langa momentul cautat), apoi la momentul gasit. Conteaza doar in
   orele din jurul schimbarii orei; in ora care nu exista (03:00-04:00 la
   trecerea la ora de vara) sau exista de doua ori (la cea de iarna) se
   accepta oricare din cele doua raspunsuri consecvente. */
export function dinPartiLocale(an, luna, zi, ore = 0, minute = 0, secunde = 0, fus = FUS_HOTEL) {
  const estimare = Date.UTC(an, luna - 1, zi, ore, minute, secunde);
  if (!Number.isFinite(estimare)) return new Date(NaN);
  let t = estimare - decalajFus(new Date(estimare), fus);
  const decalaj = decalajFus(new Date(t), fus);
  const t2 = estimare - decalaj;
  if (t2 !== t && decalajFus(new Date(t2), fus) === decalaj) t = t2;
  return new Date(t);
}

/* Momentul exact al unei ore locale din ziua unui reper dat. `reper` spune
   CARE zi (in fusul hotelului), iar ore/minute spun ora din acea zi. */
export function laOraLocala(reper, ore, minute, fus = FUS_HOTEL) {
  const p = partiLocale(reper, fus);
  if (!p) return new Date(NaN);
  return dinPartiLocale(p.an, p.luna, p.zi, ore, minute, 0, fus);
}

const doua = (n) => String(n).padStart(2, "0");

/* „AAAA-LL-ZZ" in fusul hotelului — comparabil ca text, cu o coloana `date`
   si cu valoarea unui <input type="date">. Sir gol pentru o data invalida. */
export function dataLocala(d, fus = FUS_HOTEL) {
  const p = partiLocale(d, fus);
  return p ? `${p.an}-${doua(p.luna)}-${doua(p.zi)}` : "";
}

/* Valoarea unui <input type="datetime-local">, in ora hotelului. */
export function textLocal(d, fus = FUS_HOTEL) {
  const p = partiLocale(d, fus);
  return p ? `${p.an}-${doua(p.luna)}-${doua(p.zi)}T${doua(p.ore)}:${doua(p.minute)}` : "";
}

/* Miezul noptii de la Vaslui al zilei in care cade `d`. Inlocuitorul lui
   `startOfDay` / `setHours(0,0,0,0)`: intoarce tot un Date, comparabil cu
   < si >, ca sa poata fi pus in locul vechiului apel fara sa se rescrie
   comparatiile din jur. */
export function ziLocala(d, fus = FUS_HOTEL) {
  const p = partiLocale(d, fus);
  if (!p) return new Date(NaN);
  return dinPartiLocale(p.an, p.luna, p.zi, 0, 0, 0, fus);
}

/* `d` mutat cu `n` zile calendaristice, cu ACEEASI ora de perete. Nu
   `+ n * ZI_MS`: peste schimbarea orei ziua are 23 sau 25 de ore, si 14:00
   ar deveni 15:00 sau 13:00. */
export function adaugaZile(d, n, fus = FUS_HOTEL) {
  const p = partiLocale(d, fus);
  if (!p) return new Date(NaN);
  return dinPartiLocale(p.an, p.luna, p.zi + n, p.ore, p.minute, p.secunde, fus);
}

/* Zile calendaristice de la ziua lui `a` la ziua lui `b` (negativ daca `b`
   e inainte). Rotunjirea inghite ora lipsa/in plus de la schimbarea orei. */
export function zileIntre(a, b, fus = FUS_HOTEL) {
  return Math.round((ziLocala(b, fus).getTime() - ziLocala(a, fus).getTime()) / ZI_MS);
}

export function esteAceeasiZi(a, b, fus = FUS_HOTEL) {
  const x = dataLocala(a, fus);
  return x !== "" && x === dataLocala(b, fus);
}

/* 0 = duminica … 6 = sambata, dupa ziua de la Vaslui (ca `getDay`, dar in
   fusul hotelului: la vest de Greenwich miezul noptii nostru e inca ieri). */
export function ziuaSaptamanii(d, fus = FUS_HOTEL) {
  return partiLocale(d, fus)?.ziSapt ?? NaN;
}

export function esteWeekend(d, fus = FUS_HOTEL) {
  const z = ziuaSaptamanii(d, fus);
  return z === 0 || z === 6;
}

/* Ce vine dintr-un <input> e ora hotelului, nu a browserului.
   „2026-09-14T14:00" si „2026-09-14" se citesc la Vaslui (`new Date` le-ar
   citi in fusul masinii, respectiv in UTC — doua greseli diferite pentru
   acelasi camp). Un sir cu fus explicit (Z, +03:00), un Date sau un numar
   trec neatinse. Gunoiul da o data invalida, ca `new Date`. */
const FARA_FUS = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
export function momentLocal(text, fus = FUS_HOTEL) {
  if (text instanceof Date) return new Date(text.getTime());
  if (typeof text === "number") return new Date(text);
  const s = String(text ?? "").trim();
  const m = FARA_FUS.exec(s);
  if (!m) return new Date(s);
  const luna = +m[2], zi = +m[3], ore = +(m[4] || 0), minute = +(m[5] || 0);
  if (luna < 1 || luna > 12 || zi < 1 || zi > 31 || ore > 23 || minute > 59) return new Date(NaN);
  return dinPartiLocale(+m[1], luna, zi, ore, minute, +(m[6] || 0), fus);
}

/* Aritmetica pe sirul „AAAA-LL-ZZ", fara ora si fara fus — pentru campurile
   de data din formulare, unde ziua e ziua si atat. */
export function adaugaZileLaData(data, n) {
  const [an, luna, zi] = String(data).split("-").map(Number);
  const t = Date.UTC(an, luna - 1, zi + n);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
}

/* Prima zi a lunii, la miezul noptii de la Vaslui. `monthOffset` e relativ la
   luna lui `acum` (0 = luna asta, -1 = luna trecuta). */
export function inceputDeLuna(monthOffset = 0, acum = new Date(), fus = FUS_HOTEL) {
  const p = partiLocale(acum, fus);
  if (!p) return new Date(NaN);
  return dinPartiLocale(p.an, p.luna + monthOffset, 1, 0, 0, 0, fus);
}

export function sfarsitDeLuna(monthStart, fus = FUS_HOTEL) {
  return inceputDeLuna(1, monthStart, fus);
}

export function zileInLuna(monthStart, fus = FUS_HOTEL) {
  return zileIntre(monthStart, sfarsitDeLuna(monthStart, fus), fus);
}
