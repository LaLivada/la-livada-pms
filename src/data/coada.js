/* Coada de salvari — partea cu retea si browser (faza 3, C8). Regulile sunt
 * in lib/coada-salvari.js; aici sunt cererile efective, evenimentele
 * `online` / `visibilitychange`, ceasul de reincercare si garda de la
 * inchiderea filei. Stratul de date (nucleu.js, curatenie.js, lib/audit.js)
 * cheama `amanaDacaERetea` cand o scriere a picat: daca a fost reteaua,
 * randurile intra in coada si apelantul merge mai departe ca si cum s-ar
 * fi scris; altfel eroarea ramane a lui.
 */
import { supabase } from "../supabase.js";
import { creeazaCoada, esteEroareDeRetea, primulLot, INTERVAL_REINCERCARE_MS } from "../lib/coada-salvari.js";

export const coadaSalvari = creeazaCoada();

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
   20 s cat timp e ceva in coada. `laScris(lot, data)` primeste ce a scris
   fiecare lot (stampilele rezervarilor, randul de room_status);
   `laEsec(lot, eroare)` — un verdict al bazei pentru un lot amanat;
   `laAmanare()` — prima operatie intrata intr-o coada goala, ca ecranul sa
   poata anunta o data „se trimite cand revine internetul". */
export function pornesteCoada({ laScris, laEsec, laAmanare } = {}) {
  if (oprire) return oprire;
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
  const laSchimbare = () => {
    const goala = coadaSalvari.marime() === 0;
    if (eraGoala && !goala) laAmanare?.();
    eraGoala = goala;
  };
  window.addEventListener("online", incearca);
  document.addEventListener("visibilitychange", laVizibil);
  window.addEventListener("beforeunload", laInchidere);
  const dezabonare = coadaSalvari.asculta(laSchimbare);
  const ceas = setInterval(incearca, INTERVAL_REINCERCARE_MS);
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
