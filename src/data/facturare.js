/* Acces la date pentru ciclul de viata al facturii: emitere, anulare,
 * stornare.
 *
 * Aceleasi reguli ca la restul stratului `src/data/`: aici stau CERERILE, nu
 * deciziile. Nicio functie de mai jos nu verifica permisiuni (asta fac
 * canBilling in interfata si, singura care conteaza cu adevarat,
 * has_billing_permission din Postgres), nu afiseaza toast-uri si nu scrie in
 * jurnal. Intorc date sau arunca; apelantul decide ce vede receptia.
 *
 * De ce e important tocmai aici: sunt scrierile pe bani. Faptul ca se pot citi
 * toate intr-un singur fisier de o suta de linii, in loc sa fie cautate prin
 * 9.400 de linii de JSX, e rostul intregii mutari.
 */
import { supabase } from "../supabase.js";
import { uid } from "../lib/uid.js";

/* Seria activa de facturare. Intoarce null daca nu e configurata niciuna —
   apelantul distinge intre "n-am putut citi" (arunca) si "nu exista" (null). */
export async function serieActiva() {
  const { data, error } = await supabase
    .from("invoice_series").select("series").eq("active", true).order("series").limit(1);
  if (error) throw error;
  return data?.[0]?.series || null;
}

/* Aloca urmatorul numar dintr-o serie.
   Numerotarea se incrementeaza in Postgres (next_invoice_number), nu aici:
   doi utilizatori care emit simultan trebuie sa primeasca numere diferite,
   iar asta se poate garanta doar in baza. Functia arunca daca seria nu
   exista sau e inactiva. */
export async function alocaNumarFactura(serie) {
  const { data, error } = await supabase.rpc("next_invoice_number", { p_series: serie });
  if (error) throw error;
  const rand = Array.isArray(data) ? data[0] : data;
  return { serie: rand.series, numar: rand.number };
}

/* Trece un draft in "emisa", cu serie si numar alocate. */
export async function marcheazaEmisa(idFactura, { serie, numar, emisDe }) {
  const { data, error } = await supabase.from("invoices").update({
    series: serie, number: numar, status: "issued",
    issue_date: new Date().toISOString(), issued_by: emisDe || null,
  }).eq("id", idFactura).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function anuleazaFactura(idFactura) {
  const { data, error } = await supabase.from("invoices")
    .update({ status: "cancelled" }).eq("id", idFactura).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* Stornarea unei facturi emise: creeaza o factura noua cu sumele negate,
 * copiaza liniile cu semn schimbat si marcheaza originalul ca stornat.
 *
 * `serie` vine de la apelant, nu e aleasa aici — o stornare poate avea, legal,
 * alta serie decat factura pe care o anuleaza, iar asta e o decizie fiscala a
 * pensiunii, nu una tehnica.
 *
 * Cele patru scrieri NU sunt o tranzactie (supabase-js nu expune asa ceva din
 * browser). Ordinea e aleasa ca orice esec sa lase o stare inspectabila, nu
 * una care minte: nota de credit se creeaza INAINTE ca originalul sa fie
 * marcat "credited". Daca ultimul pas cade, ramane o stornare emisa si o
 * factura inca marcata ca platita — vizibil si corectabil. Invers, originalul
 * ar aparea stornat fara sa existe documentul care il storneaza.
 */
export async function storneazaFactura(factura, { serie, creatDe }) {
  const { data: liniiSursa, error: eLinii } = await supabase
    .from("invoice_items").select("*").eq("invoice_id", factura.id);
  if (eLinii) throw eLinii;

  const { serie: serieNoua, numar } = await alocaNumarFactura(serie);

  const { data: stornare, error: eStornare } = await supabase.from("invoices").insert({
    id: uid(), series: serieNoua, number: numar,
    folio_id: factura.folio_id, billing_customer_id: factura.billing_customer_id,
    status: "issued", issue_date: new Date().toISOString(),
    subtotal_net: -factura.subtotal_net,
    subtotal_vat: -factura.subtotal_vat,
    total_amount: -factura.total_amount,
    credit_note_of: factura.id,
    created_by: creatDe || null, issued_by: creatDe || null,
  }).select().maybeSingle();
  if (eStornare) throw eStornare;

  const liniiStornare = (liniiSursa || []).map((l, i) => ({
    id: uid(), invoice_id: stornare.id, product_id: l.product_id, name: l.name,
    quantity: -l.quantity, unit_price: l.unit_price, vat_rate: l.vat_rate,
    net_amount: -l.net_amount, vat_amount: -l.vat_amount, total_amount: -l.total_amount,
    sort_order: i,
  }));
  if (liniiStornare.length) {
    const { error: eLiniiNoi } = await supabase.from("invoice_items").insert(liniiStornare);
    if (eLiniiNoi) throw eLiniiNoi;
  }

  const { data: original, error: eOriginal } = await supabase.from("invoices")
    .update({ status: "credited" }).eq("id", factura.id).select().maybeSingle();
  if (eOriginal) throw eOriginal;

  return { stornare, original, serie: serieNoua, numar };
}
