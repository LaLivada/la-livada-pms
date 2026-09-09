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
import * as reguli from "./reguli-automate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* Credențialele Shelly. Ambele se citesc din aplicația Shelly, de pe
   aceeași pagină: User Settings → Authorization cloud key. `SERVER_URI` NU
   e un domeniu universal — e serverul contului (ex.
   "shelly-103-eu.shelly.cloud") și trebuie citit de acolo, nu presupus. */
/* Pauza dintre două comenzi ale aceleiaşi acțiuni pe grup: o secundă fix.
   Shelly acceptă în jur de o cerere pe secundă; sub pragul ăsta refuză cu
   TOO_MANY_REQUESTS, aşa cum s-a văzut pe 9 septembrie când comenzile de
   boiler date manual una după alta s-au lovit între ele.
   Consecința de ştiut: şapte relee înseamnă şase secunde de aşteptare până
   când butonul răspunde. E preferabil unei comenzi rapide din care jumătate
   n-a ajuns. */
const PAUZA_INTRE_COMENZI_MS = 1000;

const AUTH_KEY   = Deno.env.get("SHELLY_AUTH_KEY") || "";
const SERVER_URI = (Deno.env.get("SHELLY_SERVER_URI") || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");

/* Actorul din spatele ciclului de reconciliere (pg_cron -> pg_net, fara
   niciun utilizator uman in spate). Vezi `rolDinJwt` mai jos. */
const ACTOR_SISTEM = "Automatizare (sistem)";

/* JWT-ul de service_role nu are un user real in spate, deci
   `admin.auth.getUser(jwt)` esueaza pentru el — de-aia identificarea lui
   trece pe langa acel apel, nu prin el. Gateway-ul Supabase a validat deja
   SEMNATURA JWT-ului inainte sa ajunga cererea aici (functia are
   verify_jwt=true); decodarea de mai jos doar citeste rolul din payload,
   fara sa re-verifice nimic — un JWT cu semnatura valida dar rol
   falsificat nu poate trece de gateway ca sa ajunga pana aici. */
function rolDinJwt(jwt: string): string {
  try {
    const segment = jwt.split(".")[1] || "";
    const json = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)?.role || "";
  } catch {
    return "";
  }
}

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
  const esteSistem = rolDinJwt(jwt) === "service_role";

  let actor: string;
  if (esteSistem) {
    actor = ACTOR_SISTEM;
  } else {
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
    actor = `${staff.name || staff.user_id} (${staff.role})`;
  }

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
  if (!["on", "off", "refresh", "cron_reconciliaza"].includes(actiune)) {
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

  /* Ciclul periodic (pg_cron, o data la 10 minute) recalculeaza starea
     dorita a boilerelor si a luminilor exterioare — vezi ruleazaReconciliere
     mai jos si docs/shelly-integration.md. Doar sistemul il poate declansa:
     un JWT anon de pe internet nu are cum sa porneasca relee direct. */
  if (actiune === "cron_reconciliaza") {
    if (!esteSistem) {
      return raspuns({ ok: false, error: "Doar sistemul poate declanșa acest ciclu." }, 403);
    }
    const rezultat = await ruleazaReconciliere(admin, jurnal);
    return raspuns(rezultat, rezultat.ok ? 200 : 207);
  }

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

  /* --- comandă pe grup: toate releele de un fel ---
   *
   * Se face AICI, pe server, nu prin şapte apeluri din browser. Motivul e
   * exact bugul de azi: Shelly refuză cereri prea apropiate, iar şapte
   * comenzi plecate deodată din interfață ar fi garantat TOO_MANY_REQUESTS
   * pe majoritatea. Aici pleacă una câte una, cu pauză între ele, şi fiecare
   * are reîncercarea din `seteazaComutator` în spate.
   *
   * Rezultatul spune câte au reuşit şi câte nu — o comandă pe grup care
   * raportează doar „gata" ar ascunde tocmai releul care n-a răspuns. */
  const felCerut = String(cerere?.kind || "").trim();
  if (felCerut && (actiune === "on" || actiune === "off")) {
    if (!["boiler", "iluminat_exterior", "prize"].includes(felCerut)) {
      return raspuns({ ok: false, error: "Fel de dispozitiv necunoscut." }, 400);
    }

    const { data: aleFelului } = await admin.from("devices")
      .select("*, device_rooms(room_id, rooms(name))")
      .eq("enabled", true).eq("provider", "shelly").eq("kind", felCerut)
      .order("provider_device_id");
    const lista = aleFelului || [];
    if (!lista.length) return raspuns({ ok: false, error: "Niciun dispozitiv de felul ăsta." }, 404);

    const pornit = actiune === "on";
    const reusite: string[] = [];
    const esuate: Array<{ camere: string; motiv: string }> = [];

    for (const [i, d] of lista.entries()) {
      /* Pauză ÎNTRE comenzi, nu înaintea primeia — n-are rost să aştepte
         nimeni degeaba la prima. */
      if (i > 0) await new Promise((gata) => setTimeout(gata, PAUZA_INTRE_COMENZI_MS));

      const camere = numeCamere(d);
      const context = {
        actor, device_id: d.id, device_name: d.name,
        rooms: camere.join(", ").slice(0, 120) || null,
      };
      try {
        await shelly.seteazaComutator(
          SERVER_URI, AUTH_KEY, d.provider_device_id, d.channel, pornit);
        await admin.from("devices").update({
          last_status: { on: pornit, online: true },
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", d.id);
        await jurnal({ ...context, action: actiune, result: "ok" });
        if (d.kind === "iluminat_exterior" && !esteSistem) await inregistreazaOverride(admin, d.id);
        reusite.push(camere.join(", "));
      } catch (e) {
        const mesaj = shelly.faraCheie((e as Error).message);
        await jurnal({ ...context, action: actiune, result: "error", detail: mesaj.slice(0, 500) });
        esuate.push({ camere: camere.join(", "), motiv: mesaj });
      }
    }

    return raspuns({
      ok: esuate.length === 0,
      reusite: reusite.length,
      total: lista.length,
      esuate,
      /* Mesajul e gata format aici: interfața n-are de unde şti care releu a
         picat şi de ce, iar o listă de obiecte ar ajunge acolo netradusă. */
      error: esuate.length
        ? `${esuate.length} din ${lista.length} n-au răspuns: ${esuate.map((x) => x.camere).join("; ")}.`
        : undefined,
    }, esuate.length ? 207 : 200);
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
      if (device.kind === "iluminat_exterior" && !esteSistem) await inregistreazaOverride(admin, device.id);
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

/* Un OM tocmai a comandat manual un releu de iluminat exterior — regula 2
   (lumini după soare) sare peste el pana la urmatoarea tranzitie naturala,
   ca sa nu-l stinga/aprinda la 10 minute dupa ce cineva l-a atins special.
   Nu se scrie pentru boiler: nu a fost cerut, iar acolo automatizarea isi
   reimpune starea la urmatorul tick, fara mecanism de suprascriere. */
async function inregistreazaOverride(admin: any, deviceId: string) {
  try {
    await admin.from("device_automation_override").upsert({
      device_id: deviceId,
      until: reguli.urmatoareaTranzitie(new Date()).toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch { /* nu blocheaza comanda manuala daca scrierea esueaza */ }
}

/* Ciclul de reconciliere — apelat o data la 10 minute de pg_cron (vezi
   migrarea `device-automatizari` din schema.sql). Recalculeaza din date
   proaspete ce ar trebui sa fie pornit, pentru fiecare boiler si fiecare
   releu de iluminat exterior, si schimba doar ce difera de starea reala. */
async function ruleazaReconciliere(
  admin: any,
  jurnal: (r: Record<string, unknown>) => Promise<void>,
): Promise<{ ok: boolean; verificate: number; schimbate: number; erori?: string[] }> {
  const acum = new Date();

  /* Contorul intră în aceeaşi citire ca releele, deşi nu se comandă: e pe
     acelaşi cont Shelly, deci încape în acelaşi lot, iar aşa istoricul de
     consum se scrie chiar şi când nu e nimeni cu ecranul deschis. */
  const { data: dispozitive } = await admin.from("devices")
    .select("*, device_rooms(room_id, rooms(name))")
    .eq("enabled", true).eq("provider", "shelly")
    .in("kind", ["boiler", "iluminat_exterior", "contor"]);
  const lista = dispozitive || [];
  if (!lista.length) return { ok: true, verificate: 0, schimbate: 0 };

  /* Stare reala de la Shelly, nu doar cache — o decizie de automatizare
     bazata pe un cache invechit ar putea sari o schimbare sau ar putea
     repeta o comanda deja executata manual intre timp. */
  const idUnice = [...new Set(lista.map((d: any) => d.provider_device_id))];
  const stari: Record<string, any> = {};
  for (let i = 0; i < idUnice.length; i += shelly.MAX_PE_LOT) {
    const lot = idUnice.slice(i, i + shelly.MAX_PE_LOT);
    try {
      Object.assign(stari, await shelly.citesteStare(SERVER_URI, AUTH_KEY, lot));
    } catch { /* lotul asta ramane pe cache-ul vechi; se reincearca la tick-ul urmator */ }
  }
  for (const d of lista) {
    const s = stari[d.provider_device_id];
    if (!s) continue;
    /* Contorul citeşte altceva din acelaşi răspuns: puterea pe trei faze, nu
       un întrerupător. Fără ramura asta i s-ar fi scris `on: false` peste
       cifrele de consum. */
    d.last_status = d.kind === "contor"
      ? { online: s.online, consum: shelly.citesteConsum(s.status) }
      : { on: shelly.citesteIesire(s.status, d.channel), online: s.online };
    await admin.from("devices").update({
      last_status: d.last_status, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", d.id);

    /* Odometrul, în istoric. Doar când chiar l-am citit: un `null` scris ca
       zero ar face ca următoarea citire adevărată să arate ca un salt de mii
       de kWh în consumul pe 30 de zile. */
    if (d.kind === "contor") {
      const totalKwh = shelly.citesteEnergieTotala(s.status);
      if (totalKwh !== null) {
        await admin.from("energy_readings").insert({
          total_kwh: totalKwh,
          putere_kw: d.last_status?.consum?.totalKw ?? null,
        });
      }
    }
  }

  const boilere = lista.filter((d: any) => d.kind === "boiler");
  const luminiExt = lista.filter((d: any) => d.kind === "iluminat_exterior");

  // --- rezervarile camerelor legate de boilere (pentru preincalzire + legionela) ---
  const roomIdsBoilere = [...new Set(
    boilere.flatMap((d: any) => (d.device_rooms || []).map((l: any) => l.room_id)),
  )];
  let rezervariBoilere: any[] = [];
  if (roomIdsBoilere.length) {
    const inceput = new Date(acum.getTime() - (reguli.ZILE_LEGIONELA + 1) * 86400000).toISOString();
    const sfarsit = new Date(acum.getTime() + 2 * 86400000).toISOString();
    const { data } = await admin.from("reservations")
      .select("id, room_id, status, checkin, checkout")
      .in("room_id", roomIdsBoilere)
      .gt("checkout", inceput).lt("checkin", sfarsit);
    rezervariBoilere = data || [];
  }

  /* Pentru lumini: "vreo camera cazata ACUM", pe toata pensiunea — nu doar
     camerele unui CT, cerinta explicita ("se aprind toate luminile"). */
  const { data: cazateAcumData } = await admin.from("reservations")
    .select("id, room_id, status, checkin, checkout")
    .eq("status", "checkedin").lte("checkin", acum.toISOString()).gt("checkout", acum.toISOString());
  const luminiVor = reguli.luminiDorite(cazateAcumData || [], acum);

  /* Steagurile de pornit/oprit per regula. Lipsa unui rand inseamna „activa" —
     o regula noua adaugata in cod nu trebuie sa astepte un rand in baza ca sa
     inceapa sa functioneze. */
  const { data: reguliData } = await admin.from("automation_rules").select("key, enabled");
  const activa = (cheie: string) =>
    (reguliData || []).find((r: any) => r.key === cheie)?.enabled !== false;
  const preincalzireActiva = activa(reguli.REGULI.PREINCALZIRE);
  const legionelaActiva = activa(reguli.REGULI.LEGIONELA);
  const luminiActive = activa(reguli.REGULI.LUMINI);

  const { data: rulariData } = await admin.from("device_legionella_runs")
    .select("device_id, last_run_on").in("device_id", boilere.map((d: any) => d.id));
  const ultimeRulari: Record<string, string> = {};
  for (const r of rulariData || []) ultimeRulari[r.device_id] = r.last_run_on;

  const { data: overrideData } = await admin.from("device_automation_override")
    .select("device_id").in("device_id", luminiExt.map((d: any) => d.id))
    .gt("until", acum.toISOString());
  const overrideActiv = new Set((overrideData || []).map((o: any) => o.device_id));

  let schimbate = 0;
  const erori: string[] = [];
  let primaComanda = true;

  const comanda = async (d: any, pornit: boolean) => {
    if (!primaComanda) await new Promise((gata) => setTimeout(gata, PAUZA_INTRE_COMENZI_MS));
    primaComanda = false;

    const camere = numeCamere(d);
    const context = {
      actor: ACTOR_SISTEM, device_id: d.id, device_name: d.name,
      rooms: camere.join(", ").slice(0, 120) || null,
    };
    try {
      await shelly.seteazaComutator(SERVER_URI, AUTH_KEY, d.provider_device_id, d.channel, pornit);
      await admin.from("devices").update({
        last_status: { on: pornit, online: true },
        last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", d.id);
      await jurnal({ ...context, action: pornit ? "on" : "off", result: "ok" });
      schimbate++;
    } catch (e) {
      const mesaj = shelly.faraCheie((e as Error).message);
      await jurnal({ ...context, action: pornit ? "on" : "off", result: "error", detail: mesaj.slice(0, 500) });
      erori.push(`${d.name}: ${mesaj}`);
    }
  };

  /* GARDA. Cand AMANDOUA regulile de boiler sunt oprite, ciclul nu are voie sa
     atinga boilerele deloc. `boilerDorit` ar intoarce `pornit: false` — ceea ce
     e corect ca „nicio regula nu-l cere pornit", dar folosit ca stare dorita ar
     STINGE toate boilerele in clipa in care cineva opreste automatizarile.
     „Oprit" inseamna „nu mai comand", nu „opreste tot". */
  if (preincalzireActiva || legionelaActiva) {
    for (const d of boilere) {
      const rezervariCamera = rezervariBoilere.filter((r: any) =>
        (d.device_rooms || []).some((l: any) => l.room_id === r.room_id));
      const { pornit, motivLegionela } = reguli.boilerDorit({
        rezervari: rezervariCamera, acum,
        curentPornit: Boolean(d.last_status?.on),
        ultimaRulareLegionela: ultimeRulari[d.id] || null,
        preincalzireActiva, legionelaActiva,
      });
      if (motivLegionela) {
        await admin.from("device_legionella_runs").upsert({
          device_id: d.id, last_run_on: reguli.dataLocala(acum), updated_at: new Date().toISOString(),
        });
      }
      if (Boolean(d.last_status?.on) !== pornit) await comanda(d, pornit);
    }
  }

  if (luminiActive) {
    for (const d of luminiExt) {
      if (overrideActiv.has(d.id)) continue;
      if (Boolean(d.last_status?.on) !== luminiVor) await comanda(d, luminiVor);
    }
  }

  /* Rezultatul, scris ÎNAINTE de a fi întors: răspunsul HTTP se poate pierde
     (pg_net are propriul timeout), dar rândul din tabel rămâne — el e ce vede
     ecranul, deci el trebuie să fie sursa de adevăr, nu răspunsul. */
  const verificate = boilere.length + luminiExt.length;
  try {
    await admin.from("automation_runs").insert({
      ok: erori.length === 0,
      verificate, schimbate,
      erori: erori.length ? erori.join(" · ").slice(0, 1000) : null,
    });
  } catch { /* jurnalul nu are voie sa rastoarne ciclul pe care il descrie */ }

  return { ok: erori.length === 0, verificate, schimbate, erori: erori.length ? erori : undefined };
}
