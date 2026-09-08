// Creează o rezervare de pe site-ul public.
//
// POST /functions/v1/booking-create
//   { turnstileToken?, idempotencyKey, checkin, checkout, rooms, guest, notes? }
//
// DE CE EXISTĂ. Până acum browserul apela direct RPC-ul `create_public_booking`
// prin PostgREST. Două lucruri nu se pot face de acolo:
//
//   · verificarea Turnstile cere o cheie secretă și un apel HTTP către
//     Cloudflare — PostgREST nu face niciuna dintre ele;
//   · rezervarea trebuie să rămână „ținută" doar dacă emailul de
//     confirmare chiar a plecat, ceea ce se știe abia după trimitere.
//
// Validările NU s-au mutat aici. Rămân toate în funcția din bază, care e
// singura care scrie: datele, limitele, disponibilitatea, prețul. Aici e
// doar poarta.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipClient } from "../../../src/lib/ip.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
const EXPEDITOR = Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>";
const URL_REZERVARI = Deno.env.get("BOOKING_APP_URL") || "https://rezervari.lalivada.ro";
const TELEFON = Deno.env.get("PROPERTY_PHONE") || "";

/* Cât ține camera până la confirmare. Destul cât să deschizi emailul pe
   telefon, puțin cât să nu blocheze o cameră o după-amiază întreagă. */
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

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Plasă de siguranță pentru câmpuri lipsă: fără ea, `new Date(undefined)`
   scrie „Invalid Date" în mesajul care ajunge la oaspete — s-a întâmplat.
   Mai bine o liniuță, care se vede că e o scăpare, decât un text care pare
   o dată și nu e. */
const dataRo = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
};

const bani = (n: number) =>
  new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Number(n)) + " lei";

/* Verificarea Turnstile.
 *
 * Fără cheie secretă configurată, funcția lasă cererea să treacă. E o
 * alegere deliberată de punere în funcțiune: codul poate fi livrat înainte
 * ca cineva să creeze contul Cloudflare, fără ca rezervările să se
 * oprească între timp. Cât timp cheia lipsește, protecția nu există —
 * asta e starea, nu o iluzie de protecție. */
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
    /* Cloudflare căzut nu trebuie să oprească rezervările: pierdem
       protecția pentru cererea asta, dar oaspetele poate rezerva. */
    console.error("Turnstile nu a răspuns, las cererea să treacă", e);
    return true;
  }
}

/* Emailul prin care clientul confirmă. Tabele și stiluri inline, ca la
   celelalte: clienții de email nu suportă CSS modern. */
function sablonConfirmare(d: any, minute: number): string {
  const link = `${URL_REZERVARI}/?token=${encodeURIComponent(d.publicToken)}&confirma=1`;
  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f6f5;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1a1d1c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:520px;background:#ffffff;border:1px solid #dde3e0;border-radius:10px;">
    <tr><td style="padding:26px 26px 8px;">
      <div style="font-size:13px;color:#5f6a66;letter-spacing:.04em;text-transform:uppercase;">Complex La Livada</div>
      <h1 style="margin:8px 0 4px;font-size:21px;font-weight:650;">Mai e un pas</h1>
      <p style="margin:0;color:#5f6a66;font-size:14px;">
        ${esc(d.guestName)}, îți ținem camera ${minute} de minute. Apasă butonul
        de mai jos ca rezervarea să devină fermă.</p>
    </td></tr>

    <tr><td style="padding:20px 26px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;">
        <tr><td style="padding:5px 0;color:#5f6a66;">Sosire</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${dataRo(d.checkIn)}, de la ora 14</td></tr>
        <tr><td style="padding:5px 0;color:#5f6a66;">Plecare</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${dataRo(d.checkOut)}, până la ora 11:30</td></tr>
        <tr><td style="padding:5px 0;color:#5f6a66;">Camere</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${d.rooms}</td></tr>
        <tr><td colspan="2" style="border-top:1px solid #dde3e0;padding-top:10px;"></td></tr>
        <tr><td style="padding:2px 0;font-weight:650;">Total</td>
            <td style="padding:2px 0;text-align:right;font-weight:700;font-size:17px;">${bani(d.total)}</td></tr>
      </table>
      <p style="margin:10px 0 0;font-size:13px;color:#5f6a66;">
        Plata se face la sosire. Nu am reținut niciun card.</p>
    </td></tr>

    <tr><td style="padding:22px 26px 6px;">
      <a href="${link}"
         style="display:block;text-align:center;background:#2f6b53;color:#ffffff;
                text-decoration:none;font-weight:600;padding:13px 20px;border-radius:8px;">
        Confirmă rezervarea</a>
      <p style="margin:10px 0 0;font-size:12.5px;color:#8a938f;text-align:center;">
        Dacă nu confirmi în ${minute} de minute, camera se eliberează singură
        și poți relua căutarea oricând.</p>
    </td></tr>

    <tr><td style="padding:14px 26px 26px;border-top:1px solid #eef1f0;">
      <p style="margin:16px 0 0;font-size:13px;color:#5f6a66;">
        Nu tu ai cerut rezervarea? Ignoră mesajul — fără confirmare nu se
        întâmplă nimic.${TELEFON ? ` Întrebări: ${esc(TELEFON)}.` : ""}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function textConfirmare(d: any, minute: number): string {
  return [
    `Complex La Livada — mai e un pas.`,
    ``,
    `${d.guestName}, îți ținem camera ${minute} de minute.`,
    `Confirmă aici: ${URL_REZERVARI}/?token=${d.publicToken}&confirma=1`,
    ``,
    `Sosire:  ${dataRo(d.checkIn)}, de la ora 14`,
    `Plecare: ${dataRo(d.checkOut)}, până la ora 11:30`,
    `Camere:  ${d.rooms}`,
    `Total:   ${bani(d.total)} (plata la sosire)`,
    ``,
    `Fără confirmare, camera se eliberează singură.`,
    `Nu tu ai cerut rezervarea? Ignoră mesajul.`,
    TELEFON ? `Întrebări: ${TELEFON}.` : ``,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

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

  /* Fără serviciu de email nu se poate confirma nimic, deci nici nu ținem
     camera: rezervarea intră fermă, ca înainte. Altfel fiecare rezervare
     ar expira și site-ul ar părea că funcționează fără să rezerve nimic.
     În clipa în care RESEND_API_KEY e setată, confirmarea se activează
     singură — nu mai e nimic de schimbat în cod. */
  const cuConfirmare = Boolean(RESEND_API_KEY);

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
    p_hold_minutes: cuConfirmare ? MINUTE_HOLD : 0,
    p_client_ip: ip,
  });

  if (error) {
    /* Mesajele funcției din bază sunt scrise pentru oaspete, nu pentru
       programator — le dăm mai departe așa cum sunt. Codul de eroare
       merge și el, ca interfața să deosebească „s-a ocupat camera" de o
       defecțiune. */
    return raspuns({ error: error.message, code: (error as any).code }, 400);
  }

  const rezervare = { ...data, guestName: `${g.prenume || ""} ${g.nume || ""}`.trim() };

  if (data?.status !== "pending") return raspuns(rezervare);

  /* Datele pentru email se citesc din bază, nu din cererea primită.
     `create_public_booking` întoarce doar numărul, tokenul, totalul și
     camerele — nu și perioada. Șablonul cerea `checkIn`/`checkOut`, primea
     `undefined`, iar în mesaj apărea „Invalid Date". Funcția de mai jos
     există deja pentru celălalt email și întoarce exact ce trebuie.
     În plus, e singura variantă corectă pe drumul idempotent: acolo
     rezervarea a fost creată de o cerere anterioară, iar perioada care
     contează e cea din bază, nu cea trimisă acum. */
  const { data: detalii } = await admin.rpc("booking_email_payload", {
    p_token: data.publicToken,
  });
  const pentruEmail = { ...rezervare, ...(detalii || {}) };

  // Rezervarea e ținută: trimitem emailul prin care devine fermă.
  let trimis = false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EXPEDITOR,
        to: [g.email],
        subject: `Confirmă rezervarea ${data.confirmationNumber} · Complex La Livada`,
        html: sablonConfirmare(pentruEmail, MINUTE_HOLD),
        text: textConfirmare(pentruEmail, MINUTE_HOLD),
      }),
    });
    trimis = r.ok;
    if (!r.ok) console.error("Emailul de confirmare a eșuat", r.status,
      (await r.text().catch(() => "")).slice(0, 300));
  } catch (e) {
    console.error("Serviciul de email nu a răspuns", e);
  }

  if (trimis) return raspuns({ ...rezervare, emailTrimis: true });

  /* Emailul n-a plecat. Rezervarea NU are voie să rămână atârnată de un
     mesaj care nu va veni niciodată: o facem fermă pe loc, adică exact
     comportamentul dinainte de confirmare. Oaspetele are numărul pe
     ecran, recepția are rezervarea în PMS. */
  const { data: fermă } = await admin.rpc("confirm_public_booking", {
    p_token: data.publicToken,
  });
  console.warn("Confirmarea pe email a eșuat — rezervarea a fost făcută fermă direct.",
    data.confirmationNumber);
  return raspuns({
    ...rezervare,
    status: fermă?.status === "confirmed" ? "confirmed" : rezervare.status,
    holdExpiresAt: null,
    emailTrimis: false,
  });
});
