// Pornește plata cu cardul pentru o rezervare nouă de pe site.
//
// POST /functions/v1/netopia-start
//   { turnstileToken?, idempotencyKey, checkin, checkout, rooms, guest, notes? }
//
// Creează rezervarea EXACT ca booking-create (aceeași funcție din bază,
// aceleași validări și plafoane), dar NU o confirmă niciodată aici — spre
// deosebire de cash/transfer, unde emailul de confirmare o face fermă,
// cardul o ține până vine IPN-ul de plată (netopia-ipn). Formularul de
// card nu există pe pagina noastră: browserul primește un plic criptat și
// îl trimite direct către pagina găzduită NETOPIA — vezi docs/netopia-plan.md
// pentru de ce (API v1, nu v2; redirect, nu iframe).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipClient } from "../../../src/lib/ip.js";
import { construiesteXmlPlata, cripteazaPentruNetopia } from "../../../src/lib/netopia.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
const URL_REZERVARI = Deno.env.get("BOOKING_APP_URL") || "https://rezervari.lalivada.ro";

const NETOPIA_SIGNATURE = Deno.env.get("NETOPIA_SIGNATURE") || "";
const NETOPIA_PUBLIC_CERT = Deno.env.get("NETOPIA_PUBLIC_CERT") || "";
const NETOPIA_LIVE = Deno.env.get("NETOPIA_LIVE") === "true";
const NETOPIA_URL = NETOPIA_LIVE
  ? "https://secure.mobilpay.ro"
  : "https://sandboxsecure.mobilpay.ro";

/* Camera se ține până la plată exact cât la cash/transfer — destul cât să
   nu se blocheze o cameră o după-amiază întreagă dacă oaspetele abandonează
   pagina NETOPIA. */
const MINUTE_HOLD = Number(Deno.env.get("BOOKING_HOLD_MINUTES") || "30");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function raspuns(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/* Copia turnstileTrecut din booking-create/index.ts — Deno nu importă de
   acolo (fiecare funcție edge e propriul ei bundle). Dacă schimbi
   verificarea, schimb-o în amândouă. */
async function turnstileTrecut(token: string | undefined, ip: string | null): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const corp = new FormData();
    corp.append("secret", TURNSTILE_SECRET);
    corp.append("response", token);
    if (ip) corp.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: corp });
    const d = await r.json();
    if (!d.success) console.warn("Turnstile a respins cererea", d["error-codes"]);
    return d.success === true;
  } catch (e) {
    console.error("Turnstile nu a răspuns, las cererea să treacă", e);
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  if (!NETOPIA_SIGNATURE || !NETOPIA_PUBLIC_CERT) {
    console.error("NETOPIA_SIGNATURE sau NETOPIA_PUBLIC_CERT nu sunt setate.");
    return raspuns({ error: "Plata cu cardul nu e încă disponibilă. Alege cash sau transfer bancar." }, 503);
  }

  let c: any;
  try {
    c = await req.json();
  } catch {
    return raspuns({ error: "Corp de cerere invalid." }, 400);
  }

  const ip = ipClient(req);

  if (!(await turnstileTrecut(c?.turnstileToken, ip))) {
    return raspuns({ error: "Nu am putut confirma că cererea vine de la o persoană. Reîncarcă pagina și încearcă din nou." }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const g = c?.guest || {};
  const { data, error } = await admin.rpc("create_public_booking", {
    p_idempotency_key: c?.idempotencyKey,
    p_checkin: c?.checkin,
    p_checkout: c?.checkout,
    p_last_name: g.nume,
    p_first_name: g.prenume,
    p_phone: g.telefon,
    p_email: g.email || null,
    p_city: g.oras,
    p_county: g.judet,
    p_country: g.tara,
    p_rooms: c?.rooms,
    p_notes: c?.notes || null,
    // Mereu ținută, indiferent de RESEND_API_KEY: aici confirmarea vine
    // din plată, nu din email.
    p_hold_minutes: MINUTE_HOLD,
    p_client_ip: ip,
    p_metoda_plata: "card",
    p_plata_status: "asteapta",
  });

  if (error) {
    return raspuns({ error: error.message, code: (error as any).code }, 400);
  }

  const rezervare = { ...data, guestName: `${g.prenume || ""} ${g.nume || ""}`.trim() };

  /* Repetare a unei rezervări deja confirmate/anulate/expirate (aceeași
     cheie de idempotență trimisă a doua oară) — nu mai are sens un nou
     plic de plată. Frontend-ul citește status-ul și decide ce arată. */
  if (data?.status !== "pending") return raspuns(rezervare);

  const xml = construiesteXmlPlata({
    orderId: data.publicToken,
    semnatura: NETOPIA_SIGNATURE,
    suma: data.total,
    descriere: `Cazare Complex La Livadă — ${data.confirmationNumber}`,
    notifyUrl: `${SUPABASE_URL}/functions/v1/netopia-ipn`,
    returnUrl: `${URL_REZERVARI}/?token=${data.publicToken}`,
    client: { email: g.email || "", telefon: g.telefon || "", prenume: g.prenume || "", nume: g.nume || "" },
  });
  const plic = cripteazaPentruNetopia(xml, NETOPIA_PUBLIC_CERT);

  return raspuns({
    ...rezervare,
    plata: { url: NETOPIA_URL, envKey: plic.envKey, data: plic.data, cipher: plic.cipher, iv: plic.iv },
  });
});
