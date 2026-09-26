// @ts-check
/* Apelul catre o functie edge a PMS-ului — acces (TTLock), dispozitive
 * (Shelly), facturare (Oblio), televizoare (LYNK) — cu aceeasi traducere a
 * esecurilor pentru toate.
 *
 * Nu arunca NICIODATA: intoarce `{ ok: false, error }`, iar apelantul arata
 * mesajul si merge mai departe. O yala, o priza sau un televizor care nu
 * raspunde n-are voie sa darame un check-in sau un ecran.
 *
 * Pana pe 26 septembrie 2026 fiecare serviciu isi avea copia lui a acestui
 * cod, si toate spuneau „Verifică conexiunea" cand cererea nu pleca. Din
 * browser insa, o functie nepublicata (preflight 404, deci CORS), un server
 * cazut, o extensie care blocheaza si o retea cazuta arata la fel:
 * `FunctionsFetchError`. Doar `navigator.onLine === false` spune sigur ca e
 * reteaua omului. tv-provider a stat nepublicata opt zile, iar „Verifică
 * conexiunea" de dupa fiecare check-in l-a facut pe receptioner sa creada ca
 * nici rezervarile nu se salvau.
 */
import { supabase } from "../supabase.js";
import { esteOffline } from "./coada.js";

/**
 * @param {string} functie   numele functiei edge, ex. "access-provider"
 * @param {string} serviciu  cum ii spune omul, dupa „Serviciul de …", ex. "acces"
 * @param {Record<string, unknown>} corp
 * @returns {Promise<any>}
 */
export async function cheamaFunctie(functie, serviciu, corp) {
  try {
    const { data, error } = await supabase.functions.invoke(functie, { body: corp });
    if (error) {
      /* invoke() marcheaza ca eroare orice status non-2xx, dar corpul are
         mesajul nostru — il preferam celui generic al bibliotecii. */
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };

      /* Fara corp de raspuns: cererea n-a ajuns deloc la functie. */
      const nuAPlecat = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: nuAPlecat
          ? (esteOffline() ? "Nu există conexiune la internet." : `Serviciul de ${serviciu} nu a răspuns.`)
          : (error.message || `Serviciul de ${serviciu} a răspuns cu eroare.`),
      };
    }
    return data || { ok: false, error: `Răspuns gol de la serviciul de ${serviciu}.` };
  } catch (e) {
    return { ok: false, error: e?.message || `Serviciul de ${serviciu} nu a răspuns.` };
  }
}
