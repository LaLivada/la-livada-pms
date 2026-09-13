/* Acces la date pentru incasari: plati, chitante, seria de chitante.
 *
 * Aceleasi reguli ca in restul stratului `src/data/`: doar cereri. Nicio
 * decizie de permisiuni (RLS le impune in baza), niciun toast, nicio stare
 * React.
 */
import { supabase } from "../supabase.js";

/* Seria de chitante. Randul e unul singur, cu id fix "series-ch" — pensiunea
   are o singura serie de chitante, spre deosebire de facturi. */
const ID_SERIE_CHITANTE = "series-ch";

export async function serieChitante() {
  const { data, error } = await supabase
    .from("receipt_series").select("*").eq("id", ID_SERIE_CHITANTE).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function schimbaSerieChitante(serieNoua) {
  const { error } = await supabase
    .from("receipt_series").update({ series: serieNoua }).eq("id", ID_SERIE_CHITANTE);
  if (error) throw error;
}

/* Inregistreaza o plata — si, la numerar, ii aloca numarul de chitanta — intr-o
 * singura tranzactie (inregistreaza_plata, faza 2 B7). Pana pe 14 septembrie
 * 2026 numarul se lua dintr-un apel (next_receipt_number) si plata se insera
 * din altul: un esec la al doilea consuma numarul degeaba.
 *
 * Intoarce plata scrisa si factura REINCARCATA. Reincarcarea nu e un moft:
 * soldul si statusul facturii (partially_paid / paid) sunt calculate de un
 * trigger in Postgres dupa inserare, deci obiectul din memoria interfetei e
 * invechit din clipa in care plata a intrat. Cine a incasat se ia din
 * sesiune, pe server. */
export async function inregistreazaPlata({
  idFactura, suma, metoda, referinta,
  cuChitanta, serieChitanta, numarBonCard, dataBonCard,
}) {
  const { data, error } = await supabase.rpc("inregistreaza_plata", {
    p_invoice_id: idFactura, p_amount: Number(suma), p_method: metoda,
    p_reference: referinta || null,
    p_cu_chitanta: !!cuChitanta, p_serie_chitanta: serieChitanta || null,
    p_bon_card: numarBonCard || null, p_data_bon: dataBonCard || null,
  });
  if (error) throw error;
  return { factura: data?.factura, plata: data?.plata };
}

/* Toate incasarile, cu factura fiecareia atasata — pentru ecranul de
   Incasari. Facturile se citesc intr-o singura cerere, nu una per plata. */
export async function listeazaPlatiCuFacturi() {
  const { data: plati, error } = await supabase
    .from("payments").select("*").order("paid_at", { ascending: false });
  if (error) throw error;

  const idFacturi = Array.from(new Set((plati || []).map((p) => p.invoice_id).filter(Boolean)));
  let facturiDupaId = {};
  if (idFacturi.length) {
    const { data: facturi, error: eFacturi } = await supabase
      .from("invoices").select("id, series, number, billing_customer_id").in("id", idFacturi);
    if (eFacturi) throw eFacturi;
    facturiDupaId = Object.fromEntries((facturi || []).map((f) => [f.id, f]));
  }
  return { plati: plati || [], facturiDupaId };
}
