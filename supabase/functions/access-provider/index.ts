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
import * as simulare from "./providers/simulare.ts";
/* Logica pura (fus orar, sablon) sta in src/lib/acces.js, ca sa aiba o
   singura copie si sa fie testata cu vitest — vezi src/acces.test.js.
   Aici nu se rescrie, se importa. */
import { laOraLocala, expirareCod, randeazaSablon, genereazaCodPin, lungimeCod, FUS_HOTEL }
  from "../../../src/lib/acces.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* Anteturile permise se OGLINDESC din cerere, nu se enumera.
 *
 * supabase-js nu trimite doar authorization si content-type: adauga si
 * x-client-info, iar dupa versiune si x-region. Cu o lista fixa, browserul
 * vedea un antet necerut in raspunsul la preflight si refuza cererea
 * INAINTE sa plece — iar biblioteca raporta "Failed to send a request to
 * the Edge Function", care nu trimite deloc catre cauza reala.
 *
 * Oglindirea nu slabeste nimic: `Access-Control-Allow-Headers` spune doar
 * ce anteturi are voie sa trimita browserul, nu cine are voie sa cheme.
 * Autorizarea se face inauntru, pe JWT si pe rolul din `staff`. */
const corsPentru = (req: Request) => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    req.headers.get("Access-Control-Request-Headers") ||
    "authorization, apikey, content-type, x-client-info, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

/* `raspuns` e apelat din zeci de locuri; pastram semnatura si punem
   anteturile de la cererea curenta printr-o variabila de modul, setata la
   inceputul fiecarei invocari. Deno ruleaza o cerere per instanta de
   handler, deci nu se amesteca intre ele. */
let corsCurent: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const raspuns = (corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), {
    status, headers: { "Content-Type": "application/json", ...corsCurent },
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
    provider:      s.provider || "ttlock",
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

/* Furnizorul activ. Simularea se alege DELIBERAT, din setari — niciodata
   ca rezerva automata cand TTLock nu raspunde: o cadere de retea nu are
   voie sa se transforme tacut in coduri care nu deschid nicio usa. */
function furnizor(s: { provider?: string }) {
  return s.provider === "simulare"
    ? { nume: "simulare", api: simulare }
    : { nume: "ttlock", api: ttlock };
}

async function jurnal(admin: any, r: Record<string, unknown>) {
  // Auditul nu are voie să răstoarne operațiunea pe care o descrie.
  try { await admin.from("access_audit").insert(r); } catch { /* ignorat */ }
}

Deno.serve(async (req) => {
  corsCurent = corsPentru(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsCurent });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- Cine cere. Codurile deschid uși, deci nu răspundem oricui. ---
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return raspuns({ error: "Neautentificat." }, 401);

  /* Legatura cu contul de autentificare se face pe `user_id`, nu pe `id`:
     tabelul `staff` nu are coloana `id`. Prima versiune o presupunea, gasea
     zero randuri si refuza accesul chiar si adminului — o presupunere care
     ar fi trebuit verificata in schema, nu ghicita. */
  const { data: staff } = await admin.from("staff")
    .select("user_id, name, role").eq("user_id", auth.user.id).maybeSingle();
  if (!staff || !["admin", "receptionist"].includes(staff.role)) {
    return raspuns({
      error: staff
        ? `Rolul „${staff.role}" nu poate administra accesul la camere.`
        : "Contul tău nu e înregistrat ca membru al personalului.",
    }, 403);
  }
  const actor = `${staff.name || staff.user_id} (${staff.role})`;

  let cerere: any;
  try { cerere = await req.json(); }
  catch { return raspuns({ error: "Corp de cerere invalid." }, 400); }

  const actiune = String(cerere?.action || "");

  /* Deschiderea la distanță nu e o operațiune de recepție: spre deosebire
     de un cod cu interval, deschide ușa PE LOC, cui e în fața ei atunci.
     Garda generală de mai sus acceptă admin+recepționer — asta o
     restrânge suplimentar, doar pentru acțiunea asta. */
  if (actiune === "unlock" && staff.role !== "admin") {
    return raspuns({ error: "Deschiderea la distanță e permisă doar administratorilor." }, 403);
  }

  /* Garda de configurare se aplică DOAR acțiunilor care chiar vorbesc cu
     yala. Trimiterea unui email nu are nevoie de TTLock, iar dacă garda ar
     sta înaintea dispecerizării, un cod deja generat n-ar mai putea fi
     trimis oaspetelui doar fiindcă lipsesc credențialele. */
  const setariAcum = await setari(admin);
  const f = furnizor(setariAcum);
  const cereYala = ["sync-locks", "issue", "revoke", "test-lock", "unlock"].includes(actiune);
  if (cereYala && !f.api.configurat()) {
    return raspuns({
      ok: false, reason: "neconfigurat",
      error: "Integrarea TTLock nu e configurată. Lipsesc secretele TTLOCK_* din Edge Functions.",
    }, 503);
  }

  try {
    // ---------------- SINCRONIZARE YALE ----------------
    if (actiune === "sync-locks") {
      const yale = await f.api.listeazaYale();
      await jurnal(admin, {
        actor, action: "sincronizare yale", provider: "ttlock",
        detail: `${yale.length} yale citite`,
      });
      /* Doar le întoarcem. Asocierea cu camerele o face administratorul, în
         PMS: numele yalei nu e o dovadă suficientă că e camera potrivită. */
      return raspuns({ ok: true, locks: yale });
    }

    // ---------------- TEST PE O YALA ----------------
    //
    // Raspunde la intrebarea "contul are drepturi pe yala asta?" fara sa
    // astepte un check-in real. Necesar fiindca `lock/list` poate fi goala
    // (yale administrate din TTHOTEL) desi contul poate opera yala.
    //
    // Codul de test e valabil peste O ORA, timp de 5 minute, si se sterge
    // imediat: nu deschide usa nimanui in timpul testului, iar daca
    // stergerea esueaza expira oricum singur. Nu scriem nimic in
    // access_codes — nu e un cod de oaspete.
    if (actiune === "test-lock") {
      const lockId = String(cerere?.lockId || "").trim();
      if (!lockId) return raspuns({ error: "Lipsește Lock ID-ul." }, 400);

      const de = new Date(Date.now() + 3600_000);
      const pana = new Date(de.getTime() + 300_000);
      let creat = null, eroareStergere = null;

      try {
        creat = await f.api.creeazaCod(lockId, de, pana, "Test PMS", genereazaCodPin(4));
      } catch (e) {
        await jurnal(admin, {
          actor, action: "test yală", result: "error", provider: "ttlock",
          lock_id: lockId, detail: String((e as Error).message).slice(0, 300),
        });
        return raspuns({ ok: false, error: String((e as Error).message) }, 502);
      }

      try { await f.api.stergeCod(lockId, creat.externalId); }
      catch (e) { eroareStergere = String((e as Error).message); }

      await jurnal(admin, {
        actor, action: "test yală", result: eroareStergere ? "error" : "ok",
        provider: "ttlock", lock_id: lockId, external_ref: creat.externalId,
        detail: eroareStergere?.slice(0, 300),
      });

      return raspuns({
        ok: true,
        creare: "reușită",
        stergere: eroareStergere ? `eșuată: ${eroareStergere}` : "reușită",
        /* Daca stergerea a esuat, codul expira singur peste o ora si cinci
           minute — dar spunem, ca omul sa stie ce a ramas in urma. */
        atentie: eroareStergere
          ? `Codul de test nu a putut fi șters; expiră singur la ${pana.toLocaleString("ro-RO", { timeZone: FUS })}.`
          : null,
      });
    }

    // ---------------- DESCHIDERE LA DISTANȚĂ ----------------
    //
    // Deschide ușa direct, fără cod — pentru manager, nu pentru fluxul
    // curent de recepție (de-aia garda de rol de mai sus e mai strictă
    // decât la restul acțiunilor). Nu scrie nimic în access_codes: nu e
    // un cod emis, e o acțiune punctuală, consemnată doar în audit.
    if (actiune === "unlock") {
      const lockId = String(cerere?.lockId || "").trim();
      if (!lockId) return raspuns({ error: "Lipsește Lock ID-ul." }, 400);

      try {
        await f.api.deschideUsa(lockId);
      } catch (e) {
        await jurnal(admin, {
          actor, action: "deschidere manuală yală", result: "error",
          provider: f.nume, lock_id: lockId, detail: String((e as Error).message).slice(0, 300),
        });
        return raspuns({ ok: false, error: String((e as Error).message) }, 502);
      }

      await jurnal(admin, {
        actor, action: "deschidere manuală yală", result: "ok",
        provider: f.nume, lock_id: lockId,
      });
      return raspuns({ ok: true });
    }

    // ---------------- GENERARE COD ----------------
    if (actiune === "issue") {
      const rezervareId = String(cerere?.reservationId || "");
      if (!rezervareId) return raspuns({ error: "Lipsește rezervarea." }, 400);
      /* Cerută explicit de la buton ("Regenerează codul"): oaspetele
         primește un cod NOU chiar dacă perioada n-a fost atinsă — de
         exemplu fiindcă cel vechi a ajuns la altcineva. Fără flag-ul asta,
         verificarea de mai jos ar întoarce tot codul vechi. */
      const fortat = Boolean(cerere?.force);

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

      const s = setariAcum;
      const de = new Date(rez.checkin);
      const pana = expirareCod(rez.checkout, s);

      if (existent) {
        const acelasiInterval =
          Math.abs(new Date(existent.valid_from).getTime() - de.getTime()) < 60_000 &&
          Math.abs(new Date(existent.valid_until).getTime() - pana.getTime()) < 60_000;
        if (!fortat && acelasiInterval && existent.lock_id === cam.access_lock_id) {
          return raspuns({ ok: true, reused: true, code: existent });
        }
        /* Perioada sau camera s-au schimbat: codul vechi nu mai are voie să
           rămână valabil. Îl ștergem de pe yală ÎNAINTE de a crea altul. */
        if (existent.external_id) {
          try { await f.api.stergeCod(existent.lock_id, existent.external_id); }
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
      const nou = await f.api.creeazaCod(
        cam.access_lock_id, de, pana, `Rezervare ${rez.id}`,
        genereazaCodPin(lungimeCod(s)));

      const rand = {
        id: `ac-${crypto.randomUUID().slice(0, 12)}`,
        reservation_id: rez.id, room_id: rez.room_id,
        provider: f.nume, lock_id: cam.access_lock_id,
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
        try { await f.api.stergeCod(cam.access_lock_id, nou.externalId); } catch { /* nimic */ }
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
        try { await f.api.stergeCod(cod.lock_id, cod.external_id); }
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

      const s = setariAcum;
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
