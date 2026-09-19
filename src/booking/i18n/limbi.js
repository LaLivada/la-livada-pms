/* Lista limbilor site-ului de rezervări, comună aplicației React (motorul
 * de rezervare) și scriptului simplu din antet (selectorul de limbă,
 * vizibil și pe paginile legale statice, unde nu există React).
 *
 * Fișier fără nicio dependență de React, ca să poată fi importat direct
 * dintr-un <script type="module"> obișnuit — vezi booking/limba-selector.js.
 */
export const LIMBI = [
  { cod: "ro", nume: "Română", steag: "🇷🇴" },
  { cod: "en", nume: "English", steag: "🇬🇧" },
  { cod: "fr", nume: "Français", steag: "🇫🇷" },
  { cod: "it", nume: "Italiano", steag: "🇮🇹" },
  { cod: "de", nume: "Deutsch", steag: "🇩🇪" },
  { cod: "ru", nume: "Русский", steag: "🇷🇺" },
  { cod: "uk", nume: "Українська", steag: "🇺🇦" },
];

export const CODURI_LIMBA = LIMBI.map((l) => l.cod);
export const LIMBA_IMPLICITA = "ro";

/* Cheia din localStorage — comună React-ului și scriptului din antet,
   ca alegerea făcută pe o pagină statică (legală) să fie văzută și de
   motorul de rezervare, și invers. */
export const CHEIE_LIMBA = "ldv-limba";

/* Limba salvată explicit de vizitator, dacă există și e încă suportată.
   Fără citirea localStorage într-un try/catch, un mod privat sau spațiu
   plin ar arunca și ar opri tot restul detecției. */
export function limbaSalvata() {
  try {
    const v = localStorage.getItem(CHEIE_LIMBA);
    return v && CODURI_LIMBA.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function salveazaLimba(cod) {
  try {
    if (CODURI_LIMBA.includes(cod)) localStorage.setItem(CHEIE_LIMBA, cod);
  } catch { /* mod privat sau spațiu plin — alegerea ține doar pentru sesiunea asta */ }
}

/* Limba telefonului/calculatorului: `navigator.languages` e o listă în
   ORDINEA preferinței omului (setată din sistemul de operare sau
   browser), deci prima potrivire cu ce oferim noi câștigă — nu neapărat
   prima din listă a lui, dacă aceea nu e una din cele 7. */
export function limbaDispozitivului() {
  const surse = (typeof navigator !== "undefined"
    && (navigator.languages || (navigator.language ? [navigator.language] : []))) || [];
  for (const s of surse) {
    const cod = String(s || "").slice(0, 2).toLowerCase();
    if (CODURI_LIMBA.includes(cod)) return cod;
  }
  return LIMBA_IMPLICITA;
}

/* Limba efectivă: cea aleasă explicit, altfel cea a dispozitivului. */
export function detecteazaLimba() {
  return limbaSalvata() || limbaDispozitivului();
}

/* BCP-47 pentru Intl.* — fiecare cod de-al nostru e deja o etichetă de
   limbă validă (ro, en, fr, it, de, ru, uk), deci identitatea e suficientă;
   funcția există ca punct unic de schimbat dacă vreodată devine nevoie de
   o etichetă regională (ex. "en-GB"). */
export const localeIntl = (cod) => cod;
