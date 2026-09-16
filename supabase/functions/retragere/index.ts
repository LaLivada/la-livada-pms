// Primește o cerere de retragere din contract trimisă din formularul de pe
// rezervari.lalivada.ro/retragere/ (art. 11^1 din OUG 34/2014).
//
// POST /functions/v1/retragere
//   { "nume", "email", "rezervare"?, "sosire"?, "mesaj", "website"? }
//
// Ordinea contează: întâi scrie cererea în public.cereri_retragere, abia apoi
// trimite emailurile. Dacă serviciul de email cade, cererea există și tot
// răspundem 200 — omul și-a exercitat dreptul în clipa în care a apăsat
// „Trimite”, nu când a ajuns emailul la recepție.
//
// `website` e câmpul-capcană din formular: e ascuns, un om nu-l vede, un
// robot îl completează. Când e plin răspundem 200 fără să facem nimic, ca
// robotul să nu afle că a fost prins.
//
// Validarea e copia celei din src/lib/retragere.js — Deno nu importă de
// acolo. Dacă schimbi o limită, schimb-o în amândouă.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EXPEDITOR = Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>";
const CATRE = Deno.env.get("RETRAGERE_EMAIL_CATRE") || "office@lalivada.com";
const URL_REZERVARI = Deno.env.get("BOOKING_APP_URL") || "https://rezervari.lalivada.ro";

/* Cel mult atâtea cereri de pe aceeași adresă de email într-o oră. Un om
   trimite una, poate două; mai multe sunt un script. */
const MAX_PE_ORA = 5;

const LIMITE = { nume: { min: 2, max: 120 }, email: { max: 200 }, rezervare: { max: 40 }, mesaj: { max: 2000 } };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

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

const curat = (v: unknown) => String(v ?? "").trim();
const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dataRo = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });

type Cerere = { nume: string; email: string; rezervare: string; sosire: string; mesaj: string };

function valideaza(c: Record<string, unknown>): { erori: Record<string, string>; date: Cerere } {
  const date: Cerere = {
    nume: curat(c.nume).replace(/\s+/g, " "),
    email: curat(c.email).toLowerCase(),
    rezervare: curat(c.rezervare).toUpperCase(),
    sosire: curat(c.sosire),
    mesaj: curat(c.mesaj),
  };
  const erori: Record<string, string> = {};
  if (date.nume.length < LIMITE.nume.min) erori.nume = "Scrie numele tău.";
  else if (date.nume.length > LIMITE.nume.max) erori.nume = "Numele e prea lung.";
  if (!date.email) erori.email = "Scrie adresa de email, ca să-ți putem răspunde.";
  else if (date.email.length > LIMITE.email.max || !EMAIL.test(date.email)) erori.email = "Adresa de email nu pare corectă.";
  if (date.rezervare.length > LIMITE.rezervare.max) erori.rezervare = "Numărul rezervării e prea lung.";
  if (date.sosire && (!DATA_ISO.test(date.sosire) || Number.isNaN(Date.parse(date.sosire)))) erori.sosire = "Data sosirii nu pare corectă.";
  if (!date.mesaj) erori.mesaj = "Scrie ce rezervare vrei să anulezi.";
  else if (date.mesaj.length > LIMITE.mesaj.max) erori.mesaj = "Mesajul e prea lung.";
  return { erori, date };
}

/* Rândurile cererii, la fel în emailul către recepție și în copia clientului. */
function randuri(d: Cerere, id: number): string {
  const r = (eticheta: string, valoare: string) =>
    `<tr><td style="padding:5px 12px 5px 0;color:#5f6a66;vertical-align:top;white-space:nowrap;">${eticheta}</td>` +
    `<td style="padding:5px 0;">${valoare}</td></tr>`;
  return [
    r("Cerere", `#${id}`),
    r("Nume", esc(d.nume)),
    r("Email", `<a href="mailto:${esc(d.email)}" style="color:#2f6b53;">${esc(d.email)}</a>`),
    d.rezervare ? r("Rezervare", esc(d.rezervare)) : "",
    d.sosire ? r("Sosire", dataRo(d.sosire)) : "",
    r("Mesaj", esc(d.mesaj).replace(/\n/g, "<br>")),
  ].join("");
}

function sablon(titlu: string, intro: string, d: Cerere, id: number, final: string): string {
  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f6f5;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1a1d1c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:520px;background:#ffffff;border:1px solid #dde3e0;border-radius:10px;">
    <tr><td style="padding:26px 26px 8px;">
      <div style="font-size:13px;color:#5f6a66;letter-spacing:.04em;text-transform:uppercase;">Complex La Livada</div>
      <h1 style="margin:8px 0 4px;font-size:21px;font-weight:650;">${titlu}</h1>
      <p style="margin:0;color:#5f6a66;font-size:14px;">${intro}</p>
    </td></tr>
    <tr><td style="padding:12px 26px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;">${randuri(d, id)}</table>
    </td></tr>
    <tr><td style="padding:18px 26px 26px;">
      <p style="margin:0;font-size:13px;color:#5f6a66;">${final}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function textSimplu(d: Cerere, id: number): string {
  return [
    `Cerere #${id}`,
    `Nume: ${d.nume}`,
    `Email: ${d.email}`,
    d.rezervare ? `Rezervare: ${d.rezervare}` : "",
    d.sosire ? `Sosire: ${dataRo(d.sosire)}` : "",
    ``,
    d.mesaj,
  ].filter((l, i) => l !== "" || i === 5).join("\n");
}

async function trimite(mesaj: Record<string, unknown>): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EXPEDITOR, ...mesaj }),
  });
  if (!r.ok) {
    const detaliu = await r.text().catch(() => "");
    console.error("Trimiterea a eșuat", r.status, detaliu.slice(0, 300));
  }
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  let corp: Record<string, unknown>;
  try {
    corp = await req.json();
    if (!corp || typeof corp !== "object") throw new Error();
  } catch {
    return raspuns({ error: "Corp de cerere invalid." }, 400);
  }

  if (curat(corp.website)) return raspuns({ ok: true });

  const { erori, date } = valideaza(corp);
  if (Object.keys(erori).length) return raspuns({ error: "Câmpuri greșite.", erori }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const deAcumOOra = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: eNumar } = await admin
    .from("cereri_retragere")
    .select("id", { count: "exact", head: true })
    .eq("email", date.email)
    .gte("creat_la", deAcumOOra);
  if (eNumar) {
    console.error("Nu am putut număra cererile", eNumar);
    return raspuns({ error: "Nu am putut înregistra cererea. Încearcă din nou." }, 500);
  }
  if ((count ?? 0) >= MAX_PE_ORA) {
    return raspuns({ error: "Am primit deja mai multe cereri de pe adresa asta. Sună-ne dacă e urgent." }, 429);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { data: rand, error: eScriere } = await admin
    .from("cereri_retragere")
    .insert({ ...date, rezervare: date.rezervare || null, sosire: date.sosire || null, ip })
    .select("id")
    .single();
  if (eScriere || !rand) {
    console.error("Nu am putut scrie cererea", eScriere);
    return raspuns({ error: "Nu am putut înregistra cererea. Încearcă din nou." }, 500);
  }
  const id = Number(rand.id);

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY nu e setată — cererea e scrisă, emailurile nu au plecat.");
    return raspuns({ ok: true, id, email: false });
  }

  let trimis = false;
  try {
    trimis = await trimite({
      to: [CATRE],
      reply_to: date.email,
      subject: `Cerere de retragere #${id}${date.rezervare ? ` · ${date.rezervare}` : ""}`,
      html: sablon("Cerere de retragere din contract", `Trimisă din ${URL_REZERVARI}/retragere/.`, date, id,
        `Răspunde direct la acest email ca să-i scrii clientului. Politica de anulare: ${URL_REZERVARI}/anulare/`),
      text: textSimplu(date, id),
    });
    await trimite({
      to: [date.email],
      subject: `Am primit cererea ta de retragere · Complex La Livada`,
      html: sablon("Am primit cererea ta", `Mulțumim, ${esc(date.nume)}. Iată ce ne-ai trimis:`, date, id,
        `Îți răspundem pe email în cel mult 14 zile, de obicei mult mai repede. ` +
        `Conform <a href="${URL_REZERVARI}/anulare/" style="color:#2f6b53;">politicii de anulare</a>, ` +
        `la anularea unei rezervări se încasează integral prima noapte de cazare.`),
      text: `Am primit cererea ta de retragere. Îți răspundem pe email în cel mult 14 zile.\n\n${textSimplu(date, id)}\n\nPolitica de anulare: ${URL_REZERVARI}/anulare/`,
    });
  } catch (e) {
    console.error("Serviciul de email nu a răspuns", e);
  }

  if (trimis) await admin.from("cereri_retragere").update({ email_trimis: true }).eq("id", id);
  return raspuns({ ok: true, id, email: trimis });
});
