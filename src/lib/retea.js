/* `fetch` cu limită de timp, plus regula de reîncercare.
 *
 * `fetch` singur așteaptă oricât: dacă serverul nu răspunde — o funcție
 * edge care pornește la rece, o rețea mobilă care „ține" conexiunea fără
 * să livreze nimic — butonul rămâne pe „se trimite…" la nesfârșit, iar
 * omul nu află niciodată dacă să mai aștepte sau să reîncerce. Aici
 * cererea e anulată după `ms`, iar eșecul devine o eroare cu mesaj pentru
 * om, marcată `timeout` și `retea` (ca restul eșecurilor de transport,
 * ca apelanții să le trateze la fel).
 *
 * Folosit de site-ul de rezervări și de aplicația de oaspete (src/booking,
 * src/guest), care altfel nu importă nimic din lib: fișierul e mic, deci
 * nu apasă pe bundle-urile lor, și e o singură definiție pentru amândouă.
 * Vezi docs/audit-2026-09.md, B4. */

export const TIMEOUT_IMPLICIT_MS = 15_000;
export const MESAJ_TIMEOUT = "Serverul nu a răspuns în timp util. Încearcă din nou.";

export async function fetchCuTimeout(url, optiuni = {}, ms = TIMEOUT_IMPLICIT_MS) {
  const control = new AbortController();
  const ceas = setTimeout(() => control.abort(), ms);
  try {
    return await globalThis.fetch(url, { ...optiuni, signal: control.signal });
  } catch (e) {
    if (control.signal.aborted) {
      const eroare = new Error(MESAJ_TIMEOUT);
      eroare.timeout = true;
      eroare.retea = true;
      throw eroare;
    }
    throw e;
  } finally {
    clearTimeout(ceas);
  }
}

/* O singură reîncercare, DOAR la eșec de transport (rețea căzută, timeout)
   și DOAR pentru apeluri pe care serverul le poate primi de două ori fără
   efect: citiri, sau operații idempotente prin construcție. Un răspuns de
   eroare de la server (4xx/5xx) nu se reîncearcă — e un verdict, nu o
   întrerupere. Cine apelează decide ce e sigur de reîncercat; funcția nu
   știe nimic despre ce face `apel`. */
export async function cuOReincercare(apel) {
  try {
    return await apel();
  } catch (e) {
    if (!e?.retea) throw e;
    return apel();
  }
}
