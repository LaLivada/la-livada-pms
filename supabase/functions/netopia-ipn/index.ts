// Primește notificarea asincronă de plată (IPN) de la NETOPIA.
//
// POST /functions/v1/netopia-ipn   application/x-www-form-urlencoded
//   env_key, data, cipher, iv
//
// DEPLOYEAZĂ CU --no-verify-jwt: NETOPIA nu trimite niciun JWT al nostru.
// Autentificarea reală e criptografică — doar cine deține certificatul
// public al comerciantului poate produce un plic pe care cheia noastră
// privată să-l decripteze la ceva coerent.
//
// Scrie payload-ul brut ÎNAINTE de orice procesare (netopia_ipn_log) —
// exact modelul access-webhook: o plată reală nu se pierde niciodată,
// chiar dacă restul logicii aruncă o eroare neprevăzută. Răspunde mereu
// 200 cu XML-ul de confirmare cerut de NETOPIA, indiferent de rezultatul
// intern, ca să nu declanșeze reîncercări pentru o eroare doar a noastră.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decripteazaDeLaNetopia, interpreteazaRaspunsIpn, raspunsAckXml } from "../../../src/lib/netopia.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NETOPIA_PRIVATE_KEY = Deno.env.get("NETOPIA_PRIVATE_KEY") || "";

function xmlRaspuns(corp: string): Response {
  return new Response(corp, { status: 200, headers: { "Content-Type": "application/xml" } });
}

/* Doar `confirmed` înseamnă bani încasați. `paid` e, în semantica API-ului
   v1, o pre-autorizare care încă așteaptă captura — dacă am confirma pe el,
   am trimite oaspetelui un email de „ai plătit" pentru o sumă care poate să
   nu fie niciodată capturată. Nefiind nici în ACTIUNI_ESUATE, `paid` cade
   singur pe ramura a treia: se consemnează, nu se atinge nimic, rezervarea
   rămâne ținută până la `confirmed` sau până expiră holdul. */
const ACTIUNI_SUCCES = new Set(["confirmed"]);
const ACTIUNI_ESUATE = new Set(["canceled", "credit"]);

/* Cât ținem auditul brut. Fără o tăiere, tabela crește la nesfârșit —
   `booking_attempts` se curăță la fel, inline, în create_public_booking. */
const ZILE_AUDIT = 180;

Deno.serve(async (req) => {
  if (req.method !== "POST") return xmlRaspuns(raspunsAckXml("Metodă nepermisă."));

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let campuri: Record<string, string>;
  try {
    campuri = Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return xmlRaspuns(raspunsAckXml("Corp de cerere invalid.", { tip: 2, cod: 400 }));
  }

  // Funcția e deployată cu --no-verify-jwt, deci scrierea în audit se
  // întâmplă înainte de orice autentificare — asta e intenționat (o plată
  // reală nu se pierde niciodată). Dar o cerere care nu are măcar forma unui
  // plic NETOPIA nu poate conține nimic de reconciliat: n-o scriem deloc,
  // altfel oricine găsește adresa poate umple tabela cu rânduri arbitrare.
  if (!campuri.env_key || !campuri.data || !campuri.cipher) {
    return xmlRaspuns(raspunsAckXml("Cerere care nu are forma unui plic NETOPIA.",
      { tip: 2, cod: 400 }));
  }

  // Auditul brut, ÎNAINTE de decriptare — dacă decriptarea sau tot restul
  // pică, rândul există oricum și poate fi reconciliat manual.
  const { data: audit } = await admin.from("netopia_ipn_log")
    .insert({ payload: JSON.stringify(campuri).slice(0, 4000) })
    .select("id").single();
  const idAudit = audit?.id;

  // Tăierea rândurilor vechi, o dată per notificare: tabela vede câteva
  // cereri pe zi, deci nu merită nici un cron, nici o condiție. Un eșec aici
  // nu are voie să schimbe răspunsul — NETOPIA trebuie să primească ACK-ul.
  try {
    await admin.from("netopia_ipn_log").delete()
      .lt("created_at", new Date(Date.now() - ZILE_AUDIT * 24 * 3600 * 1000).toISOString());
  } catch (e) {
    console.warn("netopia-ipn: curățarea auditului vechi a eșuat", e);
  }

  async function incheie(rezultat: "ok" | "eroare", detaliu: string, publicToken?: string | null) {
    if (idAudit) {
      await admin.from("netopia_ipn_log")
        .update({ rezultat, detaliu: detaliu.slice(0, 900), public_token: publicToken ?? null })
        .eq("id", idAudit);
    }
  }

  if (!NETOPIA_PRIVATE_KEY) {
    await incheie("eroare", "NETOPIA_PRIVATE_KEY nu e setată.");
    console.error("netopia-ipn: NETOPIA_PRIVATE_KEY nu e setată.");
    return xmlRaspuns(raspunsAckXml("Configurare lipsă.", { tip: 1, cod: 500 }));
  }

  let xml: string;
  try {
    xml = decripteazaDeLaNetopia(
      { envKey: campuri.env_key, data: campuri.data, cipher: campuri.cipher, iv: campuri.iv },
      NETOPIA_PRIVATE_KEY,
    );
  } catch (e) {
    await incheie("eroare", `Decriptare eșuată: ${e}`);
    console.error("netopia-ipn: decriptare eșuată", e);
    return xmlRaspuns(raspunsAckXml("Nu am putut decripta cererea.", { tip: 2, cod: 400 }));
  }

  const rasp = interpreteazaRaspunsIpn(xml);
  if (!rasp.orderId) {
    await incheie("eroare", "IPN fără order id.");
    return xmlRaspuns(raspunsAckXml("Cerere fără identificator de comandă.", { tip: 2, cod: 400 }));
  }

  const succes = rasp.codEroare === "0" && ACTIUNI_SUCCES.has(rasp.actiune || "");
  const esuat = ACTIUNI_ESUATE.has(rasp.actiune || "") || (rasp.codEroare !== "0" && rasp.codEroare !== null);

  try {
    if (succes) {
      const { data: rez, error } = await admin.rpc("confirm_card_payment", {
        p_token: rasp.orderId,
        p_ntp_id: rasp.ntpId,
        p_amount: rasp.sumaProcesata,
      });
      if (error) throw error;

      // Cele două notificări de mai jos se AȘTEAPTĂ. Un `fetch` lăsat în
      // urmă nu are nicio garanție să mai apuce să plece: izolatul Deno
      // poate fi oprit imediat după ce funcția întoarce răspunsul. Ar
      // însemna un audit care scrie „ok" exact când singurul semnal că
      // trebuie dați bani înapoi s-a pierdut în liniște. Costul e o
      // întârziere de un tur-retur HTTP, iar un eșec e prins pe loc — ACK-ul
      // pleacă oricum, mereu 200.
      if (rez?.status === "confirmed" && !rez?.repeat) {
        // Emailul de confirmare, exact cel folosit și la cash/transfer —
        // nicio șablonare nouă, doar chemarea funcției care există deja.
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/booking-email`, {
            method: "POST",
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ token: rasp.orderId }),
          });
          if (!r.ok) console.warn("netopia-ipn: emailul de confirmare nu a putut fi trimis", r.status);
        } catch (e) {
          console.warn("netopia-ipn: emailul de confirmare nu a putut fi trimis", e);
        }
      }
      if (rez?.platitDupaAnulare) {
        // Cursa descrisă la confirm_card_payment: plata a reușit după ce
        // rezervarea dispăruse deja (anulată sau expirată). Browserul
        // oaspetelui nu mai e pe pagina de anulare ca să declanșeze
        // avizul — îl trimitem noi, direct, ca Ovidiu să nu piardă banii
        // din vedere.
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/netopia-refund-notice`, {
            method: "POST",
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ token: rasp.orderId }),
          });
          if (!r.ok) console.warn("netopia-ipn: avizul de rambursare nu a putut fi trimis", r.status);
        } catch (e) {
          console.warn("netopia-ipn: avizul de rambursare nu a putut fi trimis", e);
        }
      }
      if (rez?.status === "suma_incorecta") {
        // confirm_card_payment a refuzat să confirme: suma încasată nu e cea
        // datorată. Rezervarea rămâne ținută (se eliberează singură la
        // expirarea holdului) și niciun email nu pleacă — dar banii au ajuns
        // totuși la noi, deci cazul trebuie să ajungă la un om. De-aceea
        // „eroare", nu „ok": așa se vede în netopia_ipn_log.
        await incheie("eroare",
          `Sumă incorectă: primit ${rasp.sumaProcesata}, așteptat suma totală a rezervării. Necesită verificare manuală.`,
          rasp.orderId);
      } else {
        await incheie("ok", `Plată confirmată. Acțiune: ${rasp.actiune}.`, rasp.orderId);
      }
    } else if (esuat) {
      const { error } = await admin.rpc("mark_card_payment_failed", { p_token: rasp.orderId });
      if (error) throw error;
      await incheie("ok", `Plată eșuată/anulată. Acțiune: ${rasp.actiune}, eroare: ${rasp.codEroare}.`, rasp.orderId);
    } else {
      // Acțiune necunoscută sau intermediară (ex. *_pending) — consemnăm,
      // dar nu schimbăm nimic; rezervarea rămâne ținută.
      await incheie("ok", `Acțiune neprocesată: ${rasp.actiune}, eroare: ${rasp.codEroare}.`, rasp.orderId);
    }
  } catch (e) {
    await incheie("eroare", `Procesare eșuată: ${e}`, rasp.orderId);
    console.error("netopia-ipn: procesare eșuată", e);
  }

  return xmlRaspuns(raspunsAckXml("ok"));
});
