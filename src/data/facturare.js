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
import { camelBillingCustomer, snakeBillingCustomer } from "./mapari.js";

/* --- CITIRI ------------------------------------------------------- */

/* Toate facturile, pentru ecranul de lista. */
export async function listeazaFacturi() {
  const { data, error } = await supabase
    .from("invoices").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* Facturile emise catre un anumit client de facturare (istoricul firmei). */
export async function facturiAleClientului(idClient) {
  const { data, error } = await supabase.from("invoices")
    .select("*").eq("billing_customer_id", idClient).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* Tot ce trebuie ca sa se afiseze o factura: antetul, liniile, platile si
   clientul. Patru cereri care merg mereu impreuna. */
export async function detaliiFactura(idFactura) {
  const { data: factura, error } = await supabase
    .from("invoices").select("*").eq("id", idFactura).maybeSingle();
  if (error) throw error;
  if (!factura) return null;

  const [linii, plati] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", idFactura).order("sort_order"),
    supabase.from("payments").select("*").eq("invoice_id", idFactura).order("paid_at"),
  ]);
  if (linii.error) throw linii.error;
  if (plati.error) throw plati.error;

  let client = null;
  if (factura.billing_customer_id) {
    const { data: c, error: eClient } = await supabase
      .from("billing_customers").select("*").eq("id", factura.billing_customer_id).maybeSingle();
    if (eClient) throw eClient;
    client = c ? camelBillingCustomer(c) : null;
  }
  return { factura, linii: linii.data || [], plati: plati.data || [], client };
}

/* --- EDITAREA UNUI DRAFT ------------------------------------------ */

/* Salveaza o linie si recalculeaza totalurile facturii din TOATE liniile.
   Totalurile se trimit de apelant (le calculeaza din liniile pe care le are
   deja in memorie) — o a doua citire de aici ar putea vedea altceva decat
   vede utilizatorul pe ecran. */
export async function salveazaLinieFactura(idLinie, rand) {
  const { error } = await supabase.from("invoice_items").update(rand).eq("id", idLinie);
  if (error) throw error;
}

export async function actualizeazaTotaluri(idFactura, { net, tva, total }) {
  const { data, error } = await supabase.from("invoices")
    .update({ subtotal_net: net, subtotal_vat: tva, total_amount: total })
    .eq("id", idFactura).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function schimbaClientFactura(idFactura, idClient) {
  const { data, error } = await supabase.from("invoices")
    .update({ billing_customer_id: idClient }).eq("id", idFactura).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* --- CREAREA UNUI DRAFT DIN FOLIO --------------------------------- */

export async function creeazaClientFacturare(client) {
  const { data, error } = await supabase
    .from("billing_customers").insert(snakeBillingCustomer(client)).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* Creeaza factura draft din pozitiile selectate ale unui folio.
 *
 * `linii` vine gata calculata de apelant (agregarea extra-urilor in linia de
 * cazare, recalcularea TVA) — aia e logica de business a facturarii, nu
 * acces la date, si nu are ce cauta aici.
 *
 * Cele cinci scrieri NU sunt o tranzactie (supabase-js nu expune asa ceva din
 * browser). Ordinea e aleasa ca un esec sa nu lase pozitii de folio marcate
 * "facturate" fara o factura care sa le contina: marcarea e ULTIMA inainte de
 * totaluri. Invers, pozitiile ar deveni nefacturabile fara sa existe documentul
 * care le-a consumat — adica bani pierduti tacut.
 */
export async function creeazaFacturaDinFolio({ idFolio, idClient, deLa, panaLa, linii, creatDe }) {
  const { data: factura, error: eFactura } = await supabase.from("invoices").insert({
    id: uid(), folio_id: idFolio, billing_customer_id: idClient, status: "draft",
    service_date_start: deLa, service_date_end: panaLa,
  }).select().maybeSingle();
  if (eFactura) throw eFactura;

  const randuriLinii = linii.map((l, i) => ({
    id: uid(), invoice_id: factura.id, name: l.name, quantity: l.quantity,
    unit_price: l.unitPrice, vat_rate: l.vatRate, net_amount: l.netAmount,
    vat_amount: l.vatAmount, total_amount: l.totalAmount, sort_order: i,
  }));
  if (randuriLinii.length) {
    const { error } = await supabase.from("invoice_items").insert(randuriLinii);
    if (error) throw error;
  }

  /* Legatura linie-factura -> pozitii de folio. Fara ea, aceleasi pozitii ar
     putea fi facturate a doua oara. */
  const legaturi = linii.flatMap((l, i) =>
    l.sourceIds.map((idPozitie) => ({ invoice_item_id: randuriLinii[i].id, folio_item_id: idPozitie })));
  if (legaturi.length) {
    const { error } = await supabase.from("invoice_item_links").insert(legaturi);
    if (error) throw error;
  }

  const idPozitii = linii.flatMap((l) => l.sourceIds);
  if (idPozitii.length) {
    const { error } = await supabase
      .from("folio_items").update({ invoiced_status: "invoiced" }).in("id", idPozitii);
    if (error) throw error;
  }

  const net = linii.reduce((s, l) => s + l.netAmount, 0);
  const tva = linii.reduce((s, l) => s + l.vatAmount, 0);
  const total = linii.reduce((s, l) => s + l.totalAmount, 0);
  const { data: finala, error: eFinala } = await supabase.from("invoices").update({
    subtotal_net: net, subtotal_vat: tva, total_amount: total, created_by: creatDe || null,
  }).eq("id", factura.id).select().maybeSingle();
  if (eFinala) throw eFinala;
  return { factura: finala, total, nrLinii: linii.length };
}

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
