/* Acces la date pentru incasari: plati, chitante, seria de chitante.
 *
 * Aceleasi reguli ca in restul stratului `src/data/`: doar cereri. Nicio
 * decizie de permisiuni (RLS le impune in baza), niciun toast, nicio stare
 * React.
 */
import { supabase } from "../supabase.js";
import { uid } from "../lib/uid.js";

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

/* Numarul urmator de chitanta. Ca la facturi, incrementarea se face in
   Postgres, nu aici: doua incasari simultane trebuie sa primeasca numere
   diferite, iar asta se poate garanta doar in baza. */
export async function alocaNumarChitanta(serie) {
  const { data, error } = await supabase.rpc("next_receipt_number", { p_series: serie });
  if (error) throw error;
  const rand = Array.isArray(data) ? data[0] : data;
  return { serie: rand.series, numar: rand.number };
}

/* Inregistreaza o plata si intoarce factura REINCARCATA.
 *
 * Reincarcarea nu e un moft: soldul si statusul facturii (partially_paid /
 * paid) sunt calculate de un trigger in Postgres dupa inserare, deci obiectul
 * din memoria interfetei e invechit din clipa in care plata a intrat. */
export async function inregistreazaPlata({
  idFactura, suma, metoda, referinta, creatDe,
  serieChitanta, numarChitanta, numarBonCard, dataBonCard,
}) {
  const { error } = await supabase.from("payments").insert({
    id: uid(), invoice_id: idFactura, amount: Number(suma), method: metoda,
    reference: referinta || null, created_by: creatDe || null,
    receipt_series: serieChitanta || null, receipt_number: numarChitanta || null,
    card_receipt_number: numarBonCard || null,
    card_receipt_date: dataBonCard || null,
  });
  if (error) throw error;

  const { data: factura, error: eFactura } = await supabase
    .from("invoices").select("*").eq("id", idFactura).maybeSingle();
  if (eFactura) throw eFactura;
  return factura;
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
