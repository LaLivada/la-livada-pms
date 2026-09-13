/* Acces la date pentru RAPOARTE.
 *
 * Raportul lunar se calculeaza in baza (`raport_luna`, schema.sql) din 13
 * septembrie 2026 — browserul are doar fereastra de timp a rezervarilor
 * (docs/faza1.md §2.5), iar luna trecuta incepe dincolo de ea. Raspunsul
 * brut il traduce `statisticiDinSql` din lib/rapoarte.js in structurile pe
 * care le arata ecranul.
 */
import { supabase } from "../supabase.js";

export async function raportLuna(an, luna) {
  const { data, error } = await supabase.rpc("raport_luna", { p_an: an, p_luna: luna });
  if (error) throw error;
  return data;
}
