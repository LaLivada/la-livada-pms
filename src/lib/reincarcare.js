// @ts-check
/* Când merită reîncărcate datele la revenirea pe tab.
 *
 * Din 14 septembrie 2026 schimbările făcute din alt browser vin prin
 * Realtime (data/live.js, lib/schimbari-live.js). Regula de aici a rămas ca
 * plasă de siguranță: un socket căzut cât timp tableta a stat în buzunar e
 * observat de heartbeat abia după câteva zeci de secunde, iar până atunci
 * ecranul ar arăta starea de la plecare — inclusiv camere „libere" pe care
 * alt recepționer le-a ocupat între timp. O reîncărcare la FIECARE revenire
 * ar fi însă prea des: omul comută între aplicații de zeci de ori pe oră,
 * iar fiecare reîncărcare înlocuiește starea locală și ar putea călca peste
 * o salvare din zbor.
 *
 * Compromisul: reîncărcăm doar după o absență de cel puțin două minute —
 * destul cât să nu deranjeze, destul de scurt cât să nu lucreze nimeni pe
 * date de acum o oră. */
export const PRAG_REINCARCARE_MS = 2 * 60 * 1000;

export function trebuieReincarcat(ascunsDeLaMs, acumMs, prag = PRAG_REINCARCARE_MS) {
  if (ascunsDeLaMs == null) return false;
  return acumMs - ascunsDeLaMs >= prag;
}
