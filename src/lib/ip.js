/* Adresa reala a clientului, pentru plafoanele de rata.
 *
 * DE CE NU `x-forwarded-for`. Antetul e scris de client, iar Cloudflare doar
 * ADAUGA la el — deci primul element, cel citit pana acum peste tot, e chiar
 * valoarea trimisa de atacator. Masurat pe productie: o cerere cu
 * „X-Forwarded-For: 198.51.100.9" ajunge la server ca
 * „198.51.100.9,86.124.62.94", iar `.split(",")[0]` intoarce exact minciuna.
 * Toate plafoanele pe IP erau ocolibile rotind antetul la fiecare cerere.
 *
 * DE CE `cf-connecting-ip`. E pus de Cloudflare si nu poate fi falsificat: o
 * cerere care il trimite singura e respinsa la margine cu 403 (error 1000),
 * deci nici nu ajunge la functie. `sb-forwarded-for` e a doua plasa —
 * falsificarea lui e ignorata in tacere, adresa reala ramane.
 *
 * Perechea din baza de date e functia `ip_client()` din schema.sql, care face
 * acelasi lucru pentru apelurile venite prin PostgREST. Se schimba impreuna.
 */
export function ipClient(req) {
  const h = req?.headers;
  if (!h) return null;
  const ip = (h.get("cf-connecting-ip") || h.get("sb-forwarded-for") || "").trim();
  return ip || null;
}
