/* Jurnalul de activitate — sortarea si citirea camerei din detaliu.
 *
 * Logica pura, testabila fara DOM. Regula pe care o apara: camera NU e un
 * camp in `activity_log`, e text liber in `detail`. Ca sa se poata sorta
 * dupa ea, trebuie citita din sir — iar o citire lacoma scoate camere care
 * nu exista.
 *
 * De ce nu e coloana in tabel: jurnalul consemneaza si actiuni fara nicio
 * camera (tarife, clienti, useri), si actiuni cu doua (un boiler partajat,
 * o rezervare mutata). O coloana ar fi trebuit sa minta la amandoua.
 * Sortarea are nevoie doar de PRIMA camera mentionata, si atat.
 */

/* CAMERELE SE CAUTA DUPA NUMELE REAL, nu dupa un tipar de patru cifre.
 * `\b\d{4}\b` ar fi fost mai scurt si ar fi mers pe aproape tot — pana la
 * „preț 1000 lei → 900 lei", unde ar fi scos camera 1000, care nu exista.
 * Cu lista reala, un numar care nu e cameră nu poate deveni una.
 *
 * Ramane o singura ambiguitate: un pret care nimereste exact un numar de
 * camera („preț 1002 lei"). De-aia se sare peste potrivirile urmate de
 * „lei" — singura unitate care apare dupa un numar in jurnal.
 */
const URMAT_DE_LEI = /^\s*lei\b/;

export function cameraDinDetaliu(detaliu, numeCamere) {
  const text = String(detaliu || "");
  if (!text) return "";
  let gasita = "", pozitie = Infinity;
  for (const nume of numeCamere || []) {
    const n = String(nume);
    if (!n) continue;
    /* Cautare repetata: prima aparitie a unui nume poate fi un pret, a doua
       o camera adevarata. „preț 1002 lei · 1002" e artificial, dar costa o
       bucla sa nu fie o exceptie. */
    let de = 0;
    for (;;) {
      const i = text.indexOf(n, de);
      if (i < 0) break;
      de = i + n.length;
      const inainte = i === 0 ? "" : text[i - 1];
      const dupa = text.slice(de);
      const marginit = !/[0-9A-Za-z]/.test(inainte) && !/^[0-9A-Za-z]/.test(dupa);
      if (marginit && !URMAT_DE_LEI.test(dupa)) {
        if (i < pozitie) { gasita = n; pozitie = i; }
        break;  // prima aparitie buna a acestui nume; mai departe nu ajuta
      }
    }
  }
  return gasita;
}

/* Ziua locala a unei intrari, ca „2026-09-11". Local, nu UTC: recepția
   lucreaza pana dupa miezul noptii, iar o actiune de la 01:30 trebuie sa
   cada in ziua in care omul crede ca a facut-o. */
export function ziLocala(ts) {
  /* `new Date(null)` NU e o data invalida — e 1 ianuarie 1970. Lipsa se
     opreste aici, altfel o intrare fara `ts` ar fi aratat ca o zi reala. */
  if (ts == null || ts === "") return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const COLOANE = { ZI: "zi", CAMERA: "camera" };

const timp = (e) => {
  const t = new Date(e?.ts ?? NaN).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/* Sortarea dupa camera pastreaza TIMPUL ca cheie secundara, mereu
 * descrescator. Fara asta, cele 40 de intrari ale camerei 1001 ar fi iesit
 * intr-o ordine oarecare, si tocmai ordinea lor e ce cauti cand grupezi pe
 * camera: „ce s-a intamplat la 1001, in ordine".
 *
 * Camerele fara nume („Tarife modificate") cad la coada in amandoua
 * sensurile. O actiune fara camera n-are ce cauta prima intr-o lista
 * sortata pe camere, nici crescator, nici descrescator.
 */
export function sorteazaJurnal(intrari, { dupa = COLOANE.ZI, desc = true } = {}, numeCamere = []) {
  const lista = (intrari || []).slice();
  if (dupa === COLOANE.CAMERA) {
    const rang = new Map((numeCamere || []).map((n, i) => [String(n), i]));
    const cheie = (e) => {
      const c = cameraDinDetaliu(e?.detail, numeCamere);
      return c === "" ? Infinity : (rang.get(c) ?? Infinity);
    };
    return lista.sort((a, b) => {
      const ca = cheie(a), cb = cheie(b);
      if (ca !== cb) {
        if (ca === Infinity) return 1;
        if (cb === Infinity) return -1;
        return desc ? cb - ca : ca - cb;
      }
      return timp(b) - timp(a);
    });
  }
  return lista.sort((a, b) => (desc ? timp(b) - timp(a) : timp(a) - timp(b)));
}
