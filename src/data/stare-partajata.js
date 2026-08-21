/* Starea partajata din tabelul `app_state`: cheie -> JSON.
 *
 * Ce a mai ramas din vremea in care TOATA aplicatia traia in cateva blob-uri
 * JSON. Restul s-a mutat pe tabele reale (vezi nucleu.js); aici raman doar
 * lucrurile care chiar sunt niste setari libere: curatenia, jurnalul,
 * blocajele.
 */

import { supabase } from "../supabase.js";

export const K = {
  core: "pms:core:v3",
  res: "pms:reservations:v3",
  hk: "pms:housekeeping:v3",
  groups: "pms:groups:v3",
  log: "pms:log:v3",
  blocks: "pms:blocks:v3",
};

/* Audit log — module-level so any component can record an action
   without threading a callback through every layer. */
/* Apel catre functia `access-provider` — singurul drum prin care aplicatia
   ajunge la yalele electronice. Nu vorbim niciodata direct cu TTLock din
   browser: acolo ar trebui sa stea parola contului care administreaza toate
   yalele. Functia primeste doar id-ul rezervarii si citeste singura restul.

   Intoarce mereu un obiect, niciodata arunca: apelantii trebuie sa poata
   continua (check-in-ul nu are voie sa cada fiindca o yala n-a raspuns). */

export async function loadShared(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("app_state").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    const parsed = data ? data.value : null;
    if (parsed == null) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)
      && (typeof parsed !== "object" || Array.isArray(parsed))) return fallback;
    return parsed;
  } catch (e) {
    console.error("Storage read failed", key, e);
    return fallback;
  }
}
/* Arunca eroarea mai departe, nu o inghite. Inainte intorcea `false` si
   fiecare apelant ignora rezultatul: o schimbare de status de curatenie
   sau o setare putea sa nu se salveze deloc, iar ecranul continua sa
   arate valoarea noua ca si cum ar fi fost scrisa. */

export async function saveShared(key, value) {
  const { error } = await supabase
    .from("app_state")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    console.error("Storage save failed", key, error);
    throw error;
  }
  return true;
}

/* ---------------------------------------------------------------
   ERROR BOUNDARY
   A render error anywhere below would otherwise leave a blank or
   half-drawn screen with no way out.
----------------------------------------------------------------*/
