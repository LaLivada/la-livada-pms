// Facturarea prin Oblio (https://www.oblio.eu/api; docs/oblio.md). Browserul
// nu vorbește niciodată direct cu Oblio: acolo ar trebui să stea tokenul
// contului, care poate emite și anula orice document al firmei. Funcția
// primește doar id-ul facturii din PMS și o acțiune, citește singură restul,
// cere Oblio-ului documentul și abia apoi scrie în baza noastră ce a răspuns.
//
// POST {action, invoiceId?, cif?, serie?} cu JWT-ul userului logat (se
// deployează cu verify_jwt, cel implicit). Acțiunile și permisiunea de
// facturare cerută: PERMISIUNI din oblio.ts.
//
// Secretele (Dashboard → Edge Functions → Secrets, niciodată în repo):
//   OBLIO_CLIENT_ID      emailul contului Oblio
//   OBLIO_CLIENT_SECRET  tokenul din Oblio → Setări → Date cont
// Setările fără secret (CIF, seria, activ) stau în app_state `pms:oblio:v1`.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  obtineToken, tokenValabil, cereOblio, aziBucuresti, facturaOblio, stornoOblio, anulareOblio,
  raspunsEmitere, EroareOblio, PERMISIUNI, type Token, type SetariOblio, type CotaTva,
} from "./oblio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CLIENT_ID = (Deno.env.get("OBLIO_CLIENT_ID") || "").trim();
const CLIENT_SECRET = (Deno.env.get("OBLIO_CLIENT_SECRET") || "").trim();
const CHEIE_SETARI = "pms:oblio:v1";

// CORS ca la anaf-lookup: doar aplicația și originile de dezvoltare.
const ORIGINI_PERMISE = [
  "https://pms.lalivada.ro", "http://localhost:5173", "http://127.0.0.1:5173",
  ...(Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o) => o.trim()).filter(Boolean),
];
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ORIGINI_PERMISE.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
const raspunde = (req: Request, corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });

/* Erori ale cererii (factura nu există, stare nepotrivită): ajung la om cu
   statusul lor, nu ca „Oblio: …". */
class EroareCerere extends Error {
  constructor(mesaj: string, public status = 400) { super(mesaj); this.name = "EroareCerere"; }
}

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/* Tokenul ține o oră; îl păstrăm în memorie cât trăiește instanța, ca la
   TTLock. Nu se scrie în baza de date. */
let token: Token | null = null;
async function tokenOblio(): Promise<string> {
  if (!tokenValabil(token)) token = await obtineToken(fetch, CLIENT_ID, CLIENT_SECRET);
  return token!.valoare;
}
const oblio = async (metoda: "GET" | "POST" | "PUT", cale: string, corp?: unknown) =>
  cereOblio(fetch, await tokenOblio(), metoda, cale, corp);

async function setari(): Promise<SetariOblio & { activ: boolean }> {
  const { data, error } = await admin.from("app_state").select("value").eq("key", CHEIE_SETARI).maybeSingle();
  if (error) throw new Error(`Nu pot citi setările Oblio: ${error.message}`);
  const v = (data?.value || {}) as any;
  return {
    activ: v.activ === true,
    cif: String(v.cif || "").trim(),
    serie: String(v.serie || "").trim(),
    punctLucru: String(v.punctLucru || "Sediu"),
    trimiteEFactura: v.trimiteEFactura === true,
  };
}

async function cote(cif: string): Promise<CotaTva[]> {
  const d = await oblio("GET", `/nomenclature/vat_rates?cif=${encodeURIComponent(cif)}`);
  return (Array.isArray(d) ? d : []).map((c: any) => ({ name: String(c.name), percentage: Number(c.percentage), default: !!c.default }));
}

/* Factura + clientul + liniile, cu unitatea și categoria produsului, cum le
   vrea oblio.ts. Citirea e cu service_role: permisiunea s-a verificat deja
   pe JWT-ul omului, mai jos. */
async function citesteFactura(id: string) {
  const { data: factura, error } = await admin.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!factura) throw new EroareCerere("Factura nu există.", 404);
  const [client, linii] = await Promise.all([
    admin.from("billing_customers").select("*").eq("id", factura.billing_customer_id).maybeSingle(),
    admin.from("invoice_items").select("*, products(unit, category)").eq("invoice_id", id).order("sort_order"),
  ]);
  if (client.error) throw new Error(client.error.message);
  if (linii.error) throw new Error(linii.error.message);
  if (!client.data) throw new EroareCerere("Factura n-are client de facturare.");
  return {
    factura,
    client: client.data,
    linii: (linii.data || []).map((l: any) => ({ ...l, unit: l.products?.unit || "buc", category: l.products?.category || "" })),
  };
}

async function rpc(nume: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(nume, args);
  if (error) throw new EroareCerere(error.message, 409);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return raspunde(req, { ok: false, error: "Metodă nepermisă." }, 405);

  let corp: any;
  try { corp = await req.json(); } catch { return raspunde(req, { ok: false, error: "Corp invalid." }, 400); }
  const action = String(corp?.action || "");
  const permisiune = PERMISIUNI[action];
  if (!permisiune) return raspunde(req, { ok: false, error: `Acțiune necunoscută: ${action}` }, 400);

  // Cine cere: JWT-ul (Supabase l-a verificat deja), apoi rândul din staff.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return raspunde(req, { ok: false, error: "Neautentificat." }, 401);
  const { data: staff } = await admin.from("staff").select("user_id, role").eq("user_id", auth.user.id).maybeSingle();
  if (!staff) return raspunde(req, { ok: false, error: "Contul nu e în personal." }, 403);
  if (permisiune === "admin") {
    if (staff.role !== "admin") return raspunde(req, { ok: false, error: "Doar adminul poate verifica legătura cu Oblio." }, 403);
  } else {
    // Aceeași regulă ca în baza de date, evaluată pe JWT-ul omului.
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: are, error } = await userClient.rpc("has_billing_permission", { perm: permisiune });
    if (error || !are) return raspunde(req, { ok: false, error: "Nu ai permisiunea pentru această acțiune." }, 403);
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return raspunde(req, { ok: false, error: "Oblio nu e configurat: lipsesc OBLIO_CLIENT_ID / OBLIO_CLIENT_SECRET din secretele funcției." }, 503);
  }

  try {
    if (action === "verifica") {
      const cif = String(corp.cif || "").trim();
      const serie = String(corp.serie || "").trim();
      if (!cif) throw new EroareCerere("Lipsește CIF-ul.");
      const firme = await oblio("GET", "/nomenclature/companies");
      const fara = (s: string) => s.replace(/^RO/i, "").trim();
      const firma = (Array.isArray(firme) ? firme : []).find((f: any) => fara(String(f.cif || "")) === fara(cif));
      if (!firma) throw new EroareCerere(`CIF-ul ${cif} nu e printre firmele contului Oblio.`);
      const serii = await oblio("GET", `/nomenclature/series?cif=${encodeURIComponent(cif)}`);
      const listaSerii = (Array.isArray(serii) ? serii : [])
        .filter((s: any) => /factura/i.test(String(s.type || "")))
        .map((s: any) => ({ nume: String(s.name), urmatorul: s.next ?? null }));
      return raspunde(req, {
        ok: true,
        firma: String(firma.company || firma.name || cif),
        serii: listaSerii,
        seriaOk: !serie || listaSerii.some((s) => s.nume === serie),
        cote: await cote(cif),
      });
    }

    const s = await setari();
    if (!s.cif || !s.serie) throw new EroareCerere("Setările Oblio sunt incomplete: CIF-ul și seria.", 409);
    const invoiceId = String(corp.invoiceId || "");
    if (!invoiceId) throw new EroareCerere("Lipsește invoiceId.");

    if (action === "emite") {
      // Comutatorul oprește doar emiterea de facturi noi — un document deja
      // în Oblio (stornare, anulare, trimiterea în SPV) se rezolvă tot
      // acolo, indiferent de poziția lui (docs/oblio.md).
      if (!s.activ) throw new EroareCerere("Facturarea prin Oblio nu e pornită (Financiar → Oblio).", 409);
      // (a) blochează draftul și îi dă cheia; (b) cere Oblio; (c) scrie ce a
      // răspuns. Un eșec la (b) lasă draftul cu oblio_stare = 'eroare' și
      // mesajul lor — omul îl vede și reîncearcă, cu aceeași cheie, deci
      // Oblio nu emite de două ori.
      const blocata = await rpc("oblio_incepe_emiterea", { p_id: invoiceId });
      let rezultat: { serie: string; numar: string; link: string };
      try {
        const { factura, client, linii } = await citesteFactura(invoiceId);
        const payload = facturaOblio({ ...factura, oblio_cheie: blocata.oblio_cheie }, client, linii, s, await cote(s.cif), aziBucuresti());
        rezultat = raspunsEmitere(await oblio("POST", "/docs/invoice", payload));
      } catch (e) {
        // Eroarea originală trebuie să ajungă la om chiar dacă marcarea eșuează.
        try {
          await rpc("oblio_marcheaza_eroare", { p_id: invoiceId, p_mesaj: (e as Error).message });
        } catch (markErr) {
          console.error("oblio_marcheaza_eroare", (markErr as Error).message);
        }
        throw e;
      }
      let factura;
      try {
        factura = await rpc("oblio_finalizeaza_emiterea", {
          p_id: invoiceId, p_serie: rezultat.serie, p_numar: rezultat.numar, p_link: rezultat.link, p_de: auth.user.id,
        });
      } catch (e) {
        // Oblio a emis, noi n-am putut scrie: nu se ascunde și nu se repetă.
        throw new EroareCerere(`Oblio a emis ${rezultat.serie} ${rezultat.numar}, dar PMS-ul n-a putut-o înregistra: ${(e as Error).message}. Verifică în Oblio înainte de a reîncerca.`, 500);
      }
      if (s.trimiteEFactura) {
        try {
          const ef = await oblio("POST", "/docs/einvoice", { cif: s.cif, seriesName: rezultat.serie, number: rezultat.numar });
          factura = await rpc("oblio_actualizeaza_efactura", { p_id: invoiceId, p_cod: Number(ef?.code ?? -1) });
        } catch (e) {
          // Factura e emisă; SPV-ul se poate retrimite din fereastra ei.
          console.error("e-Factura", (e as Error).message);
        }
      }
      return raspunde(req, { ok: true, factura });
    }

    if (action === "storneaza") {
      const { factura, client, linii } = await citesteFactura(invoiceId);
      if (!["issued", "partially_paid", "paid"].includes(factura.status)) {
        throw new EroareCerere(`Factura este ${factura.status} — se pot storna doar facturi emise.`, 409);
      }
      if (factura.oblio_stare !== "emisa") throw new EroareCerere("Factura n-a fost emisă prin Oblio — stornarea ei merge pe drumul vechi.", 409);
      const payload = stornoOblio(factura, client, linii, s, await cote(s.cif), aziBucuresti());
      const rezultat = raspunsEmitere(await oblio("POST", "/docs/invoice", payload));
      const data = await rpc("oblio_finalizeaza_stornarea", {
        p_id: invoiceId, p_serie: rezultat.serie, p_numar: rezultat.numar, p_link: rezultat.link, p_de: auth.user.id,
      });
      return raspunde(req, { ok: true, ...data });
    }

    if (action === "anuleaza") {
      const { factura } = await citesteFactura(invoiceId);
      if (factura.status !== "issued" || Number(factura.paid_amount) !== 0) {
        throw new EroareCerere("O factură se poate anula doar din stadiul „emisă” și fără plăți înregistrate.", 409);
      }
      if (factura.oblio_stare !== "emisa") throw new EroareCerere("Factura n-a fost emisă prin Oblio — anularea ei merge pe drumul vechi.", 409);
      await oblio("PUT", "/docs/invoice/cancel", anulareOblio(factura, s));
      const data = await rpc("oblio_finalizeaza_anularea", { p_id: invoiceId });
      return raspunde(req, { ok: true, factura: data });
    }

    if (action === "efactura-trimite") {
      const { factura } = await citesteFactura(invoiceId);
      if (factura.oblio_stare !== "emisa") throw new EroareCerere("Factura n-a fost emisă prin Oblio.", 409);
      const ef = await oblio("POST", "/docs/einvoice", { cif: s.cif, seriesName: factura.series, number: factura.oblio_numar || String(factura.number) });
      const cod = Number(ef?.code ?? -1);
      const data = await rpc("oblio_actualizeaza_efactura", { p_id: invoiceId, p_cod: cod });
      return raspunde(req, { ok: true, factura: data, cod });
    }

    throw new EroareCerere(`Acțiune necunoscută: ${action}`);
  } catch (e) {
    const mesaj = (e as Error).message || "Oblio nu a răspuns.";
    console.error("oblio-facturare", action, mesaj);
    if (e instanceof EroareCerere) return raspunde(req, { ok: false, error: mesaj }, e.status);
    if (e instanceof EroareOblio) return raspunde(req, { ok: false, error: `Oblio: ${mesaj}` }, 502);
    return raspunde(req, { ok: false, error: mesaj }, 500);
  }
});
