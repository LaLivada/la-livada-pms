/* Acces la date pentru codurile de yala.
 *
 * Atentie la asimetrie, e deliberata: de AICI se poate doar CITI. Tabelele
 * access_codes si access_notifications nu au nicio politica RLS de scriere
 * pentru utilizatori autentificati — se scriu exclusiv din Edge Function-ul
 * `access-provider`, cu service_role. Altfel un cod care deschide o usa ar
 * putea fi inventat din browser, fara ca yala sa stie de el.
 *
 * Comanda propriu-zisa (generare, revocare, deschidere) trece deci prin
 * cheamaAcces din pms-app.jsx, nu pe aici.
 */
import { supabase } from "../supabase.js";

/* Codul activ al unei rezervari, sau null. Indexul unic din baza garanteaza
   ca nu pot exista doua active pe aceeasi rezervare. */
export async function codActiv(idRezervare) {
  const { data, error } = await supabase.from("access_codes")
    .select("*").eq("reservation_id", idRezervare).eq("status", "active").maybeSingle();
  if (error) throw error;
  return data || null;
}

/* Varianta usoara, cand conteaza doar DACA exista un cod, nu si care e —
   folosita la resincronizarea de dupa mutarea unei rezervari. */
export async function existaCodActiv(idRezervare) {
  const { data, error } = await supabase.from("access_codes")
    .select("id").eq("reservation_id", idRezervare).eq("status", "active").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/* Istoricul trimiterilor (email / WhatsApp) pentru un cod. */
export async function trimiteriPentruCod(idCod) {
  const { data, error } = await supabase.from("access_notifications")
    .select("*").eq("access_code_id", idCod).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* Codul activ impreuna cu trimiterile lui — cele doua se afiseaza mereu
   impreuna in fereastra rezervarii. */
export async function codActivCuTrimiteri(idRezervare) {
  const cod = await codActiv(idRezervare);
  if (!cod) return { cod: null, trimiteri: [] };
  return { cod, trimiteri: await trimiteriPentruCod(cod.id) };
}
