/* REZERVARI / ETICHETA „NOU DE LA ULTIMA DESCHIDERE" (faza 3, C7) — pe barele
 * din calendar, pe randurile de pe Azi si, intreaga, in capul fisei.
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { esteNoua } from "../../lib/noutati.js";

/* Eticheta „nou de la ultima deschidere" (faza 3, C7): nimic cand nu e
   cazul, ca sa se poata pune direct in JSX. Mica pe bare si pe randurile
   listelor, intreaga in capul fisei. */
export function EtichetaNou({ res, noutati, mare = false }) {
  if (!esteNoua(res, noutati)) return null;
  return mare
    ? <span className="role-tag tag-nou">Nouă de la ultima deschidere</span>
    : <span className="bar-nou" title="Nouă de la ultima deschidere">nou</span>;
}
