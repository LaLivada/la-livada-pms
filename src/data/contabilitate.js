/* Acces la date pentru exportul de contabilitate.
 *
 * Primul modul din stratul `src/data/`. Rostul stratului nu e estetic: pana
 * acum cele ~77 de apeluri Supabase ale aplicatiei stateau imprastiate prin
 * componente, iar la intrebarea "ce scrie aplicatia in tabelul X?" raspunsul
 * cerea citirea a 9.500 de linii de JSX. Grupate pe domenii, raspunsul e un
 * fisier.
 *
 * Regula modulului: aici stau CERERILE, nu deciziile. Nimic din ce e mai jos
 * nu decide daca utilizatorul are voie sa exporte (asta e canBilling in UI si,
 * mai important, RLS in baza de date), nu afiseaza toast-uri si nu tine stare
 * React. Intoarce date sau arunca.
 */
import { supabase } from "../supabase.js";
import { camelBillingCustomer } from "./mapari.js";

/* Facturile dintr-un interval, filtrate ca in ecranul de export.
   `statusuri` gol inseamna "fara filtru de status", nu "niciun status" —
   la fel ca in interfata, unde debifarea tuturor casutelor arata tot. */
export async function cautaFacturiDeExportat({ deLa, panaLa, serie, statusuri }) {
  let q = supabase.from("invoices").select("*")
    .gte("issue_date", deLa)
    .lte("issue_date", `${panaLa}T23:59:59`)
    .order("issue_date");
  if (serie && serie.trim()) q = q.eq("series", serie.trim());
  const listaStatus = Array.from(statusuri || []);
  if (listaStatus.length) q = q.in("status", listaStatus);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* Care dintre facturile date au mai fost exportate o data. Intoarce un obiect
   {invoice_id: true}, forma pe care o consuma direct interfata ca sa marcheze
   reexporturile. Lista goala nu atinge reteaua. */
export async function facturiDejaExportate(idFacturi) {
  if (!idFacturi || !idFacturi.length) return {};
  const { data, error } = await supabase
    .from("accounting_export_items").select("invoice_id").in("invoice_id", idFacturi);
  if (error) throw error;
  const rezultat = {};
  (data || []).forEach((e) => { rezultat[e.invoice_id] = true; });
  return rezultat;
}

/* Ultimele exporturi generate, pentru sectiunea de istoric. */
export async function istoricExporturi(limita = 20) {
  const { data, error } = await supabase
    .from("accounting_exports").select("*")
    .order("created_at", { ascending: false }).limit(limita);
  if (error) throw error;
  return data || [];
}

/* Tot ce trebuie stiut despre o factura ca sa poata fi transformata in XML:
   liniile, platile si clientul de facturare. Trei cereri care mergeau oricum
   mereu impreuna — grupate aici ca apelantul sa nu le poata desperechea. */
export async function detaliiFacturaPentruExport(factura) {
  const [linii, plati] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", factura.id).order("sort_order"),
    supabase.from("payments").select("*").eq("invoice_id", factura.id).order("paid_at"),
  ]);
  if (linii.error) throw linii.error;
  if (plati.error) throw plati.error;

  let client = null;
  if (factura.billing_customer_id) {
    const { data: c, error } = await supabase
      .from("billing_customers").select("*").eq("id", factura.billing_customer_id).maybeSingle();
    if (error) throw error;
    client = c ? camelBillingCustomer(c) : null;
  }
  return { linii: linii.data || [], plati: plati.data || [], client };
}

/* Consemneaza un export generat: antetul si facturile incluse.
 *
 * Cele doua scrieri NU sunt o tranzactie — Supabase-js nu expune asa ceva din
 * browser. Ordinea conteaza deci: intai antetul, apoi randurile care il
 * refera. Daca a doua esueaza, ramane un export fara linii (vizibil in istoric
 * ca export gol), nu linii orfane care ar face o factura sa para exportata
 * cand nu e — greseala in directia sigura, fiindca duce la un reexport
 * inutil, nu la o factura sarita de la contabilitate. */
export async function consemneazaExport({ id, deLa, panaLa, statusuri, serie, numeFisier, creatDe, facturi }) {
  const { error: eAntet } = await supabase.from("accounting_exports").insert({
    id, period_start: deLa, period_end: panaLa,
    status_filter: Array.from(statusuri || []),
    series_filter: (serie && serie.trim()) || null,
    format: "generic_v1", file_name: numeFisier, created_by: creatDe || null,
  });
  if (eAntet) throw eAntet;

  const randuri = (facturi || []).map((f) => ({
    export_id: id, invoice_id: f.id, is_reexport: !!f.esteReexport,
  }));
  const { error: eRanduri } = await supabase.from("accounting_export_items").insert(randuri);
  if (eRanduri) throw eRanduri;
}
