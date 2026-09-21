// Importul calendarelor OTA — sensul OTA → PMS.
//
// POST /functions/v1/ical-import   { "action": "importa" }
//
// Chemata de pg_cron la fiecare 15 minute (vezi migratia
// ..._ical_import_cron.sql), cu cheia service_role din Vault. Pentru fiecare
// rand activ din `camere_calendare_ota` descarca feedul .ics al OTA-ului,
// il parseaza si scrie in `reservations` ce lipseste.
//
// DE CE PULL, SI NU WEBHOOK. Nici Airbnb, nici Booking.com nu anunta o
// adresa .ics gratuita cand se schimba ceva — webhook-urile sunt exact ce
// vand channel managerele platite. Singurul lucru pe care il controlam e cat
// de des citim NOI; cat de des isi reimprospateaza EI feedul (o ora la
// Airbnb, neregulat la Booking.com) ramane fereastra reala de risc.
// Vezi docs/ical-ota-plan.md.
//
// CE NU ADUCE. Nume, telefon, pret — feedurile nu le contin. Rezervarile
// importate primesc eticheta „Detalii lipsă (OTA)"; recepția completeaza
// din extranet inainte de sosire.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evenimenteDin, adresaDeFeed } from "./feed.ts";
import { decideActiuni, sursaDinOta, MOTIVE, TAG_OTA_INCOMPLET } from "../../../src/lib/ical-ota.js";
import { partiLocale } from "../../../src/lib/timp.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EXPEDITOR = Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>";
const ALERTA_CATRE = Deno.env.get("ALERTA_EMAIL") || "office@lalivada.com";

/* Cat asteptam un feed. Airbnb si Booking.com raspund in sub o secunda cand
   sunt sanatosi; peste zece inseamna ca ceva e in neregula si nu merita
   tinuta functia ocupata cat timp mai sunt 15 camere de citit. */
const TIMEOUT_FEED_MS = 10_000;

/* Cate esecuri la rand inseamna „adresa e stricata, nu e o pana de moment".
   La 15 minute intre rulari, cinci esecuri sunt vreo ora si un sfert — destul
   cat sa treaca o intrerupere reala, destul de putin cat sa nu descoperim un
   URL revocat peste o saptamana. Alerta pleaca o singura data, exact la prag. */
const PRAG_ALERTA_ERORI = 5;

const ACTOR = "Import iCal (sistem)";

/* Identic cu cel din device-provider: gateway-ul Supabase a validat deja
   SEMNATURA JWT-ului inainte ca cererea sa ajunga aici, deci decodarea de
   mai jos doar citeste rolul, nu re-verifica nimic. */
function rolDinJwt(jwt: string): string {
  try {
    const json = atob((jwt.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)?.role || "";
  } catch {
    return "";
  }
}

/* Cate redirectari urmam. OTA-urile chiar redirecteaza (booking.com →
   ical.booking.com, http → https), deci zero n-ar merge; peste trei, fie e o
   bucla, fie cineva se joaca. */
const MAX_REDIRECTARI = 3;

async function descarca(url: string): Promise<string> {
  /* REDIRECTARILE SE URMEAZA DE MANA. Cu `redirect: "follow"`, garda de
     adresa s-ar aplica doar primului pas: o adresa externa perfect valida
     care raspunde `302 Location: http://169.254.169.254/…` ar duce cererea
     inauntru, iar noi n-am sti. Fiecare salt trece prin `adresaDeFeed`. */
  let tinta = adresaDeFeed(url);
  for (let salt = 0; ; salt++) {
    const r = await fetch(tinta, {
      signal: AbortSignal.timeout(TIMEOUT_FEED_MS),
      redirect: "manual",
      headers: { Accept: "text/calendar, text/plain" },
    });

    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      /* Corpul unui redirect nu ne trebuie, dar trebuie inchis: altfel
         conexiunea ramane deschisa pana la colectorul de gunoaie. */
      await r.body?.cancel();
      if (salt >= MAX_REDIRECTARI) throw new Error("Prea multe redirectari.");
      tinta = adresaDeFeed(new URL(r.headers.get("location")!, tinta));
      continue;
    }

    /* In mesaj intra DOAR codul, niciodata corpul raspunsului: `ultima_eroare`
       se vede in ecranul Camere, iar un corp venit de la o adresa straina
       n-are ce cauta acolo. */
    if (!r.ok) { await r.body?.cancel(); throw new Error(`Feedul a raspuns ${r.status}.`); }

    const text = await r.text();
    /* Un raspuns 200 care nu e un calendar (pagina de login, mesaj de eroare
       HTML) NU trebuie tratat ca „niciun eveniment": ar anula tot ce am
       importat pentru camera aia. */
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Raspunsul nu e un calendar iCal.");
    return text;
  }
}

async function jurnal(admin: any, actiune: string, detaliu: string, camera?: string, rezervare?: string) {
  /* Ca in guest-unlock: jurnalul n-are voie sa rastoarne operatiunea pe care
     o descrie. `user_name` e pastrat de trigger doar cand auth.uid() e null,
     adica exact pe calea asta (vezi migratia ..._calendare_ota_import.sql). */
  try {
    await admin.from("activity_log").insert({
      user_name: ACTOR, action: actiune.slice(0, 200), detail: detaliu.slice(0, 1000),
      room_id: camera ?? null, reservation_id: rezervare ?? null,
    });
  } catch (e) {
    console.error("Jurnal esuat", e);
  }
}

async function alerta(subiect: string, text: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY lipseste — alerta nu a plecat:", subiect, text);
    return;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EXPEDITOR, to: [ALERTA_CATRE], subject: subiect, text }),
    });
    if (!r.ok) console.error("Resend a refuzat alerta", r.status, await r.text());
  } catch (e) {
    console.error("Alerta nu a putut fi trimisa", e);
  }
}

const zi = (d: Date) => {
  const p = partiLocale(d);
  return p ? `${String(p.zi).padStart(2, "0")}.${String(p.luna).padStart(2, "0")}.${p.an}` : "?";
};

/* Postgres da 23P01 pentru constrangerea de excludere `fara_suprapunere`:
   aceeasi camera vanduta pe doua canale in fereastra de intarziere a
   feedurilor. Nu e o eroare de cod si nu se poate rezolva automat — cineva
   trebuie sa sune oaspetele. */
const esteSuprapunere = (e: any) => e?.code === "23P01" || /fara_suprapunere/i.test(e?.message || "");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Metodă nepermisă." }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }
  const raspuns = (corp: unknown, status = 200) =>
    new Response(JSON.stringify(corp), { status, headers: { "Content-Type": "application/json" } });

  /* Nicio cale din browser. Importul scrie rezervari cu drepturi depline si
     nu are nimic de oferit unui utilizator: singurul apelant legitim e cron-ul. */
  if (rolDinJwt((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")) !== "service_role") {
    return raspuns({ ok: false, error: "Doar ciclul automat poate porni importul." }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const acum = new Date();

  const { data: calendare, error: eCal } = await admin
    .from("camere_calendare_ota")
    .select("id, room_id, ota, eticheta, url_ics, erori_consecutive, rooms(name)")
    .eq("activ", true);
  if (eCal) return raspuns({ ok: false, error: eCal.message }, 500);

  let inserate = 0, actualizate = 0, anulate = 0, esuate = 0, conflicte = 0;

  const randuri = ((calendare as any[]) ?? []).map((c) => ({
    ...c, numeCamera: c.rooms?.name || c.room_id,
    unde: `${c.eticheta} · camera ${c.rooms?.name || c.room_id}`,
  }));

  /* FAZA 1 — DESCARCAREA, IN LOTURI PARALELE.
     Doua OTA-uri pe 16 camere inseamna 32 de adrese. Una cate una, cu un
     timeout de 10 secunde fiecare, un singur furnizor lent ar duce rularea
     peste limita de timp a unei functii edge si restul camerelor n-ar mai
     apuca sa fie citite. Sase deodata tin cazul cel mai rau sub un minut,
     fara sa lovim vreun furnizor cu 32 de cereri simultan. */
  const LOT_DESCARCARE = 6;
  const texte = new Map<number, string>();
  for (let i = 0; i < randuri.length; i += LOT_DESCARCARE) {
    const lot = randuri.slice(i, i + LOT_DESCARCARE);
    const rezultate = await Promise.allSettled(lot.map((c) => descarca(c.url_ics)));
    for (let j = 0; j < lot.length; j++) {
      const cal = lot[j];
      const r = rezultate[j];
      if (r.status === "fulfilled") { texte.set(cal.id, r.value); continue; }

      /* UN FEED PICAT NU E UN FEED GOL. Daca am merge mai departe cu zero
         evenimente, `decideActiuni` ar anula corect tot ce lipseste — adica
         toate rezervarile importate ale camerei. De-aia eroarea opreste
         randul aici, fara sa atinga nimic. */
      esuate++;
      const erori = (cal.erori_consecutive || 0) + 1;
      const mesaj = String((r.reason as Error)?.message || r.reason).slice(0, 500);
      await admin.from("camere_calendare_ota")
        .update({ ultima_eroare: mesaj, erori_consecutive: erori }).eq("id", cal.id);
      if (erori === PRAG_ALERTA_ERORI) {
        await jurnal(admin, "Import iCal — feed indisponibil", `${cal.unde}: ${mesaj}`, cal.room_id);
        await alerta(
          `Feed iCal picat — ${cal.unde}`,
          `Adresa de import de la ${cal.eticheta} pentru camera ${cal.numeCamera} a esuat de ${erori} ori la rand.\n\n` +
          `Ultima eroare: ${mesaj}\n${cal.url_ics}\n\n` +
          `Cat timp nu raspunde, rezervarile facute pe ${cal.eticheta} NU ajung in PMS. ` +
          `Verifica adresa in extranetul lor si pune-o din nou in Camere → Calendare OTA.`,
        );
      }
    }
  }

  // FAZA 2 — aplicarea, cameră cu cameră.
  for (const cal of randuri) {
    const { numeCamera, unde } = cal;
    const text = texte.get(cal.id);
    if (text === undefined) continue;             // feed picat, tratat mai sus

    const { evenimente, faraUid } = evenimenteDin(text);
    if (faraUid) console.warn(`${unde}: ${faraUid} evenimente fara UID, ignorate.`);

    const { data: existente, error: eRez } = await admin
      .from("reservations")
      .select("id, external_uid, checkin, checkout, status")
      .eq("room_id", cal.room_id)
      .eq("external_source", cal.ota);
    if (eRez) {
      esuate++;
      await admin.from("camere_calendare_ota")
        .update({ ultima_eroare: eRez.message.slice(0, 500), erori_consecutive: (cal.erori_consecutive || 0) + 1 })
        .eq("id", cal.id);
      continue;
    }

    const actiuni = decideActiuni(
      evenimente,
      ((existente as any[]) ?? []).map((r) => ({
        id: r.id, externalUid: r.external_uid, checkin: r.checkin, checkout: r.checkout, status: r.status,
      })),
      acum,
    );

    for (const a of actiuni.deInserat) {
      /* UUID, nu `uid()` din src/lib: acolo 8 caractere din Math.random sunt
         de-ajuns fiindca un om vede imediat respingerea cheii primare, pe
         cand aici nu se uita nimeni — o coliziune ar fi o rezervare pierduta
         in tacere. */
      const id = crypto.randomUUID();
      const { error } = await admin.from("reservations").insert({
        id, room_id: cal.room_id, guest_id: null,
        checkin: (a.checkin as Date).toISOString(), checkout: (a.checkout as Date).toISOString(),
        status: "confirmed", source: sursaDinOta(cal.ota),
        external_source: cal.ota, external_uid: a.uid,
        tags: [TAG_OTA_INCOMPLET],
        notes: `Importată automat din calendarul ${cal.eticheta}. Numele, telefonul și prețul nu vin prin iCal — completează-le din extranet.`,
      });
      if (error) {
        if (esteSuprapunere(error)) {
          conflicte++;
          const perioada = `${zi(a.checkin as Date)} – ${zi(a.checkout as Date)}`;
          await jurnal(admin, "Suprarezervare posibilă", `${unde}, ${perioada} — camera era deja ocupată în PMS.`, cal.room_id);
          await alerta(
            `Suprarezervare posibilă — camera ${numeCamera}, ${perioada}`,
            `${cal.eticheta} a vandut camera ${numeCamera} pentru ${perioada}, dar in PMS perioada e deja ocupata.\n\n` +
            `Rezervarea NU a fost importata — constrangerea din baza a respins-o, deci nimic nu s-a suprascris.\n\n` +
            `Cineva trebuie sa deschida extranetul ${cal.eticheta}, sa vada despre ce rezervare e vorba si sa sune oaspetele. ` +
            `Nu exista mutare automata: feedurile .ics se reimprospateaza cu intarziere, iar fereastra asta e limita cunoscuta a sincronizarii gratuite.`,
          );
        } else {
          esuate++;
          console.error(`${unde}: inserare esuata`, error);
        }
        continue;
      }
      inserate++;
      await jurnal(admin, "Import iCal — rezervare nouă",
        `${unde}, ${zi(a.checkin as Date)} – ${zi(a.checkout as Date)}`, cal.room_id, id);
    }

    for (const a of actiuni.deActualizat) {
      const patch: Record<string, unknown> = {
        checkin: (a.checkin as Date).toISOString(),
        checkout: (a.checkout as Date).toISOString(),
      };
      if (a.reactiveaza) patch.status = "confirmed";
      const { error } = await admin.from("reservations").update(patch).eq("id", a.id);
      if (error) {
        if (esteSuprapunere(error)) {
          conflicte++;
          await jurnal(admin, "Suprarezervare posibilă",
            `${unde} — sejurul mutat pe ${zi(a.checkin as Date)} – ${zi(a.checkout as Date)} se suprapune cu altă rezervare.`,
            cal.room_id, a.id);
          await alerta(
            `Modificare imposibilă — camera ${numeCamera}`,
            `Pe ${cal.eticheta}, sejurul a fost mutat pe ${zi(a.checkin as Date)} – ${zi(a.checkout as Date)}, ` +
            `dar in PMS perioada e deja ocupata de alta rezervare a camerei ${numeCamera}.\n\n` +
            `Rezervarea a ramas pe datele vechi. Trebuie rezolvat manual.`,
          );
        } else {
          esuate++;
          console.error(`${unde}: actualizare esuata`, error);
        }
        continue;
      }
      actualizate++;
      await jurnal(admin, a.reactiveaza ? "Import iCal — rezervare reactivată" : "Import iCal — sejur modificat",
        `${unde}, ${zi(a.checkin as Date)} – ${zi(a.checkout as Date)}`, cal.room_id, a.id);
    }

    for (const a of actiuni.deAnulat) {
      const { error } = await admin.from("reservations").update({ status: "cancelled" }).eq("id", a.id);
      if (error) { esuate++; console.error(`${unde}: anulare esuata`, error); continue; }
      anulate++;
      await jurnal(admin, "Import iCal — rezervare anulată pe OTA",
        `${unde} — nu mai apare în calendarul lor.`, cal.room_id, a.id);
    }

    for (const s of actiuni.sarite) {
      /* Nu e o eroare, dar trebuie sa se vada: feedul cere ceva ce noi
         refuzam deliberat, iar recepția e singura care poate decide. */
      if (s.motiv !== MOTIVE.trecut) {
        await jurnal(admin, "Import iCal — modificare ignorată",
          `${unde} — ${s.motiv}.`, cal.room_id, s.id ?? undefined);
      }
    }

    await admin.from("camere_calendare_ota").update({
      ultima_sincronizare: new Date().toISOString(), ultima_eroare: null, erori_consecutive: 0,
    }).eq("id", cal.id);
  }

  return raspuns({
    ok: true, calendare: (calendare as any[])?.length ?? 0,
    inserate, actualizate, anulate, conflicte, esuate,
  });
});
