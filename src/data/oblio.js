// @ts-check
/* Oblio (oblio.eu, docs/oblio.md) — drumul din browser: setarile fara secret
 * din app_state (`pms:oblio:v1`) si apelul catre functia edge
 * `oblio-facturare`. Browserul nu vorbeste niciodata direct cu Oblio:
 * tokenul contului sta doar in secretele functiei
 * (supabase/functions/oblio-facturare/index.ts). */

import { supabase } from "../supabase.js";
import { cheamaFunctie } from "./functii-edge.js";
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

/* Aceleasi setari, dar cu eroarea aruncata mai departe. `loadShared` inghite
   orice esec de citire si intoarce fallback-ul — pentru un ecran e bine (se
   vede „oprit" si omul reincarca), pentru emitere e periculos: `activ` s-ar
   citi `false` dintr-o pana de retea, iar factura ar primi un numar LOCAL
   fara pereche in Oblio. La o operatie fiscala, directia sigura e refuzul.
   Lipsa randului NU e o eroare: inseamna setarile goale, adica oprit. */
export async function setariOblioStrict() {
  const { data, error } = await supabase
    .from("app_state").select("value").eq("key", CHEIE_OBLIO).maybeSingle();
  if (error) throw error;
  return { ...SETARI_OBLIO_GOALE, ...(data?.value || {}) };
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
export const cheamaOblio = (action, payload = {}) =>
  cheamaFunctie("oblio-facturare", "facturare", { action, ...payload });
