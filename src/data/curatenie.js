/* Acces la date pentru CURATENIE: statusul camerelor, tabelul `room_status`
 * (faza 2, A6 din docs/audit-2026-09.md; designul in docs/faza2.md §3).
 *
 * Pana pe 14 septembrie 2026 statusul statea intr-un blob JSON din
 * `app_state` (`pms:housekeeping:v3`), rescris INTREG la fiecare bifare:
 * ultimul care scria castiga, iar cine punea „curat" pe o camera trimitea de
 * fapt toate cele 16. Acum e o linie per camera — se scrie doar randul
 * camerei atinse, iar cine si cand le pune trigger-ul, nu browserul.
 *
 * Aceleasi reguli ca in restul stratului: doar cereri, iesirea in forma
 * aplicatiei ({ status, updatedAt, deCine }), erorile aruncate mai departe.
 */
import { supabase } from "../supabase.js";
import { camelStatusCamera } from "./mapari.js";

/* Randurile tabelului -> harta { roomId: { status, updatedAt, deCine } },
   forma pe care ecranele o aveau deja de la vechiul blob. */
export function mapaStatusCamere(randuri) {
  const h = {};
  for (const r of randuri || []) h[r.room_id] = camelStatusCamera(r);
  return h;
}

export async function incarcaStatusCamere() {
  const { data, error } = await supabase.from("room_status").select("*");
  if (error) throw error;
  return mapaStatusCamere(data);
}

/* Un singur rand, upsert: camera abia adaugata n-are inca rand, iar
   ecranul nu trebuie sa stie diferenta. `.select()` aduce inapoi stampila si
   semnatura puse de trigger. */
export async function scrieStatusCamera(roomId, status) {
  const { data, error } = await supabase.from("room_status")
    .upsert({ room_id: roomId, status }, { onConflict: "room_id" })
    .select().single();
  if (error) throw error;
  return camelStatusCamera(data);
}
