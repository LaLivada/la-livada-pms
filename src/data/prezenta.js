// @ts-check
/* Prezenta utilizatorului (faza 3, C7): functia `marcheaza_prezenta` din
 * schema.sql — o bataie de inima care intoarce reperul `vazut_pana_la`
 * (ISO, sau null la prima deschidere). Cand si cat de des se bate decide
 * lib/noutati.js (pornestePrezenta), nu stratul asta.
 *
 * Aceleasi reguli ca in restul stratului: doar cererea, eroarea mai departe.
 */
import { supabase } from "../supabase.js";

export async function marcheazaPrezenta() {
  const { data, error } = await supabase.rpc("marcheaza_prezenta");
  if (error) throw error;
  return data || null;
}
