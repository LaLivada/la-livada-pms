// Trimite un email intern când o rezervare plătită cu cardul e anulată,
// ca Ovidiu să știe să facă rambursarea manual din contul NETOPIA — API-ul
// lor de refund pentru cardul online nu e încă lansat (docs/netopia-plan.md).
//
// POST /functions/v1/netopia-refund-notice   { "token": "<public_token>" }
//
// Se apelează DUPĂ ce anularea a reușit (cancel_public_booking), din
// interfață — la fel ca trimiteEmailConfirmare. Un eșec aici nu anulează
// nimic: rezervarea e deja anulată, doar avizul de rambursare ar lipsi.
//
// Nu primește niciun conținut de la client: citește singură datele după
// token, ca la booking-email.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EXPEDITOR = Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>";
const CATRE = Deno.env.get("NETOPIA_REFUND_EMAIL_CATRE") || "office@lalivada.com";

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
/* Aici, spre deosebire de restul afișărilor de bani din aplicație, suma se
   dă cu bani: cifra din acest email o tastează un om, cu mâna, în formularul
   de rambursare NETOPIA. Rotunjită la leu, o rambursare de 450,50 ar pleca
   ca 451. */
const bani = (n: number) =>
  new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(Number(n)) + " lei";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  let corp: any;
  try {
    corp = await req.json();
  } catch {
    return raspuns({ error: "Corp de cerere invalid." }, 400);
  }
  const token = corp?.token;
  if (!token) return raspuns({ error: "Lipsește tokenul." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: d, error } = await admin.rpc("booking_refund_payload", { p_token: token });
  if (error) {
    console.error("netopia-refund-notice: nu am putut citi datele", error);
    return raspuns({ error: "Nu am putut citi datele rezervării." }, 500);
  }
  if (!d) return raspuns({ ok: true, notice: false });

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY nu e setată — avizul de rambursare nu a plecat.", d.confirmationNumber);
    return raspuns({ ok: true, notice: false });
  }

  /* `status` spune CINE a pierdut camera, iar de asta depinde cât se
     rambursează — booking_refund_payload a calculat deja suma, aici doar
     numim regula corect:
       · 'expired' — plata a reușit după ce holdul expirase singur; oaspetele
         nu a ales nimic, deci se întoarce tot;
       · 'cancelled' — anulare cerută, se aplică politica publicată și prima
         noapte se reține.
     Textul e unul singur, folosit și ca `text` și, escapat, în `html`. */
  const expirat = d.status === "expired";
  const corpEmail = [
    `Rezervarea ${d.confirmationNumber} (${esc(d.guestName)}) a fost anulată.`,
    `Plătită cu cardul — de rambursat manual din contul NETOPIA:`,
    ``,
    `Suma plătită: ${bani(d.sumaPlatita)}`,
    expirat
      ? `De rambursat (integral — camera s-a eliberat înainte ca plata să fie confirmată): ${bani(d.refundSuggerat)}`
      : `De rambursat (minus prima noapte, conform politicii): ${bani(d.refundSuggerat)}`,
    `Identificator NETOPIA (ntpID): ${d.netopiaNtpId || "—"}`,
  ].join("\n");

  let trimis = false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EXPEDITOR,
        to: [CATRE],
        subject: `De rambursat: ${d.confirmationNumber} · ${bani(d.refundSuggerat)}`,
        text: corpEmail,
        html: `<pre style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;white-space:pre-wrap;">${esc(corpEmail)}</pre>`,
      }),
    });
    trimis = r.ok;
    if (!r.ok) console.error("netopia-refund-notice: trimiterea a eșuat", r.status,
      (await r.text().catch(() => "")).slice(0, 300));
  } catch (e) {
    console.error("netopia-refund-notice: serviciul de email nu a răspuns", e);
  }

  return raspuns({ ok: true, notice: trimis });
});
