// Acces electronic la camere — punctul unic prin care PMS-ul vorbește cu
// yalele.
//
// POST /functions/v1/access-provider
//   { "action": "sync-locks" }
//   { "action": "issue",  "reservationId": "r-..." }
//   { "action": "revoke", "reservationId": "r-..." }
//
// DE CE EXISTĂ FUNCȚIA ASTA
//
// 1. Credențialele. Autentificarea TTLock cere client_id, client_secret,
//    userul și parola contului care administrează TOATE yalele. Un bundle
//    de browser e public prin definiție, deci acolo n-au ce căuta.
//
// 2. Interfața nu are voie să spună CE cod și PENTRU CÂT. Funcția primește
//    doar id-ul rezervării și citește singură camera, perioada și setările
//    din bază. Altfel cineva ar putea cere din DevTools un cod valabil un
//    an pentru o cameră care nu e a lui.
//
// 3. Scrierea în access_codes e rezervată aici (service_role). Tabelul n-are
//    politici de insert pentru `authenticated`, tocmai ca un cod să nu poată
//    exista în PMS fără să existe și pe yală.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as ttlock from "./providers/ttlock.ts";
/* Logica pura (fus orar, sablon) sta in src/lib/acces.js, ca sa aiba o
   singura copie si sa fie testata cu vitest — vezi src/acces.test.js.
   Aici nu se rescrie, se importa. */
import { laOraLocala, expirareCod, randeazaSablon, genereazaCodPin, lungimeCod, FUS_HOTEL }
  from "../../../src/lib/acces.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const raspuns = (corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });

const FUS = FUS_HOTEL;

/* Setările de acces. Implicit 11:00 + 30 de minute de grație — ora reală de
   plecare a pensiunii, nu 12:00 cum se presupune adesea. Configurabile din
   PMS; valorile de aici sunt doar plasa de siguranță. */
async function setari(admin: any) {
  const { data } = await admin.from("app_state")
    .select("value").eq("key", "pms:access:v1").maybeSingle();
  const s = data?.value || {};
  return {
    oraPlecare:    Number.isFinite(s.checkoutHour)    ? s.checkoutHour    : 11,
    minutePlecare: Number.isFinite(s.checkoutMinute)  ? s.checkoutMinute  : 0,
    grateMinute:   Number.isFinite(s.graceMinutes)    ? s.graceMinutes    : 30,
    codeLength:    s.codeLength,
    numeHotel:     s.hotelName || "Complex La Livada",
    sablon:        s.messageTemplate || SABLON_IMPLICIT,
  };
}

/* Șablonul mesajului. Configurabil din PMS; ăsta e doar punctul de pornire.
   Randarea se face AICI, pe server, nu în browser: altfel textul trimis de
   pe adresa pensiunii ar putea fi rescris din DevTools. */
const SABLON_IMPLICIT = `Bună {{guest_name}},

Bine ai venit la {{hotel_name}}!

Camera ta este {{room_number}}.
Codul de acces este: {{access_code}}

Valabil de la {{valid_from}} până la {{valid_until}}.

Introdu codul pe tastatura yalei și apasă tasta de confirmare.
Dacă ai nevoie de ajutor, contactează recepția.`;

const dataRo = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", {
    timeZone: FUS, day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// randeazaSablon vine din modulul comun (src/lib/acces.js).

async function jurnal(admin: any, r: Record<string, unknown>) {
  // Auditul nu are voie să răstoarne operațiunea pe care o descrie.
  try { await admin.from("access_audit").insert(r); } catch { /* ignorat */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- Cine cere. Codurile deschid uși, deci nu răspundem oricui. ---
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return raspuns({ error: "Neautentificat." }, 401);

  const { data: staff } = await admin.from("staff")
    .select("id, name, role").eq("id", auth.user.id).maybeSingle();
  if (!staff || !["admin", "receptionist"].includes(staff.role)) {
    return raspuns({ error: "Nu ai dreptul să administrezi accesul la camere." }, 403);
  }
  const actor = `${staff.name || staff.id} (${staff.role})`;

  let cerere: any;
  try { cerere = await req.json(); }
  catch { return raspuns({ error: "Corp de cerere invalid." }, 400); }

  const actiune = String(cerere?.action || "");

  /* Garda de configurare se aplică DOAR acțiunilor care chiar vorbesc cu
     yala. Trimiterea unui email nu are nevoie de TTLock, iar dacă garda ar
     sta înaintea dispecerizării, un cod deja generat n-ar mai putea fi
     trimis oaspetelui doar fiindcă lipsesc credențialele. */
  const cereYala = ["sync-locks", "issue", "revoke"].includes(actiune);
  if (cereYala && !ttlock.configurat()) {
    return raspuns({
      ok: false, reason: "neconfigurat",
      error: "Integrarea TTLock nu e configurată. Lipsesc secretele TTLOCK_* din Edge Functions.",
    }, 503);
  }

  try {
    // ---------------- SINCRONIZARE YALE ----------------
    if (actiune === "sync-locks") {
      const yale = await ttlock.listeazaYale();
      await jurnal(admin, {
        actor, action: "sincronizare yale", provider: "ttlock",
        detail: `${yale.length} yale citite`,
      });
      /* Doar le întoarcem. Asocierea cu camerele o face administratorul, în
         PMS: numele yalei nu e o dovadă suficientă că e camera potrivită. */
      return raspuns({ ok: true, locks: yale });
    }

    // ---------------- GENERARE COD ----------------
    if (actiune === "issue") {
      const rezervareId = String(cerere?.reservationId || "");
      if (!rezervareId) return raspuns({ error: "Lipsește rezervarea." }, 400);

      const { data: rez } = await admin.from("reservations")
        .select("id, room_id, checkin, checkout, status, guest_id")
        .eq("id", rezervareId).maybeSingle();
      if (!rez) return raspuns({ error: "Rezervarea nu a fost găsită." }, 404);

      const { data: cam } = await admin.from("rooms")
        .select("id, name, access_provider, access_lock_id")
        .eq("id", rez.room_id).maybeSingle();

      if (!cam?.access_lock_id) {
        await jurnal(admin, {
          actor, action: "generare cod", result: "error",
          reservation_id: rez.id, room_id: rez.room_id,
          detail: "camera nu are yală asociată",
        });
        return raspuns({
          ok: false, reason: "fara-yala",
          error: `Camera ${cam?.name || rez.room_id} nu are o yală asociată. Configureaz-o în Setări → Camere.`,
        }, 409);
      }

      /* Există deja un cod activ? Îl întoarcem pe acela. Deschiderea
         repetată a rezervării nu trebuie să producă un cod nou — iar dacă
         două tab-uri cer simultan, indexul unic din bază oprește al doilea. */
      const { data: existent } = await admin.from("access_codes")
        .select("*").eq("reservation_id", rez.id).eq("status", "active").maybeSingle();

      const s = await setari(admin);
      const de = new Date(rez.checkin);
      const pana = expirareCod(rez.checkout, s);

      if (existent) {
        const acelasiInterval =
          Math.abs(new Date(existent.valid_from).getTime() - de.getTime()) < 60_000 &&
          Math.abs(new Date(existent.valid_until).getTime() - pana.getTime()) < 60_000;
        if (acelasiInterval && existent.lock_id === cam.access_lock_id) {
          return raspuns({ ok: true, reused: true, code: existent });
        }
        /* Perioada sau camera s-au schimbat: codul vechi nu mai are voie să
           rămână valabil. Îl ștergem de pe yală ÎNAINTE de a crea altul. */
        if (existent.external_id) {
          try { await ttlock.stergeCod(existent.lock_id, existent.external_id); }
          catch (e) {
            await jurnal(admin, {
              actor, action: "revocare cod", result: "error",
              reservation_id: rez.id, room_id: existent.room_id,
              provider: existent.provider, lock_id: existent.lock_id,
              detail: String((e as Error).message).slice(0, 300),
            });
          }
        }
        await admin.from("access_codes")
          .update({ status: "superseded", revoked_at: new Date().toISOString() })
          .eq("id", existent.id);
      }

      /* Lungimea vine din setari (implicit 6). TTLock nu documenteaza ce
         lungimi accepta o yala, deci nu presupunem: daca refuza, eroarea ei
         ajunge la receptie asa cum e. */
      const nou = await ttlock.creeazaCod(
        cam.access_lock_id, de, pana, `Rezervare ${rez.id}`,
        genereazaCodPin(lungimeCod(s)));

      const rand = {
        id: `ac-${crypto.randomUUID().slice(0, 12)}`,
        reservation_id: rez.id, room_id: rez.room_id,
        provider: "ttlock", lock_id: cam.access_lock_id,
        code: nou.code, external_id: nou.externalId,
        valid_from: de.toISOString(), valid_until: pana.toISOString(),
        status: "active", generated_by: actor,
      };
      const { data: salvat, error: eSalvare } = await admin
        .from("access_codes").insert(rand).select().single();

      if (eSalvare) {
        /* Codul există pe yală dar nu în baza noastră — cel mai prost caz
           posibil. Îl ștergem imediat, ca să nu rămână un cod activ pe care
           PMS-ul nu îl știe și deci nu îl poate revoca niciodată. */
        try { await ttlock.stergeCod(cam.access_lock_id, nou.externalId); } catch { /* nimic */ }
        throw new Error(`Codul nu a putut fi salvat: ${eSalvare.message}`);
      }

      await jurnal(admin, {
        actor, action: "generare cod", reservation_id: rez.id, room_id: rez.room_id,
        provider: "ttlock", lock_id: cam.access_lock_id, external_ref: nou.externalId,
      });
      return raspuns({ ok: true, code: salvat });
    }

    // ---------------- REVOCARE ----------------
    if (actiune === "revoke") {
      const rezervareId = String(cerere?.reservationId || "");
      const { data: cod } = await admin.from("access_codes")
        .select("*").eq("reservation_id", rezervareId).eq("status", "active").maybeSingle();
      if (!cod) return raspuns({ ok: true, nimic: true });

      let eroare: string | null = null;
      if (cod.external_id) {
        try { await ttlock.stergeCod(cod.lock_id, cod.external_id); }
        catch (e) { eroare = String((e as Error).message); }
      }

      await admin.from("access_codes").update({
        status: "revoked", revoked_at: new Date().toISOString(),
        error_message: eroare,
      }).eq("id", cod.id);

      await jurnal(admin, {
        actor, action: "revocare cod", result: eroare ? "error" : "ok",
        reservation_id: rezervareId, room_id: cod.room_id,
        provider: cod.provider, lock_id: cod.lock_id,
        external_ref: cod.external_id, detail: eroare?.slice(0, 300),
      });

      /* Dacă ștergerea de pe yală a eșuat, NU pretindem că e revocat: codul
         încă deschide ușa. Recepția trebuie să știe, ca să poată interveni. */
      return eroare
        ? raspuns({ ok: false, reason: "revocare-esuata", error: eroare }, 502)
        : raspuns({ ok: true });
    }

    // ---------------- TRIMITERE PE EMAIL ----------------
    if (actiune === "send-email") {
      const rezervareId = String(cerere?.reservationId || "");
      const { data: cod } = await admin.from("access_codes")
        .select("*").eq("reservation_id", rezervareId).eq("status", "active").maybeSingle();
      if (!cod) return raspuns({ ok: false, error: "Nu există un cod activ de trimis." }, 409);

      const { data: rez } = await admin.from("reservations")
        .select("guest_id, room_id").eq("id", rezervareId).maybeSingle();
      const { data: oaspete } = await admin.from("guests")
        .select("first_name, last_name, email").eq("id", rez?.guest_id).maybeSingle();
      const { data: cam } = await admin.from("rooms")
        .select("name").eq("id", cod.room_id).maybeSingle();

      const adresa = (oaspete?.email || "").trim();
      if (!adresa) {
        return raspuns({ ok: false, reason: "fara-email",
          error: "Oaspetele nu are o adresă de email salvată." }, 409);
      }

      const s = await setari(admin);
      const text = randeazaSablon(s.sablon, {
        guest_name:  [oaspete?.first_name, oaspete?.last_name].filter(Boolean).join(" ") || "oaspete",
        hotel_name:  s.numeHotel,
        room_number: cam?.name || cod.room_id,
        access_code: cod.code,
        valid_from:  dataRo(cod.valid_from),
        valid_until: dataRo(cod.valid_until),
      });

      const CHEIE = Deno.env.get("RESEND_API_KEY");
      if (!CHEIE) {
        /* Infrastructura e gata, serviciul de email nu. Nu scriem o
           notificare „trimisă" care n-a plecat nicăieri. */
        return raspuns({ ok: false, reason: "neconfigurat",
          error: "Trimiterea pe email nu e configurată (lipsește RESEND_API_KEY)." }, 503);
      }

      let eroare: string | null = null;
      try {
        const t = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${CHEIE}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>",
            to: [adresa],
            subject: `Codul de acces pentru camera ${cam?.name || ""} · ${s.numeHotel}`,
            text,
          }),
        });
        if (!t.ok) eroare = `Serviciul de email a răspuns ${t.status}.`;
      } catch (e) {
        eroare = String((e as Error).message);
      }

      await admin.from("access_notifications").insert({
        id: `an-${crypto.randomUUID().slice(0, 12)}`,
        access_code_id: cod.id, channel: "email", recipient: adresa,
        status: eroare ? "failed" : "sent",
        sent_at: eroare ? null : new Date().toISOString(),
        sent_by: actor, error_message: eroare,
      });

      await jurnal(admin, {
        actor, action: "trimitere email", result: eroare ? "error" : "ok",
        reservation_id: rezervareId, room_id: cod.room_id,
        detail: eroare?.slice(0, 300) || adresa,
      });

      return eroare
        ? raspuns({ ok: false, error: eroare }, 502)
        : raspuns({ ok: true, recipient: adresa });
    }

    // ---------------- WHATSAPP: DOAR ÎNREGISTRAREA ----------------
    //
    // Trimiterea propriu-zisă se face din browser, prin linkul wa.me —
    // PMS-ul nu are API oficial WhatsApp. Aici doar consemnăm că mesajul a
    // fost pregătit și deschis, ca să existe o urmă în rezervare.
    if (actiune === "log-whatsapp") {
      const rezervareId = String(cerere?.reservationId || "");
      const { data: cod } = await admin.from("access_codes")
        .select("id, room_id").eq("reservation_id", rezervareId).eq("status", "active").maybeSingle();
      if (!cod) return raspuns({ ok: false, error: "Nu există un cod activ." }, 409);

      await admin.from("access_notifications").insert({
        id: `an-${crypto.randomUUID().slice(0, 12)}`,
        access_code_id: cod.id, channel: "whatsapp",
        recipient: String(cerere?.recipient || "").slice(0, 40),
        status: "sent", sent_at: new Date().toISOString(), sent_by: actor,
      });
      await jurnal(admin, {
        actor, action: "trimitere whatsapp", reservation_id: rezervareId, room_id: cod.room_id,
      });
      return raspuns({ ok: true });
    }

    return raspuns({ error: `Acțiune necunoscută: ${actiune}` }, 400);
  } catch (e) {
    const mesaj = String((e as Error).message || e);
    await jurnal(admin, {
      actor, action: actiune, result: "error",
      reservation_id: cerere?.reservationId ?? null,
      provider: "ttlock", detail: mesaj.slice(0, 300),
    });
    console.error("access-provider", actiune, mesaj);
    return raspuns({ ok: false, error: mesaj }, 502);
  }
});
