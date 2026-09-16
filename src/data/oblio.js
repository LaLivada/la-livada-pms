// @ts-check
/* Oblio (oblio.eu, docs/oblio.md) — drumul din browser: setarile fara secret
 * din app_state (`pms:oblio:v1`) si apelul catre functia edge
 * `oblio-facturare`. Browserul nu vorbeste niciodata direct cu Oblio:
 * tokenul contului sta doar in secretele functiei
 * (supabase/functions/oblio-facturare/index.ts). */

import { supabase } from "../supabase.js";
import { loadShared, saveShared } from "./stare-partajata.js";

export const CHEIE_OBLIO = "pms:oblio:v1";

/* `activ` decide pe unde ies facturile: prin Oblio (functia edge) sau pe
   drumul vechi (emite_factura, seria locala). Cat e oprit, nimic din restul
   nu se atinge — se poate configura si verifica inainte de a porni. Cheia
   e scrisa doar de admin (politica RLS pe app_state). */
export const SETARI_OBLIO_GOALE = Object.freeze({
  activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false,
});

export async function setariOblio() {
  const s = await loadShared(CHEIE_OBLIO, SETARI_OBLIO_GOALE);
  return { ...SETARI_OBLIO_GOALE, ...s };
}

export function salveazaSetariOblio(setari) {
  return saveShared(CHEIE_OBLIO, {
    ...SETARI_OBLIO_GOALE,
    ...setari,
    cif: String(setari.cif || "").trim().toUpperCase(),
    serie: String(setari.serie || "").trim(),
  });
}

export const oblioActiv = (setari) => setari?.activ === true;

/* Intoarce mereu un obiect {ok, ...}, niciodata nu arunca — ca
   cheamaDispozitiv: apelantii arata mesajul si merg mai departe. */
export async function cheamaOblio(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("oblio-facturare", { body: { action, ...payload } });
    if (error) {
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };
      const retea = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: retea
          ? "Nu am putut contacta serviciul de facturare. Verifică conexiunea și încearcă din nou."
          : (error.message || "Serviciul de facturare a răspuns cu eroare."),
      };
    }
    return data || { ok: false, error: "Răspuns gol de la serviciul de facturare." };
  } catch (e) {
    return { ok: false, error: e?.message || "Serviciul de facturare nu a răspuns." };
  }
}
