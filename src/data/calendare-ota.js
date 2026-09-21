// @ts-check
/* Adresele .ics de IMPORT, per camera si per OTA.
 *
 * Asimetria e aceeasi ca la dispozitive: de aici se administreaza
 * configurarea (adminul, prin RLS), dar citirea feedurilor si scrierea
 * rezervarilor le face functia edge `ical-import`, chemata de pg_cron. Nimic
 * din ecran nu declanseaza un import — o adresa salvata acum e citita la
 * urmatorul ciclu, in cel mult un sfert de ora.
 *
 * Sensul invers (PMS → OTA) n-are nevoie de nimic aici: `ical-feed` publica
 * deja un .ics per camera, iar adresa lui se compune din `rooms.ical_token`.
 */
import { supabase } from "../supabase.js";

export async function calendareleCamerei(roomId) {
  const { data, error } = await supabase.from("camere_calendare_ota")
    .select("id, ota, eticheta, url_ics, activ, ultima_sincronizare, ultima_eroare, erori_consecutive")
    .eq("room_id", roomId)
    .order("eticheta");
  if (error) throw error;
  return (data || []).map((c) => ({
    id: c.id, ota: c.ota, eticheta: c.eticheta, url: c.url_ics, activ: c.activ,
    sincronizatLa: c.ultima_sincronizare, eroare: c.ultima_eroare, erori: c.erori_consecutive,
  }));
}

/* Un singur rand per (camera, OTA) — cheia unica din migratie. Re-salvarea
   aceluiasi OTA inlocuieste adresa si sterge urma ultimei erori: o adresa
   noua merita o sansa curata, altfel ecranul ar arata in continuare
   „eroare" pentru un URL care tocmai a fost corectat. */
export async function salveazaCalendarOta({ roomId, ota, eticheta, url }) {
  const { error } = await supabase.from("camere_calendare_ota")
    .upsert({
      room_id: roomId, ota, eticheta, url_ics: String(url || "").trim(),
      activ: true, ultima_eroare: null, erori_consecutive: 0,
    }, { onConflict: "room_id,ota" });
  if (error) throw error;
}

export async function stergeCalendarOta(id) {
  const { error } = await supabase.from("camere_calendare_ota").delete().eq("id", id);
  if (error) throw error;
}
