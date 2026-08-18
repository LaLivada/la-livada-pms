// Cauta datele unei firme la ANAF dupa CUI, ca sa nu mai fie introduse
// manual la crearea unui client de facturare tip firma (denumire, nr.
// Reg. Comertului, adresa sediului social).
//
// GET https://<project>.supabase.co/functions/v1/anaf-lookup?cui=12345678
//
// Spre deosebire de ical-feed, foloseste autentificarea Supabase standard
// (JWT-ul userului logat, trimis automat de supabase-js) — nu se
// deployeaza cu --no-verify-jwt, doar userii din aplicatie pot folosi
// acest proxy catre serviciul public ANAF.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANAF_URL = "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v9/ws/tva";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Apelat din browser cu headere custom (Authorization, apikey) — browserul
// trimite intai un preflight OPTIONS. Fara aceste headere CORS, preflight-ul
// esueaza si fetch()-ul din pagina nu ajunge niciodata la functie — apare
// ca "Failed to fetch" in consola, fara niciun raspuns HTTP vizibil.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonResponse({ error: "Metodă nepermisă." }, 405);

  // Un JWT valid înseamnă doar "user logat în aplicație" — dar preluarea
  // ANAF ține de fluxul de facturare, deci verificăm și permisiunea
  // specifică (aceeași folosită la crearea unui client de facturare),
  // nu doar autentificarea, ca să fie consecvent cu restul modulului.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: allowed, error: permErr } = await userClient.rpc("has_billing_permission", { perm: "create_invoice" });
  if (permErr || !allowed) {
    return jsonResponse({ error: "Nu ai permisiunea de a prelua date de facturare." }, 403);
  }

  const url = new URL(req.url);
  const cuiRaw = (url.searchParams.get("cui") || "").toUpperCase().replace(/^RO/, "").trim();
  if (!/^\d{2,10}$/.test(cuiRaw)) {
    return jsonResponse({ error: "CUI invalid — trebuie să conțină doar cifre." }, 400);
  }
  const cui = Number(cuiRaw);

  let anafRes: Response;
  try {
    anafRes = await fetch(ANAF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui, data: todayISO() }]),
    });
  } catch {
    return jsonResponse({ error: "Nu am putut contacta serviciul ANAF. Încearcă din nou." }, 502);
  }
  if (!anafRes.ok) {
    return jsonResponse({ error: "Serviciul ANAF nu a răspuns corect." }, 502);
  }

  let data: any;
  try {
    data = await anafRes.json();
  } catch {
    return jsonResponse({ error: "Răspuns ANAF invalid." }, 502);
  }

  const found = (data?.found || [])[0];
  if (!found) {
    return jsonResponse({ error: "Nu am găsit nicio firmă cu acest CUI la ANAF." }, 404);
  }

  const g = found.date_generale || {};
  // Adresa sediului social e structurata (strada/numar/localitate/judet) —
  // mult mai utila decat "adresa" din date_generale, care e un singur
  // string liber. Cadem pe acesta doar daca sediul social lipseste.
  const sediu = found.adresa_sediu_social || {};
  const strada = [sediu.sdenumire_Strada, sediu.snumar_Strada].filter(Boolean).join(" nr. ");
  const address = strada || g.adresa || "";
  const city = sediu.sdenumire_Localitate || "";
  const county = sediu.sdenumire_Judet || "";
  const postalCode = sediu.scod_Postal || g.codPostal || "";

  return jsonResponse({
    cui: String(g.cui ?? cui),
    denumire: g.denumire || "",
    regCom: g.nrRegCom || "",
    address,
    city,
    county,
    postalCode,
    telefon: g.telefon || "",
  });
});
