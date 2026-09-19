// @ts-check
/* Acces la date pentru televizoarele din camere (Samsung LYNK Cloud).
 *
 * Aceeasi asimetrie ca la acces.js si dispozitive.js, si tot deliberata: de
 * aici se CITESTE starea si se ADMINISTREAZA maparea pe camere (doar
 * adminul, prin RLS), dar scrierea propriu-zisa pe un televizor trece prin
 * Edge Function-ul `tv-provider`. Credentialele contului LYNK administreaza
 * toate televizoarele proprietatii si n-au ce cauta intr-un bundle de browser.
 *
 * Jurnalul (`tv_messages`) e doar-citire pentru oricine: il scrie exclusiv
 * functia edge, cu service_role.
 */
import { supabase } from "../supabase.js";
import { loadShared, saveShared, K } from "./stare-partajata.js";
import { normalizeazaSetari } from "../lib/tv.js";

/* Toate televizoarele, in forma de care are nevoie ecranul. Cele nemapate
   (fara camera) vin si ele: sunt aparate descoperite la sincronizare, care
   asteapta sa fie legate de o camera. */
export async function toateTelevizoarele() {
  const { data, error } = await supabase.from("tv_devices")
    .select("*, rooms(name)")
    .order("room_id", { nullsFirst: false }).order("name");
  if (error) throw error;
  return (data || []).map(catreEcran);
}

function catreEcran(t) {
  return {
    id: t.id,
    idLynk: t.provider_device_id,
    furnizor: t.provider,
    /* Un televizor salvat cu provider='simulare' NU e legat de niciun aparat
       real. Ecranul trebuie s-o spuna la vedere: altfel receptia ar crede ca
       oaspetii sunt intampinati pe ecrane care de fapt n-au primit nimic. */
    simulat: t.provider === "simulare",
    nume: t.name,
    model: t.model,
    activ: t.enabled,
    cameraId: t.room_id,
    camera: t.rooms?.name || null,
    online: t.last_status?.online === true,
    /* Propunerea de cameră din contul LYNK, cand o da. Nu leaga nimic singura
       — e doar un ajutor la mapare. */
    sugestieCamera: t.last_status?.roomHint || null,
    mesaj: t.last_message,
    mesajLa: t.last_message_at,
    rezervareId: t.last_reservation_id,
    vazutLa: t.last_seen_at,
  };
}

/* Leaga un televizor de o cameră, sau il dezleaga (`null`).
 *
 * E singura operatie din ecran cu consecinta vizibila in camera altcuiva: un
 * televizor pus pe camera gresita scrie numele unui oaspete pe ecranul
 * altuia. De-aia o poate face doar adminul (RLS), iar ecranul cere confirmare
 * cand camera aleasa are deja alt televizor. */
export async function mapeazaCamera(id, cameraId) {
  const { error } = await supabase.from("tv_devices")
    .update({ room_id: cameraId || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function comutaActiv(id, activ) {
  const { error } = await supabase.from("tv_devices")
    .update({ enabled: activ, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* Sterge un televizor din PMS. Nu-l sterge din contul LYNK — o sincronizare
   ulterioara il aduce inapoi, nemapat. Folositor cand un aparat a fost scos
   din pensiune, sau cand maparea trebuie luata de la zero. */
export async function stergeTelevizor(id) {
  const { error } = await supabase.from("tv_devices").delete().eq("id", id);
  if (error) throw error;
}

/* Ultimele mesaje, pentru ecranul de istoric. Ca la `comenziRecente`, o
   eroare de citire nu darama ecranul: istoricul e util, nu vital. */
export async function mesajeRecente(limita = 100) {
  const { data, error } = await supabase.from("tv_messages")
    .select("*").order("at", { ascending: false }).limit(limita);
  if (error) return [];
  return data || [];
}

/* Setarile integrarii. Forma si valorile implicite vin din lib/tv.js, aceleasi
   pe care le foloseste si functia edge. */
export async function setariTv() {
  return normalizeazaSetari(await loadShared(K.tv, {}));
}

/* Scrie doar adminul (politica RLS pe `app_state`, vezi migratia). Un
   receptioner primeste eroare de la Postgres, nu o salvare tacuta care nu
   schimba nimic. */
export async function salveazaSetariTv(setari) {
  await saveShared(K.tv, normalizeazaSetari(setari));
}

/* Apelul catre functia edge. Ca `cheamaDispozitiv` si `cheamaAcces`, nu
   arunca NICIODATA: un mesaj de bun venit n-are voie sa darame un check-in. */
export async function cheamaTv(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("tv-provider", {
      body: { action, ...payload },
    });
    if (error) {
      /* invoke() marcheaza ca eroare orice status non-2xx, dar corpul are
         mesajul nostru — il preferam celui generic al bibliotecii. */
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };

      /* FUNCTIA NU E PUBLICATA PE PROIECT.
       *
       * Un 404 FARA campul nostru `error` in corp vine de la poarta Supabase,
       * nu din functie: functia raspunde si la 404 tot cu `{ ok, error }` (o
       * rezervare negasita, de exemplu), iar ala e prins deja mai sus.
       *
       * Se deosebeste fiindca e singurul esec despre care receptia n-are
       * absolut nimic de facut, si fiindca e starea normala a intervalului
       * dintre publicarea frontendului (Vercel, la fiecare merge in main) si
       * cea a functiei edge (manuala). Vezi MOTIVE_TACUTE in lib/tv.js. */
      if (error.context?.status === 404) {
        return {
          ok: false, reason: "nepublicat",
          error: "Serviciul de televizoare nu e publicat pe proiect (funcția `tv-provider`).",
        };
      }

      const retea = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: retea
          ? "Nu am putut contacta serviciul de televizoare. Verifică conexiunea și încearcă din nou."
          : (error.message || "Serviciul de televizoare a răspuns cu eroare."),
      };
    }
    return data || { ok: false, error: "Răspuns gol de la serviciul de televizoare." };
  } catch (e) {
    return { ok: false, error: e?.message || "Serviciul de televizoare nu a răspuns." };
  }
}
