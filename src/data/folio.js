// @ts-check
/* Acces la date pentru folio — nota de consum a unui sejur: cazarea plus
 * serviciile adaugate pe parcurs, inainte sa devina factura.
 *
 * Aceleasi reguli ca in restul stratului `src/data/`: doar cereri, fara
 * decizii de permisiuni, fara toast-uri, fara stare React.
 */
import { supabase } from "../supabase.js";
import { uid } from "../lib/uid.js";

/* Folio-ul unei rezervari, creat daca nu exista inca.

   Doua apeluri care se monteaza in acelasi timp (panoul folio si fereastra
   de facturare a grupului, sau doar dublul efect din dev) pot incerca sa-l
   creeze amandoua; coloana `folios.reservation_id` e unica, deci al doilea
   ia 23505 si citeste randul celuilalt in loc sa esueze. */
export async function folioPentruRezervare(idRezervare) {
  const { data: gasit, error } = await supabase
    .from("folios").select("*").eq("reservation_id", idRezervare).maybeSingle();
  if (error) throw error;
  if (gasit) return gasit;
  const { data: creat, error: eCreare } = await supabase
    .from("folios").insert({ id: uid(), reservation_id: idRezervare }).select().maybeSingle();
  if (!eCreare) return creat;
  if (eCreare.code !== "23505") throw eCreare;
  const { data: alCeluilalt, error: eRecitire } = await supabase
    .from("folios").select("*").eq("reservation_id", idRezervare).maybeSingle();
  if (eRecitire) throw eRecitire;
  return alCeluilalt;
}

/* Pozitiile unui folio, in ordinea in care s-au petrecut. */
export async function pozitiiFolio(idFolio) {
  const { data, error } = await supabase
    .from("folio_items").select("*").eq("folio_id", idFolio).order("occurred_at");
  if (error) throw error;
  return data || [];
}

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
