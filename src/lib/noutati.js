// @ts-check
/* „Nouă de la ultima deschidere" (faza 3, C7) — logica pură.
 *
 * Reperul e `vazutPanaLa`, ștampila întoarsă de `marcheaza_prezenta()`
 * (schema.sql): ultima bătaie de inimă dinaintea unei pauze adevărate. O
 * rezervare e nouă dacă a fost creată după reper — și nu chiar din acest
 * browser: pe cea făcută de tine acum zece minute ai văzut-o, evident, dar în
 * `reservations` nu scrie cine a creat-o, așa că aplicația ține minte singură
 * id-urile scrise din sesiunea asta (`idNoi`, chemat din updateReservations).
 *
 * Fără reper (prima deschidere din viața contului) nimic nu e nou — altfel ar
 * fi luminat tot calendarul. Fără `createdAt` (vederea cameristei) la fel.
 */

/* Cât de des bate inima cât timp pagina e vizibilă. Sub pauza de 30 de
   minute din `marcheaza_prezenta`, cu loc: o filă deschisă toată ziua nu
   trebuie să pară „închisă" între două bătăi. */
export const INTERVAL_PREZENTA_MS = 5 * 60 * 1000;

const moment = (text) => {
  const t = new Date(text ?? NaN).getTime();
  return Number.isNaN(t) ? null : t;
};

export function esteNoua(rezervare, noutati) {
  if (!rezervare || !noutati?.vazutPanaLa) return false;
  const reper = moment(noutati.vazutPanaLa);
  const creata = moment(rezervare.createdAt);
  if (reper == null || creata == null) return false;
  if (noutati.aleMele?.has(rezervare.id)) return false;
  return creata > reper;
}

export const numaraNoi = (rezervari, noutati) =>
  (rezervari || []).filter((r) => esteNoua(r, noutati)).length;

/* Id-urile din `dupa` care lipsesc din `inainte`: ce a creat acest browser. */
export function idNoi(inainte, dupa) {
  const vechi = new Set((inainte || []).map((r) => r.id));
  return (dupa || []).map((r) => r.id).filter((id) => !vechi.has(id));
}

/* Bătaia de inimă: acum, la fiecare revenire pe ecran și la câteva minute
 * cât timp pagina e vizibilă. `marcheaza` e cererea (data/prezenta.js);
 * `laReper` primește reperul de fiecare dată, fiindcă el se poate MUTA în
 * timpul unei sesiuni: telefonul stă blocat două ore și revine — tot ce a
 * intrat între timp e nou, iar ce era nou dimineață nu mai e.
 * Lipsa rețelei nu e o eroare aici: se încearcă iar la următoarea bătaie.
 * Întoarce funcția de oprire. */
export function pornestePrezenta({ marcheaza, laReper, doc = document, interval = INTERVAL_PREZENTA_MS }) {
  let activ = true;
  const bate = async () => {
    if (!activ || doc.visibilityState === "hidden") return;
    try {
      const reper = await marcheaza();
      if (activ) laReper(reper ?? null);
    } catch (e) {
      console.warn("Prezența nu s-a putut marca", e);
    }
  };
  const laVizibilitate = () => { if (doc.visibilityState === "visible") bate(); };
  doc.addEventListener("visibilitychange", laVizibilitate);
  const ceas = setInterval(bate, interval);
  bate();
  return () => {
    activ = false;
    clearInterval(ceas);
    doc.removeEventListener("visibilitychange", laVizibilitate);
  };
}
