/* Cautarea globala pe server (faza 3, C1): functia `cauta_rezervari` din
 * schema.sql — REZERVARI, nu oaspeti, cu titularul, camera si grupul pe
 * acelasi rand, ca lista sa se deseneze fara sa astepte nimic altceva.
 * Rezervarea vine ca valoare compusa si trece prin acelasi `camelRes` ca
 * restul aplicatiei. Textul prea scurt nu cere nimic (lib/cautare.js).
 *
 * Aceleasi reguli ca in restul stratului: doar cereri, iesirea in forma
 * aplicatiei (camelCase), erorile aruncate mai departe.
 */
import { supabase } from "../supabase.js";
import { camelRes } from "./mapari.js";
import { LIMITA_CAUTARE_GLOBALA, textDeCautat } from "../lib/cautare.js";

export const camelRezultat = (x) => ({
  rezervare: camelRes(x.rezervare || {}),
  camera: x.room_name || "",
  oaspete: { lastName: x.guest_last_name || "", firstName: x.guest_first_name || "", phone: x.guest_phone || "" },
  grup: x.group_name || "",
  potrivire: x.potrivire || "",
});

export async function cautaRezervari(text, limita = LIMITA_CAUTARE_GLOBALA) {
  const t = textDeCautat(text);
  if (!t) return [];
  const { data, error } = await supabase.rpc("cauta_rezervari", { p_text: t, p_limita: limita });
  if (error) throw error;
  return (data || []).map(camelRezultat);
}
