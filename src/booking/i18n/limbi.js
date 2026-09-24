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

/* Limba efectivă: cea aleasă explicit de vizitator, altfel ROMÂNA — nu
   limba browserului. Până pe 24 septembrie 2026 prima pagină urma
   `navigator.languages`: Googlebot randează cu en-US, deci vedea H1-ul și
   capitolele în engleză, iar pagina concura la „cazare Vaslui" cu un text
   englezesc. Un vizitator cu browserul în altă limbă vede acum româna până
   apasă steagul din antet — alegerea lui se salvează și rămâne respectată.
   Paginile legale traduse nu trec pe aici: au limba în adresă
   (/anulare/en/), vezi limbaPaginii din booking/limba-selector.js. */
export function detecteazaLimba() {
  return limbaSalvata() || LIMBA_IMPLICITA;
}

/* BCP-47 pentru Intl.* — fiecare cod de-al nostru e deja o etichetă de
   limbă validă (ro, en, fr, it, de, ru, uk), deci identitatea e suficientă;
   funcția există ca punct unic de schimbat dacă vreodată devine nevoie de
   o etichetă regională (ex. "en-GB"). */
export const localeIntl = (cod) => cod;
