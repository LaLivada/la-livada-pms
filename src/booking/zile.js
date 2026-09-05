/* Aritmetica pe zile calendaristice, în UTC, pe „YYYY-MM-DD".
 *
 * În fus local o zi are 23 sau 25 de ore la schimbarea orei, deci scăderea a
 * două date dă 2,96 sau 3,04 zile în loc de 3. Rotunjirea ascunde asta la
 * sejururi scurte, dar e o proprietate a lui `round`, nu a calculului. În UTC
 * ziua are mereu 86.400.000 ms, iar `setUTCDate` trece corect peste luni și
 * ani bisecți — deci nu ne mai bazăm pe noroc.
 *
 * Stau într-un modul separat fiindcă le folosesc și formularul, și calendarul.
 * Două copii ale acelorași calcule ar fi însemnat, mai devreme sau mai târziu,
 * două răspunsuri diferite la întrebarea „câte nopți sunt între astea două".
 */

/* Ziua de azi în fusul OMULUI, nu în UTC.
 *
 * `toISOString()` dă ziua UTC, iar România e cu 2–3 ore înainte: între
 * miezul nopții și ora 3 el întoarce încă ziua de ieri. Cine deschidea
 * pagina la 1 noaptea vedea ziua trecută ca disponibilă la sosire.
 * Se vede direct în calendar — de acolo a și ieșit la iveală. */
const ziLocala = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const azi = () => ziLocala(new Date());

export const peste = (zile) => {
  const d = new Date();
  d.setDate(d.getDate() + zile);
  return ziLocala(d);
};

export const adunaZile = (zi, n) => {
  const d = new Date(`${zi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* Zero, nu NaN, când lipsește un capăt.
   Calendarul pornește fără perioadă aleasă, deci ambele capete pot fi goale.
   Un NaN de aici ar fi trecut mai departe în verificarea `nopti < 1`, care e
   FALSĂ pentru NaN — adică butonul de căutare ar fi rămas activ fără nicio
   dată aleasă. */
export const noptiIntre = (a, b) => {
  if (!a || !b) return 0;
  const nopti = Math.round(
    (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
  return Number.isFinite(nopti) ? Math.max(0, nopti) : 0;
};

/* ---------------------------------------------------------------
   Ce are nevoie calendarul în plus
----------------------------------------------------------------*/

/* Prima zi a lunii din care face parte ziua dată. */
export const primaZiDinLuna = (zi) => `${zi.slice(0, 7)}-01`;

/* Aceeași zi, cu luna mutată cu n. Ziua se pierde intenționat — calendarul
   navighează pe luni întregi, nu pe zile. */
export function adunaLuni(zi, n) {
  const [an, luna] = zi.split("-").map(Number);
  const total = an * 12 + (luna - 1) + n;
  const anNou = Math.floor(total / 12);
  const lunaNoua = (total % 12) + 1;
  return `${anNou}-${String(lunaNoua).padStart(2, "0")}-01`;
}

const FMT_LUNA = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" });
export const numeLuna = (zi) => FMT_LUNA.format(new Date(`${zi}T12:00:00Z`));

const FMT_ZI_LUNGA = new Intl.DateTimeFormat("ro-RO",
  { weekday: "long", day: "numeric", month: "long" });
export const numeZiLunga = (zi) => FMT_ZI_LUNGA.format(new Date(`${zi}T12:00:00Z`));

/* Inițialele zilelor, luni-duminică. Luate din Intl, nu scrise de mână:
   „duminică" e ultima în calendarul românesc, dar prima în `getUTCDay`. */
export const CAPETE_ZILE = Array.from({ length: 7 }, (_, i) => {
  // 5 ianuarie 2026 e o luni; adunăm i zile ca să acoperim săptămâna.
  const d = new Date(Date.UTC(2026, 0, 5 + i, 12));
  return new Intl.DateTimeFormat("ro-RO", { weekday: "narrow" }).format(d);
});

/* Zilele unei luni, aranjate pe săptămâni care încep luni.
   Întoarce doar câte rânduri sunt necesare — o a șasea săptămână goală ar
   muta butoanele de sub calendar în jos, de la o lună la alta. */
export function saptamaniDinLuna(lunaISO) {
  const prima = new Date(`${primaZiDinLuna(lunaISO)}T00:00:00Z`);
  // getUTCDay: 0 = duminică. Îl aducem la 0 = luni.
  const decalaj = (prima.getUTCDay() + 6) % 7;
  const inLuna = new Date(Date.UTC(
    prima.getUTCFullYear(), prima.getUTCMonth() + 1, 0)).getUTCDate();

  const celule = [];
  for (let i = 0; i < decalaj; i++) celule.push(null);
  for (let z = 1; z <= inLuna; z++) {
    celule.push(`${lunaISO.slice(0, 7)}-${String(z).padStart(2, "0")}`);
  }
  while (celule.length % 7 !== 0) celule.push(null);

  const saptamani = [];
  for (let i = 0; i < celule.length; i += 7) saptamani.push(celule.slice(i, i + 7));
  return saptamani;
}
