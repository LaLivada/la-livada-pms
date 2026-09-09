/* Acces la date pentru releele Shelly din camerele tehnice.
 *
 * Ca la acces.js, asimetria e deliberata: de aici se CITESTE starea si se
 * ADMINISTREAZA legaturile (doar adminul, prin RLS), dar comanda propriu-zisa
 * de pornit/oprit trece prin Edge Function-ul `device-provider`. Cheia de cont
 * Shelly controleaza toate releele si n-are ce cauta intr-un bundle de browser.
 */
import { supabase } from "../supabase.js";

/* MONTAJUL FIZIC.
 *
 * Camerele sunt legate cate doua la o camera tehnica, iar in fiecare camera
 * tehnica sta un Shelly Pro 4PM. Lofturile 1101 si 1102 n-au Shelly.
 *
 * Ordinea din fiecare pereche NU e decorativa: "camera 1" primeste prizele de
 * pe iesirea 3, "camera 2" pe iesirea 4. Daca ordinea se inverseaza aici,
 * butonul de prize al unei camere stinge priza vecinului. */
export const CAMERE_TEHNICE = [
  { nr: 1, camere: ["r1013", "r1011"] },
  { nr: 2, camere: ["r1009", "r1007"] },
  { nr: 3, camere: ["r1005", "r1003"] },
  { nr: 4, camere: ["r1014", "r1012"] },
  { nr: 5, camere: ["r1010", "r1008"] },
  { nr: 6, camere: ["r1006", "r1004"] },
  { nr: 7, camere: ["r1002", "r1001"] },
];

/* Cele patru iesiri ale unui Pro 4PM.
 *
 * ATENTIE LA NUMEROTARE, e sursa clasica de greseala cu unu: aplicatia Shelly
 * si eticheta de pe releu numeroteaza iesirile 1-4, dar API-ul v2 le adreseaza
 * 0-3 (`switch:0`..`switch:3`). `canal` de mai jos e NUMARUL DIN API; `iesire`
 * e ce scrie pe dispozitiv. Interfata arata `iesire`, baza pastreaza `canal`.
 *
 * `ambele: true` inseamna ca iesirea serveste amandoua camerele perechii —
 * cine o opreste lasa fara si vecinul. */
export const CANALE = [
  { canal: 0, iesire: 1, kind: "iluminat_exterior", eticheta: "Iluminat exterior", ambele: true },
  { canal: 1, iesire: 2, kind: "boiler",            eticheta: "Boiler",            ambele: true },
  { canal: 2, iesire: 3, kind: "prize",             eticheta: "Prize",             ambele: false, indexCamera: 0 },
  { canal: 3, iesire: 4, kind: "prize",             eticheta: "Prize",             ambele: false, indexCamera: 1 },
];

export const ETICHETE_KIND = {
  boiler: "Boiler",
  iluminat_exterior: "Iluminat exterior",
  prize: "Prize",
  contor: "Contor general",
  altul: "Altul",
};

/* Contorul general — un Shelly Pro 3EM care masoara consumul pe cele trei
   faze. Nu apartine niciunei camere tehnice si nu se comanda; sta in acelasi
   tabel ca releele doar fiindca tot restul (cont, apel de status, functie
   edge) e identic. */
export const KIND_CONTOR = "contor";

/* Toate dispozitivele, cu camerele pe care le servesc. Forma intoarsa e deja
   cea de care are nevoie interfata: `camere` ca lista de nume, si `partajat`
   calculat, ca sa nu recalculeze fiecare ecran aceeasi conditie. */
export async function toateDispozitivele() {
  const { data, error } = await supabase.from("devices")
    .select("*, device_rooms(room_id, rooms(name))")
    .order("provider_device_id").order("channel");
  if (error) throw error;
  return (data || []).map(catreEcran);
}

function catreEcran(d) {
  const legaturi = d.device_rooms || [];
  const camere = legaturi.map((l) => l?.rooms?.name).filter(Boolean).sort();
  return {
    id: d.id,
    idShelly: d.provider_device_id,
    canal: d.channel,
    iesire: d.channel + 1,
    kind: d.kind,
    eticheta: ETICHETE_KIND[d.kind] || d.kind,
    nume: d.name,
    activ: d.enabled,
    model: d.device_model,
    camereIds: legaturi.map((l) => l.room_id),
    camere,
    partajat: camere.length > 1,
    pornit: d.last_status?.on === true,
    online: d.last_status?.online === true,
    /* Doar contorul are asta; la relee ramane null. */
    consum: d.last_status?.consum || null,
    vazutLa: d.last_seen_at,
  };
}

/* Contorul general din lista, sau null cat timp n-a fost citit inca. */
export function contorul(dispozitive) {
  return (dispozitive || []).find((d) => d.kind === KIND_CONTOR) || null;
}

/* Dispozitivele unei camere. Un canal partajat apare la AMBELE camere ale
   perechii — nu e o dublura, e acelasi releu vazut din doua parti. */
export function dispozitivePeCamera(dispozitive, idCamera) {
  return (dispozitive || []).filter((d) => d.camereIds.includes(idCamera));
}

/* Numele celeilalte camere servite de un canal partajat, pentru avertismentul
   din interfata („comun cu 1011"). Null cand nu e partajat. */
export function vecinul(dispozitiv, numeCameraCurenta) {
  if (!dispozitiv?.partajat) return null;
  return dispozitiv.camere.find((n) => n !== numeCameraCurenta) || null;
}

/* Inregistreaza un Shelly Pro 4PM intreg: patru randuri, unul per iesire, cu
   legaturile de camera corecte. Se face intr-o singura functie, nu canal cu
   canal din interfata, tocmai fiindca greseala periculoasa e la maparea
   canal->camera, si merita scrisa o singura data. */
export async function adaugaShelly({ idShelly, nrCameraTehnica, model = null }) {
  const ct = CAMERE_TEHNICE.find((c) => c.nr === Number(nrCameraTehnica));
  if (!ct) throw new Error("Camera tehnică nu există în lista de montaj.");
  const id = String(idShelly || "").trim();
  if (!id) throw new Error("Lipsește ID-ul dispozitivului din contul Shelly.");

  const randuri = CANALE.map((c) => ({
    id: `dv-${id}-${c.canal}`,
    provider: "shelly",
    provider_device_id: id,
    device_gen: "gen2",
    device_model: model,
    kind: c.kind,
    channel: c.canal,
    name: c.eticheta,
  }));

  const { error: eDisp } = await supabase.from("devices").insert(randuri);
  if (eDisp) throw eDisp;

  const legaturi = [];
  for (const c of CANALE) {
    const idDispozitiv = `dv-${id}-${c.canal}`;
    const camere = c.ambele ? ct.camere : [ct.camere[c.indexCamera]];
    for (const idCamera of camere) {
      legaturi.push({ device_id: idDispozitiv, room_id: idCamera });
    }
  }
  const { error: eLeg } = await supabase.from("device_rooms").insert(legaturi);
  if (eLeg) {
    /* Fara legaturi, cele patru randuri sunt relee fara camera — invizibile in
       interfata si imposibil de sters de acolo. Le luam inapoi, ca reincercarea
       sa nu cada pe cheia unica. */
    await supabase.from("devices").delete().eq("provider_device_id", id);
    throw eLeg;
  }
  return id;
}

/* Sterge un Shelly intreg. `device_rooms` cade singur prin on delete cascade,
   iar `device_commands` isi pastreaza randurile: `device_id` devine null, dar
   `device_name` si `rooms` raman inghetate ca text, deci istoricul supravietuieste. */
export async function stergeShelly(idShelly) {
  const { error } = await supabase.from("devices")
    .delete().eq("provider", "shelly").eq("provider_device_id", idShelly);
  if (error) throw error;
}

export async function comutaActiv(idDispozitiv, activ) {
  const { error } = await supabase.from("devices")
    .update({ enabled: activ, updated_at: new Date().toISOString() })
    .eq("id", idDispozitiv);
  if (error) throw error;
}

/* Ultimele comenzi, pentru ecranul de istoric. */
export async function comenziRecente(limita = 100) {
  const { data, error } = await supabase.from("device_commands")
    .select("*").order("at", { ascending: false }).limit(limita);
  if (error) return [];
  return data || [];
}

/* Comanda propriu-zisa. Ca `cheamaAcces`, nu arunca niciodata: un buton de
   priza n-are voie sa darame ecranul. */
export async function cheamaDispozitiv(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("device-provider", {
      body: { action, ...payload },
    });
    if (error) {
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };
      const retea = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: retea
          ? "Nu am putut contacta serviciul de dispozitive. Verifică conexiunea și încearcă din nou."
          : (error.message || "Serviciul de dispozitive a răspuns cu eroare."),
      };
    }
    return data || { ok: false, error: "Răspuns gol de la serviciul de dispozitive." };
  } catch (e) {
    return { ok: false, error: e?.message || "Serviciul de dispozitive nu a răspuns." };
  }
}
