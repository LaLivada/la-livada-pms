/* Când merită reîncărcate datele la revenirea pe tab.
 *
 * Aplicația n-are realtime și nici polling pe rezervări (vezi comentariul
 * de la ceasul de night audit din pms-app.jsx): ce s-a schimbat din alt
 * browser cât timp tabul ăsta a stat în fundal lipsește până la un refresh
 * manual — inclusiv camere „libere" pe care alt recepționer le-a ocupat
 * între timp. O reîncărcare la FIECARE revenire ar fi însă prea des: omul
 * comută între aplicații de zeci de ori pe oră, iar fiecare reîncărcare
 * înlocuiește starea locală și ar putea călca peste o salvare din zbor.
 *
 * Compromisul: reîncărcăm doar după o absență de cel puțin două minute —
 * destul cât să nu deranjeze, destul de scurt cât să nu lucreze nimeni pe
 * date de acum o oră. Realtime-ul (faza 2 din docs/audit-2026-09.md) va
 * face regula asta inutilă; până atunci e plasa de siguranță. */
export const PRAG_REINCARCARE_MS = 2 * 60 * 1000;

export function trebuieReincarcat(ascunsDeLaMs, acumMs, prag = PRAG_REINCARCARE_MS) {
  if (ascunsDeLaMs == null) return false;
  return acumMs - ascunsDeLaMs >= prag;
}
