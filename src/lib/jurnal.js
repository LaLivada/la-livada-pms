/* Jurnalul de activitate — filtrarea pe camera si pe zi, gruparea pe zile.
 *
 * Logica pura, testabila fara DOM. Regula pe care o apara: camera NU e un
 * camp in `activity_log`, e text liber in `detail`. Ca sa se poata filtra
 * dupa ea, trebuie citita din sir — iar o citire lacoma scoate camere care
 * nu exista.
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

const timp = (e) => {
  const t = new Date(e?.ts ?? NaN).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/* Filtrul din spatele celor doua select-uri. Camera goala („") sau zi goala
 * inseamna „toate" — acelasi contract ca optiunea „Toate camerele"/„Toate
 * zilele" din select, ca ecranul sa nu traduca „” in altceva.
 */
export function filtreazaJurnal(intrari, { camera = "", zi = "" } = {}, numeCamere = []) {
  let lista = intrari || [];
  if (camera) lista = lista.filter((e) => cameraDinDetaliu(e?.detail, numeCamere) === camera);
  if (zi) lista = lista.filter((e) => ziLocala(e?.ts) === zi);
  return lista;
}

/* Zilele care chiar au o intrare, pentru optiunile select-ului — nu tot
 * calendarul, ca sa nu apara zile goale de ales. Descrescator: cea mai
 * recenta zi prima, la fel ca restul jurnalului.
 */
export function ziiDistincte(intrari) {
  const zile = new Set();
  for (const e of intrari || []) {
    const z = ziLocala(e?.ts);
    if (z) zile.add(z);
  }
  return [...zile].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/* Gruparea pe zile calendaristice, cea mai noua zi prima; in interiorul unei
 * zile, cea mai noua intrare prima — acelasi sens peste tot in jurnal.
 * Intrarile fara zi valida (fara `ts`) nu ar trebui sa existe in practica,
 * dar cad intr-un grup separat, la coada, in loc sa strice sortarea celor
 * cu data buna.
 */
export function grupeazaPeZi(intrari) {
  const pe_zi = new Map();
  for (const e of intrari || []) {
    const z = ziLocala(e?.ts);
    if (!pe_zi.has(z)) pe_zi.set(z, []);
    pe_zi.get(z).push(e);
  }
  const zile = [...pe_zi.keys()].sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  return zile.map((zi) => ({
    zi,
    intrari: pe_zi.get(zi).slice().sort((a, b) => timp(b) - timp(a)),
  }));
}

/* Eticheta zilei din antetul grupului, ex. „Vineri, 11.09.2026". Construita
 * din partile sirului „AAAA-LL-ZZ", nu din `new Date(zi)`: acela e interpretat
 * ca miezul noptii UTC, iar la vest de Greenwich Intl.DateTimeFormat cu fus
 * local l-ar fi afisat cu o zi in urma. */
export function etichetaZi(zi) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(zi || ""));
  if (!m) return "Fără dată";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const zileSapt = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
  const p = (n) => String(n).padStart(2, "0");
  return `${zileSapt[d.getDay()]}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
