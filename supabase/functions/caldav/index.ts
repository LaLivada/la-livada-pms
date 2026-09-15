// Serverul CalDAV al PMS-ului — sălile de evenimente (15 septembrie 2026).
//
// Telefonul/Mac-ul adaugă un cont CalDAV cu:
//   server:     https://<project>.supabase.co/functions/v1/caldav/principals/<utilizator>/
//   utilizator: emailul de login din PMS
//   parolă:     cea generată din „Contul tău" (se ține doar hash-ul ei,
//               în caldav_conturi; PMS-ul n-o vede niciodată după generare)
//
// Protocolul e în servitor.ts (testat din vitest); aici sunt doar
// autentificarea Basic, depozitul pe Supabase și importul de fișiere .ics
// din PMS (POST /import/<slug>, cu JWT-ul userului, doar admin).
//
// Trebuie deployată cu verify_jwt = false: clienții CalDAV nu au JWT
// Supabase, trimit Authorization: Basic. Validarea e făcută aici.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adreseDinCale, serveste, type Calendar, type Cont, type Depozit, type FiltruObiecte, type Obiect } from "./servitor.ts";
import { imparteInObiecte, rezumaObiect, type RezumatObiect } from "./ics.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REALM = 'Basic realm="La Livada PMS", charset="UTF-8"';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/* ---------- depozitul pe Supabase ---------- */

const COLOANE_OBIECT = "id, calendar_id, href, uid, etag, ics, sters, sync_seq, actualizat_la, incepe, se_termina, recurent";

function calendarDinRand(r: any): Calendar {
  return { id: r.id, slug: r.slug, nume: r.nume, culoare: r.culoare ?? null, ordine: Number(r.ordine ?? 0), ctag: Number(r.ctag ?? 1) };
}

function obiectDinRand(r: any): Obiect {
  return {
    id: r.id, calendarId: r.calendar_id, href: r.href, uid: r.uid ?? null, etag: r.etag, ics: r.ics,
    sters: !!r.sters, syncSeq: Number(r.sync_seq ?? 0), actualizatLa: r.actualizat_la,
    incepe: r.incepe ?? null, seTermina: r.se_termina ?? null, recurent: !!r.recurent,
  };
}

function campuriDinRezumat(r: RezumatObiect) {
  return {
    uid: r.uid, rezumat: r.titlu || null, incepe: r.incepe?.toISOString() ?? null,
    se_termina: r.seTermina?.toISOString() ?? null, toata_ziua: r.toataZiua, recurent: r.recurent,
  };
}

const depozit: Depozit = {
  async calendare() {
    const { data, error } = await admin.from("caldav_calendare").select("*").eq("activ", true).order("ordine").order("nume");
    if (error) throw error;
    return (data || []).map(calendarDinRand);
  },
  async calendarDupaSlug(slug) {
    const { data, error } = await admin.from("caldav_calendare").select("*").eq("slug", slug).eq("activ", true).maybeSingle();
    if (error) throw error;
    return data ? calendarDinRand(data) : null;
  },
  async obiecte(calendarId, f: FiltruObiecte) {
    let q = admin.from("caldav_obiecte").select(COLOANE_OBIECT).eq("calendar_id", calendarId);
    if (f.dupaSync != null) q = q.gt("sync_seq", f.dupaSync);
    else q = q.eq("sters", false);
    if (f.hrefuri) q = q.in("href", f.hrefuri);
    if (f.interval) {
      const s = f.interval.start.toISOString();
      const e = f.interval.end.toISOString();
      q = q.or(`recurent.eq.true,incepe.is.null,and(incepe.lte.${e},se_termina.gte.${s})`);
    }
    const { data, error } = await q.order("href");
    if (error) throw error;
    return (data || []).map(obiectDinRand);
  },
  async obiect(calendarId, href) {
    const { data, error } = await admin.from("caldav_obiecte").select(COLOANE_OBIECT).eq("calendar_id", calendarId).eq("href", href).eq("sters", false).maybeSingle();
    if (error) throw error;
    return data ? obiectDinRand(data) : null;
  },
  async obiectDupaUid(calendarId, uid) {
    const { data, error } = await admin.from("caldav_obiecte").select(COLOANE_OBIECT).eq("calendar_id", calendarId).eq("uid", uid).eq("sters", false).limit(1).maybeSingle();
    if (error) throw error;
    return data ? obiectDinRand(data) : null;
  },
  async scrieObiect(calendarId, href, ics, rezumat) {
    const { data, error } = await admin.from("caldav_obiecte")
      .upsert({ calendar_id: calendarId, href, ics, sters: false, ...campuriDinRezumat(rezumat) }, { onConflict: "calendar_id,href" })
      .select(COLOANE_OBIECT).single();
    if (error) throw error;
    return obiectDinRand(data);
  },
  async stergeObiect(calendarId, href) {
    const { data, error } = await admin.from("caldav_obiecte").update({ sters: true }).eq("calendar_id", calendarId).eq("href", href).eq("sters", false).select("id");
    if (error) throw error;
    return (data || []).length > 0;
  },
  async actualizeazaCalendar(calendarId, campuri) {
    const { data, error } = await admin.from("caldav_calendare").update({ ...campuri, actualizat_la: new Date().toISOString() }).eq("id", calendarId).select("*").single();
    if (error) throw error;
    return calendarDinRand(data);
  },
};

/* ---------- autentificarea Basic ---------- */

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function egaleInTimpConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* De ce a picat autentificarea, pentru jurnal (fara parola, fara hash):
   fara-antet, antet-invalid, parola-goala, cont-necunoscut, parola-gresita,
   fara-staff; gol cand a reusit. */
let motivRefuz = "";

async function contDinBasic(antet: string | null): Promise<Cont | null> {
  motivRefuz = "";
  if (!antet || !/^Basic\s+/i.test(antet)) { motivRefuz = antet ? "antet-invalid" : "fara-antet"; return null; }
  let decodat = "";
  try { decodat = new TextDecoder().decode(Uint8Array.from(atob(antet.replace(/^Basic\s+/i, "").trim()), (c) => c.charCodeAt(0))); } catch { return null; }
  const p = decodat.indexOf(":");
  if (p < 0) { motivRefuz = "antet-invalid"; return null; }
  const utilizator = decodat.slice(0, p).trim().toLowerCase();
  const parola = decodat.slice(p + 1);
  if (!utilizator || !parola) { motivRefuz = parola ? "utilizator-gol" : "parola-goala"; return null; }
  const { data: cont } = await admin.from("caldav_conturi").select("user_id, utilizator, email, parola_hash").eq("utilizator", utilizator).maybeSingle();
  if (!cont) { motivRefuz = "cont-necunoscut"; return null; }
  if (!egaleInTimpConstant(await sha256Hex(parola), cont.parola_hash)) { motivRefuz = "parola-gresita"; return null; }
  const { data: staff } = await admin.from("staff").select("name").eq("user_id", cont.user_id).maybeSingle();
  if (!staff) { motivRefuz = "fara-staff"; return null; }
  admin.from("caldav_conturi").update({ ultima_folosire: new Date().toISOString() }).eq("user_id", cont.user_id).then(() => {}, () => {});
  return { utilizator: cont.utilizator, nume: staff.name || cont.utilizator, email: cont.email ?? null };
}

/* ---------- importul unui .ics din PMS ---------- */

function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") || "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function hrefSigur(uid: string): string {
  const curat = uid.replace(/[^A-Za-z0-9._@-]/g, "_").slice(0, 120);
  return (curat || "eveniment") + ".ics";
}

async function importa(req: Request, slug: string): Promise<Response> {
  const json = (stare: number, corp: unknown) => new Response(JSON.stringify(corp), { status: stare, headers: { "Content-Type": "application/json", ...cors(req) } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Fără autentificare." });
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json(401, { error: "Sesiune invalidă." });
  const { data: staff } = await admin.from("staff").select("role").eq("user_id", auth.user.id).maybeSingle();
  if (!staff || staff.role !== "admin") return json(403, { error: "Doar administratorul importă calendare." });
  const cal = await depozit.calendarDupaSlug(slug);
  if (!cal) return json(404, { error: "Sala nu există." });
  const text = await req.text();
  const obiecte = imparteInObiecte(text);
  let noi = 0, actualizate = 0, ignorate = 0;
  for (const ob of obiecte) {
    const rezumat = rezumaObiect(ob.ics);
    if (!rezumat) { ignorate++; continue; }
    const existent = await depozit.obiectDupaUid(cal.id, ob.uid);
    if (existent) {
      if (existent.ics !== ob.ics) { await depozit.scrieObiect(cal.id, existent.href, ob.ics, rezumat); actualizate++; }
      else ignorate++;
      continue;
    }
    let href = hrefSigur(ob.uid);
    for (let i = 2; await depozit.obiect(cal.id, href); i++) href = hrefSigur(ob.uid).replace(/\.ics$/, `-${i}.ics`);
    await depozit.scrieObiect(cal.id, href, ob.ics, rezumat);
    noi++;
  }
  return json(200, { noi, actualizate, ignorate, total: obiecte.length });
}

/* ---------- jurnalul cererilor ---------- */

/* O linie per cerere in jurnalul functiei (Supabase -> Logs -> Edge
   Functions): metoda, calea, adancimea, starea, durata si clientul; la
   erori (in afara de 401) si corpurile cererii si raspunsului, trunchiate,
   ca sa se vada ce a cerut telefonul si ce am refuzat. Fara Authorization. */
function jurnal(req: Request, cale: string, stare: number, ms: number, corpCerere: string, corpRaspuns: string) {
  const ua = (req.headers.get("user-agent") || "-").split(" ").pop();
  const gazda = req.headers.get("x-forwarded-host") || req.headers.get("host") || "-";
  let linie = `caldav ${req.method} ${cale} depth=${req.headers.get("depth") ?? "-"} -> ${stare} (${ms}ms) ${ua} gazda=${gazda}`;
  if (stare === 401) linie += ` motiv=${motivRefuz || "-"}`;
  if (stare >= 400 && stare !== 401) linie += ` cerere=${JSON.stringify(corpCerere.slice(0, 700))} raspuns=${JSON.stringify(corpRaspuns.slice(0, 700))}`;
  console.log(linie);
}

/* ---------- intrarea ---------- */

Deno.serve(async (req) => {
  const gazdaPublica = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const { baza, cale } = adreseDinCale(new URL(req.url).pathname, gazdaPublica);

  if (cale.startsWith("/import/")) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors(req) });
    try { return await importa(req, decodeURIComponent(cale.slice("/import/".length).split("/")[0] || "")); }
    catch (e) { return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { "Content-Type": "application/json", ...cors(req) } }); }
  }

  const t0 = Date.now();
  const cont = await contDinBasic(req.headers.get("Authorization"));
  if (!cont) {
    jurnal(req, cale, 401, Date.now() - t0, "", "");
    return new Response("Autentificare necesară", { status: 401, headers: { "WWW-Authenticate": REALM, "DAV": "1, 3, calendar-access" } });
  }

  const antete: Record<string, string> = {};
  req.headers.forEach((v, k) => { antete[k.toLowerCase()] = v; });
  const corp = await req.text();
  try {
    const r = await serveste({ metoda: req.method, cale, antete, corp }, cont, depozit, baza);
    jurnal(req, cale, r.stare, Date.now() - t0, corp, r.corp);
    return new Response(r.corp.length ? r.corp : null, { status: r.stare, headers: r.antete });
  } catch (e) {
    console.error("caldav", req.method, cale, e);
    return new Response("Eroare internă", { status: 500 });
  }
});
