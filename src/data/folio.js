/* Acces la date pentru folio — nota de consum a unui sejur: cazarea plus
 * serviciile adaugate pe parcurs, inainte sa devina factura.
 *
 * Aceleasi reguli ca in restul stratului `src/data/`: doar cereri, fara
 * decizii de permisiuni, fara toast-uri, fara stare React.
 */
import { supabase } from "../supabase.js";

/* Scrie (sau actualizeaza) linia de cazare a unui folio.
   `upsert`, nu `insert`: linia de cazare e una singura per folio si se
   recalculeaza cand se schimba perioada sau pretul rezervarii. */
export async function salveazaLinieCazare(rand) {
  const { data, error } = await supabase
    .from("folio_items").upsert(rand).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function adaugaPozitie(rand) {
  const { data, error } = await supabase
    .from("folio_items").insert(rand).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* Sterge o pozitie. Regula "pozitiile facturate nu se sterg" NU e impusa
   aici — sta in interfata si, ca plasa de siguranta, in RLS. */
export async function stergePozitie(idPozitie) {
  const { error } = await supabase.from("folio_items").delete().eq("id", idPozitie);
  if (error) throw error;
}
