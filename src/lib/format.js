/* Formatarea valorilor pentru afisare: bani, date, ore, initiale.
 *
 * Toate formatoarele Intl sunt construite O SINGURA DATA, la incarcarea
 * modulului, nu la fiecare apel: `new Intl.DateTimeFormat(...)` e costisitor,
 * iar calendarul il apeleaza de sute de ori pe randare.
 *
 * Locale fixat pe ro-RO deliberat, nu preluat din browser — o pensiune din
 * Romania vrea aceleasi formate indiferent pe ce telefon se uita receptia.
 */


export function validatePrice(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return "Prețul manual trebuie să fie un număr.";
  if (n < 0) return "Prețul manual nu poate fi negativ.";
  if (n > 1000000) return "Prețul manual pare eronat.";
  return null;
}

export const FMT_MONEY = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });

export const FMT_DATE = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit" });

export const FMT_DATETIME = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const FMT_DATE_FULL = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });

export const FMT_TIME = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });

export const FMT_WEEKDAY = new Intl.DateTimeFormat("ro-RO", { weekday: "short" });

export const FMT_MONTH_YEAR = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" });

export function fmtMoney(v) {
  return FMT_MONEY.format(Math.round(v || 0)) + " lei";
}

export function fmtDate(d) {
  return FMT_DATE.format(new Date(d));
}

export function fmtDateFull(d) {
  return FMT_DATE_FULL.format(new Date(d));
}

export function fmtDateTime(d) {
  return FMT_DATETIME.format(new Date(d));
}

export function toDateInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function toLocalInputValue(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}
/* Inlocuieste doar partea de data dintr-o valoare existenta, pastrand ora
   neatinsa — folosit de selectoarele de data (fara ora in UI, dar ora
   ramane cea implicita/existenta in date). */

export function withNewDate(iso, dateStr) {
  return `${dateStr}T${toLocalInputValue(iso).slice(11)}`;
}

/* ---------------------------------------------------------------
   STORAGE LAYER
----------------------------------------------------------------*/
/* ---------------------------------------------------------------
   STRAT DE DATE — tabele reale in Supabase
   Citirile aduc fiecare tabel separat; scrierile compara lista veche
   cu cea noua si trimit DOAR randurile schimbate, ca doua persoane
   care lucreaza simultan sa nu se suprascrie reciproc.
----------------------------------------------------------------*/
/* Maparile rand <-> obiect s-au mutat in src/data/mapari.js — sunt granita
   cu baza de date, nu interfata. Se importa mai sus. */

/* syncTable, saveRatesAndSeasons si loadAll s-au mutat in src/data/nucleu.js
   — sunt calea prin care aplicatia isi ia si isi salveaza datele de baza.
   Se importa mai sus. */

export function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
/* Which screens each role may reach. Enforced on render, not just in the menu,
   so a view left over from another session can't leak through. */
