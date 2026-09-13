/* Cererile pentru conflictul de concurenta (faza 3, C5, lib/conflict.js):
 * versiunea de pe server a randurilor refuzate si cine a umblat ultima
 * data la ele. Aceleasi reguli ca in restul stratului: doar cereri, iesirea
 * in forma aplicatiei, erorile aruncate mai departe.
 */
import { supabase } from "../supabase.js";
import { camelRes } from "./mapari.js";

export async function rezervariDePeServer(ids) {
  if (!ids?.length) return [];
  const { data, error } = await supabase.from("reservations").select("*").in("id", ids);
  if (error) throw error;
  return (data || []).map(camelRes);
}

/* Cine a modificat ultima data fiecare rezervare — din jurnal, pe coloana
   `reservation_id` (faza 2, A4). Doar orientativ: intrarea o scrie
   browserul celuilalt DUPA salvare, deci poate lipsi cateva clipe; lipsa
   ei nu opreste dialogul, de-aia eroarea e inghitita aici. */
export async function ultimeleModificari(ids) {
  const rezultat = new Map();
  if (!ids?.length) return rezultat;
  const { data, error } = await supabase
    .from("activity_log")
    .select("reservation_id, user_name, at, action")
    .in("reservation_id", ids)
    .order("at", { ascending: false })
    .limit(ids.length * 5);
  if (error) { console.warn("Jurnalul nu a putut fi citit pentru conflict", error); return rezultat; }
  for (const r of data || []) {
    if (!rezultat.has(r.reservation_id)) rezultat.set(r.reservation_id, { userName: r.user_name, at: r.at, action: r.action });
  }
  return rezultat;
}
