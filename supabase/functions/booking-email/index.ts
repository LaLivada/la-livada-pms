// Trimite emailul de confirmare pentru o rezervare făcută pe site.
//
// POST /functions/v1/booking-email   { "token": "<public_token>" }
//
// Se apelează DUPĂ ce rezervarea a fost creată (deci după COMMIT). Un
// email care eșuează nu anulează rezervarea — clientul are oricum numărul
// de confirmare pe ecran și linkul de revenire.
//
// Nu primește niciun conținut de la client: cu tokenul, citește singură
// datele din bază. Altfel oricine ar putea trimite emailuri cu text
// arbitrar de pe adresa pensiunii.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EXPEDITOR = Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>";
const URL_REZERVARI = Deno.env.get("BOOKING_APP_URL") || "https://rezervari.lalivada.ro";
const TELEFON = Deno.env.get("PROPERTY_PHONE") || "";

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

const dataRo = (iso: string) =>
  new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });

const bani = (n: number) =>
  new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Number(n)) + " lei";

/* HTML de email: tabele și stiluri inline, fără flexbox și fără clase.
   Clienții de email (Outlook mai ales) nu suportă CSS modern. */
function sablon(d: any): string {
  const linkRezervare = `${URL_REZERVARI}/?token=${encodeURIComponent(d.publicToken)}`;
  // Linkul de anulare NU anulează la deschidere: duce la o pagină de
  // confirmare. Multe clienți de email preîncarcă linkurile din mesaj —
  // un GET care anulează ar șterge rezervări de unul singur.
  const linkAnulare = `${linkRezervare}&anulare=1`;

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
      <h1 style="margin:8px 0 4px;font-size:21px;font-weight:650;">Rezervarea ta e înregistrată</h1>
      <p style="margin:0;color:#5f6a66;font-size:14px;">Te așteptăm, ${esc(d.guestName)}.</p>
    </td></tr>

    <tr><td style="padding:16px 26px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#f5f7f6;border-radius:8px;">
        <tr><td style="padding:16px;text-align:center;">
          <div style="font-size:12px;color:#5f6a66;">Număr de confirmare</div>
          <div style="font-size:24px;font-weight:700;letter-spacing:.05em;margin-top:4px;">
            ${esc(d.confirmationNumber)}</div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 26px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;">
        <tr><td style="padding:5px 0;color:#5f6a66;">Sosire</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${dataRo(d.checkIn)}, de la ora 14</td></tr>
        <tr><td style="padding:5px 0;color:#5f6a66;">Plecare</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${dataRo(d.checkOut)}, până la ora 11</td></tr>
        <tr><td style="padding:5px 0;color:#5f6a66;">Nopți</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${d.nights}</td></tr>
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
      <a href="${linkRezervare}"
         style="display:block;text-align:center;background:#2f6b53;color:#ffffff;
                text-decoration:none;font-weight:600;padding:13px 20px;border-radius:8px;">
        Vezi rezervarea</a>
    </td></tr>

    <tr><td style="padding:8px 26px 22px;">
      <a href="${linkAnulare}"
         style="display:block;text-align:center;background:#ffffff;color:#a33a2f;
                text-decoration:none;font-weight:600;padding:12px 20px;
                border:1px solid #e6c4bf;border-radius:8px;">
        Anulează rezervarea</a>
      <p style="margin:10px 0 0;font-size:12.5px;color:#8a938f;text-align:center;">
        Anularea e gratuită până în ziua sosirii. Butonul deschide o pagină
        unde confirmi — nu se anulează nimic din greșeală.</p>
    </td></tr>

    <tr><td style="padding:0 26px 26px;border-top:1px solid #eef1f0;">
      <p style="margin:16px 0 0;font-size:13px;color:#5f6a66;">
        Te contactăm telefonic pentru confirmare.${
          TELEFON ? ` Dacă ai întrebări, sună-ne la ${esc(TELEFON)}.` : ""
        }</p>
    </td></tr>
  </table>
  <p style="max-width:520px;margin:14px auto 0;font-size:11.5px;color:#8a938f;text-align:center;">
    Ai primit acest mesaj pentru că ai făcut o rezervare pe lalivada.ro.</p>
</td></tr></table></body></html>`;
}

function textSimplu(d: any): string {
  return [
    `Rezervarea ta la Complex La Livada e înregistrată.`,
    ``,
    `Număr de confirmare: ${d.confirmationNumber}`,
    `Sosire:  ${dataRo(d.checkIn)}, de la ora 14`,
    `Plecare: ${dataRo(d.checkOut)}, până la ora 11`,
    `Nopți:   ${d.nights}`,
    `Camere:  ${d.rooms}`,
    `Total:   ${bani(d.total)} (plata la sosire)`,
    ``,
    `Vezi rezervarea:  ${URL_REZERVARI}/?token=${d.publicToken}`,
    `Anulează:         ${URL_REZERVARI}/?token=${d.publicToken}&anulare=1`,
    ``,
    `Anularea e gratuită până în ziua sosirii.`,
    TELEFON ? `Întrebări? Sună-ne la ${TELEFON}.` : ``,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  let token = "";
  try {
    const body = await req.json();
    token = String(body?.token || "");
  } catch {
    return raspuns({ error: "Corp de cerere invalid." }, 400);
  }
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return raspuns({ error: "Token invalid." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.rpc("booking_email_payload", { p_token: token });
  if (error) {
    console.error("Nu am putut citi rezervarea", error);
    return raspuns({ error: "Nu am putut citi rezervarea." }, 500);
  }
  if (!data) return raspuns({ error: "Rezervarea nu a fost găsită." }, 404);

  // Fără adresă de email nu e nimic de trimis — nu e o eroare, clientul
  // a ales să nu o dea.
  if (!data.email) return raspuns({ sent: false, reason: "fara-email" });

  // O singură trimitere per rezervare: altfel cineva care are tokenul ar
  // putea cere emailul la nesfârșit.
  if (data.alreadySent) return raspuns({ sent: false, reason: "deja-trimis" });

  if (!RESEND_API_KEY) {
    // Funcția e deployată dar neconfigurată. Nu e o eroare de rezervare —
    // o semnalăm clar în loguri și mergem mai departe.
    console.warn("RESEND_API_KEY nu e setată — emailul nu a fost trimis.");
    return raspuns({ sent: false, reason: "neconfigurat" });
  }

  let trimitere: Response;
  try {
    trimitere = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EXPEDITOR,
        to: [data.email],
        subject: `Rezervarea ${data.confirmationNumber} · Complex La Livada`,
        html: sablon(data),
        text: textSimplu(data),
      }),
    });
  } catch (e) {
    console.error("Serviciul de email nu a răspuns", e);
    return raspuns({ sent: false, reason: "retea" }, 502);
  }

  if (!trimitere.ok) {
    const detaliu = await trimitere.text().catch(() => "");
    console.error("Trimiterea a eșuat", trimitere.status, detaliu.slice(0, 300));
    return raspuns({ sent: false, reason: "esuat", status: trimitere.status }, 502);
  }

  await admin.rpc("mark_booking_email_sent", { p_token: token });
  return raspuns({ sent: true });
});
