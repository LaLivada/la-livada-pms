// @ts-check
/* Abonarea la schimbarile din baza — Supabase Realtime, `postgres_changes`
 * (faza 2, B3 din docs/audit-2026-09.md; designul in docs/faza2.md §3).
 *
 * Un singur canal, doua tabele: `reservations` (rezervari si blocaje) si
 * `room_status`. RLS se aplica si pe flux: fiecare fila primeste doar
 * randurile pe care le-ar putea citi cu un SELECT — camerista, care n-are
 * politica de citire pe `reservations`, nu primeste nimic de acolo.
 *
 * Aici e DOAR reteaua. Ce se face cu un eveniment e in lib/schimbari-live.js
 * (pur, testat); legarea de starea aplicatiei, in pms-app.jsx. Evenimentul
 * ajunge la apelant normalizat: { tip: 'INSERT' | 'UPDATE' | 'DELETE', nou,
 * vechi } — `vechi` are doar cheia primara (replica identity default), iar
 * la DELETE `nou` e null.
 *
 * Jetonul de sesiune ajunge la Realtime automat: supabase-js il trimite pe
 * socket la fiecare schimbare de sesiune (SIGNED_IN, TOKEN_REFRESHED), deci
 * canalul trebuie doar deschis DUPA autentificare.
 */
import { supabase } from "../supabase.js";

const normalizeaza = (p) => ({
  tip: p.eventType,
  nou: p.new && Object.keys(p.new).length ? p.new : null,
  vechi: p.old && Object.keys(p.old).length ? p.old : null,
});

/* `laStare` primeste starile canalului asa cum le da supabase-js:
   SUBSCRIBED, TIMED_OUT, CHANNEL_ERROR, CLOSED — si eroarea, cand e una.
   Intoarce functia care inchide canalul. */
export function aboneazaLaSchimbari({ laRezervare, laStatusCamera, laStare }) {
  const canal = supabase.channel("pms-schimbari")
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations" },
      (p) => laRezervare?.(normalizeaza(p)))
    .on("postgres_changes", { event: "*", schema: "public", table: "room_status" },
      (p) => laStatusCamera?.(normalizeaza(p)))
    .subscribe((stare, eroare) => laStare?.(stare, eroare));
  return () => { supabase.removeChannel(canal).catch(() => {}); };
}
