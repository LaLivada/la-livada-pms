// Releele din camere — punctul unic prin care PMS-ul vorbește cu Shelly.
//
// POST /functions/v1/device-provider
//   { "action": "on",      "deviceId": "dv-..." }
//   { "action": "off",     "deviceId": "dv-..." }
//   { "action": "refresh", "deviceId": "dv-..." }   -- un singur dispozitiv
//   { "action": "refresh" }                         -- toate, în loturi de 10
//
// DE CE O FUNCȚIE, ȘI NU APELURI DIRECTE DIN BROWSER
//
// `auth_key`-ul Shelly controlează TOATE releele contului, iar documentația
// Shelly o spune fără menajamente: „Whoever has this key can control your
// Shelly devices". Un bundle de browser e public prin definiție. Cheia stă
// aici, în Edge Function Secrets, exact ca parola contului TTLock.
//
// DE CE HTTP REST, ȘI NU WEBSOCKET
//
// Shelly Cloud oferă și evenimente în timp real prin WebSocket — mecanismul
// „corect" pentru status instant, fără polling. Nu se potrivește AICI:
// o funcție edge e un proces scurt, pornit per cerere și oprit după
// răspuns, iar un WebSocket cere o conexiune ținută deschisă continuu. Ar
// fi nevoie de un proces separat, mereu pornit — infrastructură nouă, exact
// ce cerința inițială cerea să evităm. Interfața citește contorul din câteva
// în câteva secunde cât timp ecranul e deschis, ceea ce arată la fel de viu
// și nu cere niciun proces nou.
// Vezi docs/shelly-integration.md secțiunea 9.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as shelly from "./providers/shelly.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* Credențialele Shelly. Ambele se citesc din aplicația Shelly, de pe
   aceeași pagină: User Settings → Authorization cloud key. `SERVER_URI` NU
   e un domeniu universal — e serverul contului (ex.
   "shelly-103-eu.shelly.cloud") și trebuie citit de acolo, nu presupus. */
const AUTH_KEY   = Deno.env.get("SHELLY_AUTH_KEY") || "";
const SERVER_URI = (Deno.env.get("SHELLY_SERVER_URI") || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");

const corsPentru = (req: Request) => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    req.headers.get("Access-Control-Request-Headers") ||
    "authorization, apikey, content-type, x-client-info, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

Deno.serve(async (req) => {
  const cors = corsPentru(req);
  const raspuns = (corp: unknown, status = 200) =>
    new Response(JSON.stringify(corp), {
      status, headers: { "Content-Type": "application/json", ...cors },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return raspuns({ ok: false, error: "Metodă nepermisă." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- Cine cere ---
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return raspuns({ ok: false, error: "Neautentificat." }, 401);

  const { data: staff } = await admin.from("staff")
    .select("user_id, name, role").eq("user_id", auth.user.id).maybeSingle();
  /* Camerista nu comandă relee. Nu e o restricție de principiu, ci una
     de consecvență: ecranul ei nu are butoanele astea, iar tabelul
     `devices` îi e deja închis prin RLS — dacă ar trece de aici, ar fi
     singura cale prin care ar ajunge totuși la ele. */
  if (!staff || !["admin", "receptionist"].includes(staff.role)) {
    return raspuns({
      ok: false,
      error: staff
        ? `Rolul „${staff.role}" nu poate comanda dispozitive.`
        : "Contul tău nu e înregistrat ca membru al personalului.",
    }, 403);
  }
  const actor = `${staff.name || staff.user_id} (${staff.role})`;

  if (!AUTH_KEY || !SERVER_URI) {
    return raspuns({
      ok: false, reason: "neconfigurat",
      error: "Integrarea Shelly nu e configurată. Lipsesc SHELLY_AUTH_KEY sau SHELLY_SERVER_URI.",
    }, 503);
  }

  let cerere: any;
  try { cerere = await req.json(); }
  catch { return raspuns({ ok: false, error: "Corp de cerere invalid." }, 400); }

  const actiune = String(cerere?.action || "");
  if (!["on", "off", "refresh"].includes(actiune)) {
    return raspuns({ ok: false, error: "Acțiune necunoscută." }, 400);
  }

  /* Auditul nu are voie să răstoarne operațiunea pe care o descrie —
     același tipar ca `jurnal` din guest-unlock.

     Se scrie DOAR la on/off, niciodată la refresh. Jurnalul e acolo ca să
     arate cine a comutat ce, iar o citire nu schimbă nimic; de când
     interfața citește contorul din câteva în câteva secunde, un rând per
     citire ar fi însemnat sute de rânduri pe oră care ar fi îngropat exact
     comenzile pentru care există tabelul. */
  const jurnal = async (r: Record<string, unknown>) => {
    try { await admin.from("device_commands").insert(r); } catch { /* ignorat */ }
  };

  // --- refresh fără deviceId: toate dispozitivele, în loturi ---
  if (actiune === "refresh" && !cerere?.deviceId) {
    const { data: toate } = await admin.from("devices")
      .select("id, provider_device_id, channel, kind").eq("enabled", true).eq("provider", "shelly");
    const lista = toate || [];
    if (!lista.length) return raspuns({ ok: true, actualizate: 0 });

    /* Un dispozitiv fizic apare o dată per canal în `devices`, dar Shelly
       răspunde o dată per DISPOZITIV. Deduplicăm înainte de a număra
       loturile, altfel un Pro 4PM cu patru canale ar consuma patru sloturi
       din cele zece în loc de unul. */
    const idUnice = [...new Set(lista.map((d: any) => d.provider_device_id))];
    const stari: Record<string, any> = {};
    const erori: string[] = [];

    for (let i = 0; i < idUnice.length; i += shelly.MAX_PE_LOT) {
      const lot = idUnice.slice(i, i + shelly.MAX_PE_LOT);
      try {
        Object.assign(stari, await shelly.citesteStare(SERVER_URI, AUTH_KEY, lot));
      } catch (e) {
        erori.push(shelly.faraCheie((e as Error).message));
      }
    }

    let actualizate = 0;
    for (const d of lista) {
      const s = stari[d.provider_device_id];
      if (!s) continue;
      /* Fiecare rând e un CANAL, iar Shelly a răspuns o dată per dispozitiv:
         starea se extrage per canal, altfel toate cele patru canale ale unui
         Pro 4PM ar primi starea canalului 0 — boilerul pornit ar face să
         pară că sunt pornite și prizele.
         Contorul citeşte altceva din acelaşi răspuns: puterea pe cele trei
         faze, nu un întrerupător. */
      const stare = d.kind === "contor"
        ? { online: s.online, consum: shelly.citesteConsum(s.status) }
        : { on: shelly.citesteIesire(s.status, d.channel), online: s.online };
      await admin.from("devices").update({
        last_status: stare,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", d.id);
      actualizate++;
    }

    if (erori.length && !actualizate) {
      return raspuns({ ok: false, error: erori[0] }, 502);
    }
    return raspuns({ ok: true, actualizate });
  }

  // --- acțiuni pe un dispozitiv anume ---
  const deviceId = String(cerere?.deviceId || "").trim();
  if (!deviceId) return raspuns({ ok: false, error: "Lipsește dispozitivul." }, 400);

  /* Camerele vin odată cu dispozitivul: un canal partajat (boiler, iluminat
     exterior) serveşte două camere, iar jurnalul trebuie să le înghețe pe
     amândouă — altfel o comandă din trecut n-ar mai spune pe cine a atins. */
  const { data: device } = await admin.from("devices")
    .select("*, device_rooms(room_id, rooms(name))").eq("id", deviceId).maybeSingle();
  if (!device) return raspuns({ ok: false, error: "Dispozitivul nu a fost găsit." }, 404);
  if (!device.enabled) {
    return raspuns({ ok: false, reason: "dezactivat", error: "Dispozitivul e dezactivat în setări." }, 409);
  }
  if (device.device_gen !== "gen2") {
    /* Gen1 ar cere API-ul v1, deprecat. Nu e scris încă, fiindcă nu există
       niciun Gen1 montat — dar refuzul e explicit, ca să nu se trimită în
       tăcere o comandă v2 către un dispozitiv care poate n-o înțelege. */
    return raspuns({
      ok: false, reason: "generatie-nesuportata",
      error: `Dispozitivele ${device.device_gen} nu sunt încă suportate — doar Gen2 (Plus/Pro).`,
    }, 501);
  }

  /* Un contor nu se comandă. Refuzul e explicit, nu tăcut: altfel un buton
     rătăcit în interfață ar trimite `set/switch` unui dispozitiv care n-are
     niciun comutator, iar Shelly ar răspunde cu o eroare greu de citit. */
  if (device.kind === "contor" && actiune !== "refresh") {
    return raspuns({
      ok: false, reason: "necomandabil",
      error: "Contorul doar măsoară — nu are ce porni sau opri.",
    }, 400);
  }

  const camere = numeCamere(device);
  const contextJurnal = {
    actor, device_id: device.id, device_name: device.name,
    rooms: camere.join(", ").slice(0, 120) || null,
  };

  try {
    if (actiune === "on" || actiune === "off") {
      const pornit = actiune === "on";
      await shelly.seteazaComutator(
        SERVER_URI, AUTH_KEY, device.provider_device_id, device.channel, pornit);

      /* Starea scrisă e cea CERUTĂ, marcată cu ora. Shelly confirmă cu
         HTTP 200 că a acceptat comanda, nu ne întoarce starea rezultată;
         un refresh ulterior o confirmă din dispozitiv. */
      const stare = { on: pornit, online: true };
      await admin.from("devices").update({
        last_status: stare,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", device.id);

      await jurnal({ ...contextJurnal, action: actiune, result: "ok" });
      return raspuns({ ok: true, device: catreClient(device, stare, camere) });
    }

    // refresh pe un singur dispozitiv
    const stari = await shelly.citesteStare(SERVER_URI, AUTH_KEY, [device.provider_device_id]);
    const brut = stari[device.provider_device_id];
    if (!brut) {
      return raspuns({ ok: false, reason: "necunoscut", error: "Shelly nu cunoaște acest dispozitiv. Verifică ID-ul din setări." }, 404);
    }
    const stare = device.kind === "contor"
      ? { online: brut.online, consum: shelly.citesteConsum(brut.status) }
      : { on: shelly.citesteIesire(brut.status, device.channel), online: brut.online };
    await admin.from("devices").update({
      last_status: stare,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", device.id);
    return raspuns({ ok: true, device: catreClient(device, stare, camere) });
  } catch (e) {
    const mesaj = shelly.faraCheie((e as Error).message);
    const cod = (e as Error & { cod?: string }).cod || "";
    if (actiune !== "refresh") {
      await jurnal({ ...contextJurnal, action: actiune, result: "error", detail: mesaj.slice(0, 500) });
    }
    /* Offline nu e o defecțiune a PMS-ului — 409, nu 502, ca interfața să
       poată deosebi „releul nu răspunde" de „Shelly Cloud e picat". */
    const status = cod === "DEVICE_OFFLINE" ? 409 : 502;
    return raspuns({ ok: false, reason: cod || "eroare", error: mesaj }, status);
  }
});

/* Numele camerelor servite de un canal, în ordine stabilă. Ordinea contează
   fiindcă textul ăsta ajunge în jurnal: „1001, 1002" și „1002, 1001" ar fi
   aceeași comandă scrisă în două feluri, greu de căutat mai târziu. */
function numeCamere(device: any): string[] {
  return (device.device_rooms || [])
    .map((l: any) => l?.rooms?.name)
    .filter(Boolean)
    .sort();
}

/* Ce pleacă spre browser. Deliberat NU tot rândul: `provider_device_id` e
   identificatorul din contul Shelly, iar interfața n-are ce face cu el —
   îi ajunge `id`-ul intern. */
function catreClient(
  device: any,
  /* Forma difera dupa tipul dispozitivului: un releu raporteaza `on`, un
     contor raporteaza `consum`. Ambele au `online`. */
  stare: Record<string, unknown>,
  camere: string[],
) {
  return {
    id: device.id,
    name: device.name,
    kind: device.kind,
    channel: device.channel,
    /* Interfața are nevoie de listă, nu de o singură cameră: un canal cu
       două camere trebuie să poată spune „comun cu 1002" înainte ca cineva
       să-l oprească. */
    rooms: camere,
    shared: camere.length > 1,
    status: stare,
    lastSeenAt: new Date().toISOString(),
  };
}
