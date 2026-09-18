// Televizoarele din camere — punctul unic prin care PMS-ul vorbește cu
// Samsung LYNK Cloud.
//
// POST /functions/v1/tv-provider
//   { "action": "sync-tvs" }                         -- aduce aparatele din cont
//   { "action": "welcome", "reservationId": "r-..." } -- scrie mesajul pe televizoarele camerei
//   { "action": "clear",   "reservationId": "r-..." } -- șterge mesajul (plecare, anulare)
//   { "action": "clear",   "roomId": "r1003" }        -- idem, pe cameră (mutarea unui oaspete)
//   { "action": "refresh", "tvId": "tv-..." }         -- un televizor
//   { "action": "refresh" }                           -- toate
//
// DE CE O FUNCȚIE, ȘI NU APELURI DIRECTE DIN BROWSER
//
// 1. Credențialele contului LYNK administrează TOATE televizoarele
//    proprietății. Un bundle de browser e public prin definiție; acolo n-au
//    ce căuta, exact ca parola contului TTLock sau cheia Shelly.
//
// 2. Interfața nu are voie să spună CE scrie pe ecranul unei camere. Funcția
//    primește id-ul rezervării și citește singură camera, oaspetele și
//    șablonul. Altfel, oricine deschide DevTools ar putea scrie ce vrea pe
//    televizorul oricărei camere.
//
// 3. Scrierea în `tv_messages` e rezervată aici (service_role): tabelul n-are
//    politici de insert pentru `authenticated`. Un jurnal pe care actorul îl
//    poate scrie singur nu spune nimic despre ce s-a întâmplat cu adevărat.
//
// Ce a rămas de confirmat cu contul Samsung: providers/lynk.ts, în cap.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as lynk from "./providers/lynk.ts";
import * as simulare from "./providers/simulare.ts";
/* Logica pură (șablon, limbă, plafoane) stă în src/lib/tv.js, ca să aibă o
   singură copie și să fie testată cu vitest — vezi src/tv.test.js. La deploy
   intră și dependințele ei: src/lib/acces.js (numele în ordinea din mesaj) și
   src/lib/timp.js (fusul hotelului). Importurile relative merg prin ele. */
import { mesajBunVenit, normalizeazaSetari } from "../../../src/lib/tv.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CHEIE_SETARI = "pms:tv:v1";

/* Actorul din spatele unui apel făcut cu service_role (pg_cron, sau altă
   funcție edge): niciun om în spate. Vezi `rolDinJwt`. */
const ACTOR_SISTEM = "Automatizare (sistem)";

/* Anteturile permise se OGLINDESC din cerere — supabase-js trimite și
   x-client-info, și (după versiune) x-region, iar o listă fixă face browserul
   să refuze cererea încă de la preflight. Autorizarea se face înăuntru, pe
   JWT și pe rolul din `staff`, nu prin lista asta. */
const corsPentru = (req: Request) => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    req.headers.get("Access-Control-Request-Headers") ||
    "authorization, apikey, content-type, x-client-info, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

/* Gateway-ul Supabase a validat deja SEMNĂTURA JWT-ului (funcția are
   verify_jwt=true); decodarea de aici doar citește rolul din payload. Un JWT
   cu rol falsificat n-ar fi trecut de gateway ca să ajungă până aici. */
function rolDinJwt(jwt: string): string {
  try {
    const segment = jwt.split(".")[1] || "";
    return JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")))?.role || "";
  } catch {
    return "";
  }
}

/* Setările integrării, din `app_state`. Curățarea și valorile implicite stau
   în src/lib/tv.js (`normalizeazaSetari`), ca ecranul și funcția asta să nu
   poată porni de la două seturi diferite de valori — inclusiv la `provider`,
   unde diferența înseamnă „mesajul a plecat spre televizorul oaspetelui" sau
   „nu a plecat nicăieri". Cheia e scrisă doar de admin (politica din
   schema.sql). */
async function setari(admin: any) {
  const { data } = await admin.from("app_state")
    .select("value").eq("key", CHEIE_SETARI).maybeSingle();
  return normalizeazaSetari(data?.value);
}

/* Rândul din Postgres (snake_case) în forma cu care lucrează src/lib/tv.js
   (camelCase, ca obiectele de ecran). Se face aici, într-un singur loc,
   tocmai ca logica pură să nu aibă două forme de intrare. */
const catreLib = (rez: any) => ({
  id: rez.id,
  status: rez.status,
  roomId: rez.room_id,
  guestId: rez.guest_id,
  checkin: rez.checkin,
  checkout: rez.checkout,
  occupantFirstName: rez.occupant_first_name,
  occupantLastName: rez.occupant_last_name,
});

const catreLibOaspete = (g: any) => ({
  firstName: g?.first_name,
  lastName: g?.last_name,
  country: g?.country,
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
    /* Aceleași roluri ca la relee: camerista n-are ecranul ăsta, iar
       `tv_devices` îi e închis prin RLS — dacă ar trece de aici, ar fi
       singura cale prin care ar ajunge totuși la televizoare. */
    if (!staff || !["admin", "receptionist"].includes(staff.role)) {
      return raspuns({
        ok: false,
        error: staff
          ? `Rolul „${staff.role}" nu poate scrie pe televizoare.`
          : "Contul tău nu e înregistrat ca membru al personalului.",
      }, 403);
    }
    actor = `${staff.name || staff.user_id} (${staff.role})`;
  }

  let cerere: any;
  try { cerere = await req.json(); }
  catch { return raspuns({ ok: false, error: "Corp de cerere invalid." }, 400); }

  const actiune = String(cerere?.action || "");
  if (!["sync-tvs", "welcome", "clear", "refresh"].includes(actiune)) {
    return raspuns({ ok: false, error: "Acțiune necunoscută." }, 400);
  }

  const s = await setari(admin);
  if (!s.activ) {
    /* Oprită din setări nu e o eroare: recepția a hotărât că televizoarele
       nu salută nimeni în perioada asta. Check-in-ul nu are ce să raporteze. */
    return raspuns({ ok: true, inactiv: true, trimise: 0 });
  }

  const furnizor: any = s.provider === "lynk" ? lynk : simulare;
  if (!furnizor.configurat()) {
    return raspuns({
      ok: false, reason: "neconfigurat",
      error: `Integrarea LYNK nu e configurată. Lipsesc secretele: ${furnizor.ceLipseste()}.`,
    }, 503);
  }

  /* Jurnalul nu are voie să răstoarne operațiunea pe care o descrie — același
     tipar ca `jurnal` din device-provider și guest-unlock.
     `refresh` NU se jurnalizează: ecranul citește starea periodic, iar un
     rând per citire ar îngropa exact mesajele pentru care există tabelul. */
  const jurnal = async (r: Record<string, unknown>) => {
    try { await admin.from("tv_messages").insert({ actor, ...r }); } catch { /* ignorat */ }
  };

  const acum = () => new Date().toISOString();

  /* Televizoarele active ale unei camere. Două televizoare în aceeași cameră
     primesc același mesaj — nu e o dublură, e aceeași cameră cu două ecrane. */
  async function televizoareleCamerei(roomId: string) {
    const { data } = await admin.from("tv_devices")
      .select("*, rooms(name)")
      .eq("room_id", roomId).eq("enabled", true).eq("provider", s.provider);
    return data || [];
  }

  // ---------------------------------------------------------------
  // SINCRONIZARE: aparatele din contul LYNK -> `tv_devices`
  //
  // Nu leagă nimic de camere singură. Maparea o face adminul, din ecran:
  // un televizor pus pe camera greșită înseamnă numele altui oaspete pe
  // ecran, iar `roomHint`-ul din cont e o convenție de nume, nu un adevăr.
  // ---------------------------------------------------------------
  if (actiune === "sync-tvs") {
    let lista: any[];
    try {
      lista = await furnizor.listeazaTelevizoare();
    } catch (e) {
      const mesaj = (e as Error).message;
      await jurnal({ action: "sync", result: "error", detail: mesaj.slice(0, 500) });
      return raspuns({ ok: false, error: mesaj }, 502);
    }

    let noi = 0;
    for (const t of lista) {
      const id = `tv-${t.deviceId}`;
      const { data: existent } = await admin.from("tv_devices")
        .select("id").eq("id", id).maybeSingle();

      if (existent) {
        /* Numele și modelul se actualizează, maparea pe cameră NU: a pus-o
           un om, uitându-se la un televizor real. */
        await admin.from("tv_devices").update({
          name: t.name, model: t.model || null,
          last_status: { online: Boolean(t.online), roomHint: t.roomHint || null },
          last_seen_at: acum(), updated_at: acum(),
        }).eq("id", id);
      } else {
        await admin.from("tv_devices").insert({
          id, provider: s.provider, provider_device_id: t.deviceId,
          name: t.name, model: t.model || null,
          last_status: { online: Boolean(t.online), roomHint: t.roomHint || null },
          last_seen_at: acum(),
        });
        noi++;
      }
    }

    await jurnal({
      action: "sync", result: "ok",
      detail: `${lista.length} televizoare în cont, ${noi} noi.`,
    });
    return raspuns({ ok: true, total: lista.length, noi });
  }

  // ---------------------------------------------------------------
  // REFRESH: starea aparatelor
  // ---------------------------------------------------------------
  if (actiune === "refresh") {
    const tvId = String(cerere?.tvId || "").trim();
    const q = admin.from("tv_devices").select("id, provider_device_id")
      .eq("enabled", true).eq("provider", s.provider);
    const { data: lista } = tvId ? await q.eq("id", tvId) : await q;

    let actualizate = 0;
    let eroare = "";
    for (const t of lista || []) {
      try {
        const stare = await furnizor.citesteStare(t.provider_device_id);
        await admin.from("tv_devices").update({
          last_status: stare, last_seen_at: acum(), updated_at: acum(),
        }).eq("id", t.id);
        actualizate++;
      } catch (e) {
        eroare ||= (e as Error).message;
      }
    }
    if (eroare && !actualizate) return raspuns({ ok: false, error: eroare }, 502);
    return raspuns({ ok: true, actualizate });
  }

  // ---------------------------------------------------------------
  // WELCOME / CLEAR
  // ---------------------------------------------------------------
  const rezervareId = String(cerere?.reservationId || "").trim();
  let roomId = String(cerere?.roomId || "").trim();
  let rezervare: any = null;

  if (rezervareId) {
    const { data } = await admin.from("reservations")
      .select("id, room_id, guest_id, checkin, checkout, status, occupant_first_name, occupant_last_name")
      .eq("id", rezervareId).maybeSingle();
    if (!data) return raspuns({ ok: false, error: "Rezervarea nu a fost găsită." }, 404);
    rezervare = data;
    roomId ||= data.room_id;
  }
  if (!roomId) return raspuns({ ok: false, error: "Lipsește rezervarea sau camera." }, 400);

  const { data: camera } = await admin.from("rooms").select("id, name").eq("id", roomId).maybeSingle();
  const televizoare = await televizoareleCamerei(roomId);

  /* Nicio cameră din pensiune n-are televizor mapat la început, iar unele pot
     rămâne așa. Nu e o eroare și nu are ce raporta recepției la check-in —
     de-aia `ok: true` cu `fara: true`, nu 404. Ecranul tace, în loc să spună
     „mesajul n-a putut fi trimis" pentru o cameră fără televizor. */
  if (!televizoare.length) {
    return raspuns({ ok: true, fara: true, trimise: 0, camera: camera?.name || roomId });
  }

  const contextJurnal = (t: any) => ({
    tv_id: t.id,
    tv_name: t.name,
    room_name: camera?.name || roomId,
    reservation_id: rezervare?.id || null,
  });

  if (actiune === "clear") {
    /* CINE E ÎN CAMERĂ ACUM.
     *
     * La o mutare, recepția cere ștergerea pe camera veche — dar între timp
     * poate fi cazat deja altcineva acolo (o mutare încrucișată, sau o
     * cameră eliberată și reocupată în aceeași zi). A șterge atunci ar lăsa
     * ecranul noului oaspete gol, fără ca cineva să afle.
     *
     * Regula: dacă în cameră e cazată o ALTĂ rezervare decât cea pentru care
     * se cere ștergerea, ecranul primește mesajul ei, nu se golește. */
    const { data: cazate } = await admin.from("reservations")
      .select("id, room_id, guest_id, checkin, checkout, status, occupant_first_name, occupant_last_name")
      .eq("room_id", roomId).eq("status", "checkedin");
    const alta = (cazate || []).find((r: any) => r.id !== rezervare?.id);
    if (alta) {
      rezervare = alta;
      return await scrieMesaj(alta);
    }

    let trimise = 0;
    const esuate: string[] = [];
    for (const t of televizoare) {
      try {
        await furnizor.stergeMesaj(t.provider_device_id);
        await admin.from("tv_devices").update({
          last_message: null, last_message_at: acum(),
          last_reservation_id: null, updated_at: acum(),
        }).eq("id", t.id);
        await jurnal({ ...contextJurnal(t), action: "clear", result: "ok" });
        trimise++;
      } catch (e) {
        const mesaj = (e as Error).message;
        await jurnal({ ...contextJurnal(t), action: "clear", result: "error", detail: mesaj.slice(0, 500) });
        esuate.push(`${t.name}: ${mesaj}`);
      }
    }
    return raspuns({
      ok: esuate.length === 0, trimise, total: televizoare.length,
      camera: camera?.name || roomId,
      error: esuate.length ? `Mesajul a rămas pe ${esuate.length} din ${televizoare.length} televizoare: ${esuate[0]}` : undefined,
    }, esuate.length ? 207 : 200);
  }

  // --- welcome ---
  if (!rezervare) return raspuns({ ok: false, error: "Lipsește rezervarea." }, 400);
  /* Mesajul e al unei cazări în curs. O rezervare doar confirmată n-are
     oaspete în cameră, iar una plecată sau anulată n-are ce căuta pe ecran —
     `clear` e drumul pentru ele. Garda stă aici, nu doar în interfață: e
     singurul loc prin care trec și check-in-ul, și butonul manual, și o
     eventuală reconciliere. */
  if (rezervare.status !== "checkedin") {
    return raspuns({
      ok: false, reason: "necazat",
      error: "Mesajul se trimite doar pentru o cazare în curs (după check-in).",
    }, 409);
  }
  return await scrieMesaj(rezervare);

  async function scrieMesaj(rez: any) {
    const { data: oaspete } = rez.guest_id
      ? await admin.from("guests").select("first_name, last_name, country").eq("id", rez.guest_id).maybeSingle()
      : { data: null };

    const { text, limba } = mesajBunVenit({
      rezervare: catreLib(rez),
      oaspete: catreLibOaspete(oaspete),
      numeCamera: camera?.name || "",
      setari: s,
    });

    let trimise = 0;
    const esuate: string[] = [];
    for (const t of televizoare) {
      try {
        await furnizor.trimiteMesaj(t.provider_device_id, text, limba);
        await admin.from("tv_devices").update({
          last_message: text, last_message_at: acum(),
          last_reservation_id: rez.id, updated_at: acum(),
        }).eq("id", t.id);
        await jurnal({ ...contextJurnal(t), reservation_id: rez.id, action: "welcome", result: "ok", message: text });
        trimise++;
      } catch (e) {
        const mesaj = (e as Error).message;
        await jurnal({
          ...contextJurnal(t), reservation_id: rez.id, action: "welcome", result: "error",
          message: text, detail: mesaj.slice(0, 500),
        });
        esuate.push(`${t.name}: ${mesaj}`);
      }
    }

    return raspuns({
      ok: esuate.length === 0,
      trimise, total: televizoare.length,
      camera: camera?.name || roomId,
      mesaj: text, limba,
      simulat: s.provider === "simulare",
      error: esuate.length
        ? `Mesajul n-a ajuns pe ${esuate.length} din ${televizoare.length} televizoare: ${esuate[0]}`
        : undefined,
    }, esuate.length ? 207 : 200);
  }
});
