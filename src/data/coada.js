// @ts-check
/* Coada de salvari — partea cu retea si browser (faza 3, C8). Regulile sunt
 * in lib/coada-salvari.js; aici sunt cererile efective, evenimentele
 * `online` / `visibilitychange`, ceasul de reincercare si garda de la
 * inchiderea filei. Stratul de date (nucleu.js, curatenie.js, lib/audit.js)
 * cheama `amanaDacaERetea` cand o scriere a picat: daca a fost reteaua,
 * randurile intra in coada si apelantul merge mai departe ca si cum s-ar
 * fi scris; altfel eroarea ramane a lui.
 */
import { supabase } from "../supabase.js";
import { creeazaCoada, esteEroareDeRetea, primulLot, INTERVAL_REINCERCARE_MS, opsDinText, textDinOps } from "../lib/coada-salvari.js";

export const coadaSalvari = creeazaCoada();

/* Coada se tine si in localStorage (26 septembrie 2026), ca sa supravietuiasca
   unei file inchise, unei reincarcari sau unei aplicatii de pe ecranul de
   start oprite de iOS — pana atunci traia doar in memorie si se pierdea tacut.

   PE UTILIZATOR: randurile nu poarta autorul (jurnalul se semneaza pe server
   cu sesiunea care trimite), deci salvarile lui A trimise din sesiunea lui B
   ar ajunge in jurnal pe numele lui B. Fiecare isi regaseste coada lui.

   Totul e „cat se poate": fara localStorage (navigare privata, cota plina)
   coada merge mai departe in memorie, ca inainte. Doua file ale aceluiasi om,
   amandoua offline, scriu aceeasi cheie — ramane lista ultimei schimbari;
   fiecare fila isi trimite oricum coada ei din memorie. */
export const cheieCoada = (utilizator) => `ldv-coada:${utilizator}`;

function citesteCoada(utilizator) {
  try { return opsDinText(localStorage.getItem(cheieCoada(utilizator))); }
  catch { return []; }
}

function scrieCoada(utilizator, ops) {
  try {
    if (ops.length) localStorage.setItem(cheieCoada(utilizator), textDinOps(ops));
    else localStorage.removeItem(cheieCoada(utilizator));
  } catch { /* fara stocare: coada ramane doar in memorie */ }
}

/* Al cui e ce sta acum in memorie. */
let proprietar = null;

export const esteOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export function amanaDacaERetea(eroare, ops) {
  if (!esteEroareDeRetea(eroare, !esteOffline())) return false;
  for (const op of ops) coadaSalvari.adauga(op);
  return true;
}

/* Un lot (vezi primulLot): aceeasi operatie, acelasi tabel. Upsert-ul da
   inapoi randurile scrise, cu ce a completat serverul (stampile). */
export async function executaLot(lot) {
  const { tip, tabel } = lot[0];
  if (tip === "upsert") {
    const { data, error } = await supabase.from(tabel)
      .upsert(lot.map((o) => o.rand), { onConflict: lot[0].onConflict || "id" }).select();
    if (error) throw error;
    return data || [];
  }
  if (tip === "delete") {
    const { error } = await supabase.from(tabel).delete().in("id", lot.map((o) => o.id));
    if (error) throw error;
    return [];
  }
  if (tip === "insert") {
    const { error } = await supabase.from(tabel).insert(lot.map((o) => o.rand));
    if (error) throw error;
    return [];
  }
  throw new Error(`Operație necunoscută în coadă: ${tip}`);
}

let oprire = null;

/* Porneste reincercarea: la `online`, la revenirea pe fila si la fiecare
   20 s cat timp e ceva in coada. `utilizator` e cel logat: coada lui din
   localStorage se reia la pornire si se tine la zi la fiecare schimbare.
   `laScris(lot, data)` primeste ce a scris fiecare lot (stampilele
   rezervarilor, randul de room_status); `laEsec(lot, eroare)` — un verdict
   al bazei pentru un lot amanat; `laAmanare()` — prima operatie intrata
   intr-o coada goala, ca ecranul sa poata anunta o data „se trimite cand
   revine internetul"; `laRestaurare(n)` — cate salvari au ramas de data
   trecuta. */
/** @param {{ utilizator?: string, laScris?: (lot: object[], date: unknown) => void, laEsec?: (lot: object[], eroare: unknown) => void, laAmanare?: () => void, laRestaurare?: (n: number) => void }} [asculta] */
export function pornesteCoada({ utilizator, laScris, laEsec, laAmanare, laRestaurare } = {}) {
  if (oprire) return oprire;
  /* Alt om la aceeasi fila (deconectare, apoi altcineva): ce era in memorie
     ramane in cheia celui dinainte, nu pleaca din sesiunea noului venit.
     Pentru acelasi om, memoria e deja la zi — n-are ce relua. */
  if (utilizator && utilizator !== proprietar) {
    if (proprietar) {
      scrieCoada(proprietar, coadaSalvari.lista());
      coadaSalvari.goleste();
    }
    proprietar = utilizator;
    const venite = coadaSalvari.restaureaza(citesteCoada(utilizator));
    if (venite) laRestaurare?.(venite);
  }
  const incearca = async () => {
    if (!coadaSalvari.marime() || esteOffline() || coadaSalvari.inCurs()) return;
    const r = await coadaSalvari.ruleaza(executaLot);
    for (const s of r.scrise) laScris?.(s.lot, s.data);
    for (const x of r.esuate) laEsec?.(x.lot, x.eroare);
  };
  const laVizibil = () => { if (document.visibilityState === "visible") incearca(); };
  const laInchidere = (e) => {
    if (!coadaSalvari.marime()) return;
    e.preventDefault();
    e.returnValue = "";
  };
  let eraGoala = coadaSalvari.marime() === 0;
  const pastreaza = () => { if (proprietar) scrieCoada(proprietar, coadaSalvari.lista()); };
  const laSchimbare = () => {
    const goala = coadaSalvari.marime() === 0;
    if (eraGoala && !goala) laAmanare?.();
    eraGoala = goala;
    pastreaza();
  };
  window.addEventListener("online", incearca);
  document.addEventListener("visibilitychange", laVizibil);
  window.addEventListener("beforeunload", laInchidere);
  const dezabonare = coadaSalvari.asculta(laSchimbare);
  const ceas = setInterval(incearca, INTERVAL_REINCERCARE_MS);
  /* Ce s-a reluat din localStorage se scrie inapoi in forma curatata si, cu
     internet, pleaca acum, nu peste 20 de secunde. */
  pastreaza();
  incearca();
  oprire = () => {
    window.removeEventListener("online", incearca);
    document.removeEventListener("visibilitychange", laVizibil);
    window.removeEventListener("beforeunload", laInchidere);
    dezabonare();
    clearInterval(ceas);
    oprire = null;
  };
  return oprire;
}

export { primulLot };
