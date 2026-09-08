// Deschiderea usii din pagina oaspetelui.
//
// POST /functions/v1/guest-unlock   { "cod": "Ajh6k" }
//
// DE CE O FUNCTIE SEPARATA, SI NU O ACTIUNE NOUA IN access-provider
//
// Functia aceea porneste cu o garda care cere JWT de personal si un rol din
// `staff`. Ca sa accepte si coduri de oaspete ar fi trebuit sa tina doua
// modele de autorizare in acelasi fisier de ~600 de linii, unde o gresita
// ramificare de maine da unui oaspete actiunile de admin — inclusiv
// `passage-mode-set`, care lasa usa descuiata la nesfarsit.
//
// Functia asta nu poate face decat un singur lucru: deschide usa rezervarii
// al carei cod l-a primit. Logica de TTLock ramane partajata, prin import
// din acelasi adaptor.
//
// Se deployeaza cu --no-verify-jwt: cererea vine dintr-o pagina fara cont,
// deci nu poarta JWT. Autorizarea e codul de sejur, verificat in baza.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipClient } from "../../../src/lib/ip.js";
/* Adaptoarele nu se copiaza, se importa din access-provider. O a doua copie
   a logicii de TTLock ar fi insemnat ca o schimbare acolo (alt endpoint, alt
   mod de reimprospatare a tokenului) sa fie facuta in doua locuri, iar al
   doilea sa fie uitat. */
import * as ttlock from "../access-provider/providers/ttlock.ts";
import * as simulare from "../access-provider/providers/simulare.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const raspuns = (corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), {
    status, headers: { "Content-Type": "application/json", ...cors },
  });

/* Mesajele care ajung la oaspete. Motivele vin din baza; aici se traduc in
   ceva ce poate citi cineva care sta in fata usii, cu telefonul in mana. */
const MESAJE: Record<string, string> = {
  neinceput: "Sejurul n-a început încă.",
  incheiat: "Sejurul s-a încheiat.",
  anulat: "Rezervarea nu mai este activă.",
  necunoscut: "Linkul nu funcționează.",
  "prea-multe": "Prea multe încercări. Așteaptă câteva minute.",
  "prea-des": "Ușa a fost deschisă de prea multe ori în ultima oră. Sună recepția.",
  "fara-yala": "Camera nu are încuietoare conectată. Folosește codul de acces.",
  "prea-devreme": "Ușa se deschide de la ora sosirii.",
  "prea-tarziu": "Ora plecării a trecut, ușa nu se mai deschide. Sună recepția.",
};

/* Ora de sosire, scrisa pentru cineva care sta in fata usii.
 * Fusul e cel al casei, nu al serverului: oaspetele si camera sunt in
 * acelasi loc, iar Deno ruleaza in UTC. */
function candSeDeschide(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  let cerere: any;
  try { cerere = await req.json(); }
  catch { return raspuns({ error: "Corp de cerere invalid." }, 400); }

  const cod = String(cerere?.cod || "").trim();
  const ip = ipClient(req);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  /* Toata autorizarea sta in baza, intr-un singur apel: codul, fereastra
     sejurului, plafoanele si contorizarea. Aici nu se rescrie niciuna. */
  const { data: poarta, error: eroarePoarta } = await admin
    .rpc("guest_poate_deschide", { p_cod: cod, p_ip: ip });

  if (eroarePoarta) return raspuns({ ok: false, error: "Serverul n-a putut verifica linkul." }, 500);
  if (!poarta?.ok) {
    const motiv = String(poarta?.motiv || "necunoscut");
    let mesaj = MESAJE[motiv] || MESAJE.necunoscut;
    /* La „prea devreme" spunem si DE CAND. „Nu inca" fara o ora e exact
       raspunsul care trimite omul la receptie degeaba. */
    if (motiv === "prea-devreme") {
      const cand = candSeDeschide(poarta?.deLa);
      if (cand) mesaj = `Ușa se deschide de la ora sosirii — ${cand}.`;
    }
    return raspuns({ ok: false, motiv, error: mesaj }, 403);
  }

  /* Furnizorul se citeste din setari, ca in access-provider — ca sa nu
     existe doua raspunsuri la intrebarea „cu ce yale vorbim". */
  const { data: stare } = await admin.from("app_state")
    .select("value").eq("key", "pms:access:v1").maybeSingle();
  const numeFurnizor = (stare?.value as any)?.provider || "ttlock";
  const api = numeFurnizor === "simulare" ? simulare : ttlock;

  if (!api.configurat()) {
    return raspuns({ ok: false, error: "Deschiderea la distanță nu e configurată." }, 503);
  }

  /* Actorul spune „oaspete", nu numele unui angajat. Tabelul access_audit
     exista tocmai ca sa raspunda la „cine a deschis usa aia", iar daca
     deschiderile de oaspete n-ar ajunge acolo, intrebarea ar ramane fara
     raspuns exact in cazurile care conteaza. */
  const actor = `oaspete (${poarta.reservationId})`;
  const jurnal = async (r: Record<string, unknown>) => {
    // Auditul nu are voie sa rastoarne operatiunea pe care o descrie.
    try { await admin.from("access_audit").insert(r); } catch { /* ignorat */ }
  };

  try {
    await api.deschideUsa(String(poarta.lockId));
  } catch (e) {
    await jurnal({
      actor, action: "deschidere din guest app", result: "error",
      reservation_id: poarta.reservationId, room_id: poarta.roomId,
      provider: numeFurnizor, lock_id: poarta.lockId,
      detail: String((e as Error).message).slice(0, 300),
    });
    return raspuns({
      ok: false,
      error: "Ușa n-a răspuns. Mai încearcă o dată sau folosește codul de acces.",
    }, 502);
  }

  await jurnal({
    actor, action: "deschidere din guest app", result: "ok",
    reservation_id: poarta.reservationId, room_id: poarta.roomId,
    provider: numeFurnizor, lock_id: poarta.lockId,
  });

  /* Nici lockId, nici roomId inapoi: oaspetelui ii trebuie sa stie ca s-a
     deschis, nu cu ce s-a deschis. */
  return raspuns({ ok: true });
});
