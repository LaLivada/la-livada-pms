/* Schimbari LIVE — ce face aplicatia cu un eveniment Realtime (faza 2, A6 +
 * B3 din docs/audit-2026-09.md; designul in docs/faza2.md §3).
 *
 * Supabase trimite, pentru fiecare rand scris in `reservations` sau
 * `room_status`, un eveniment { tip: INSERT | UPDATE | DELETE, nou, vechi }.
 * Aici e logica PURA de aplicare a lui peste starea din browser — fara
 * retea, fara React, testata in src/schimbari-live.test.js. Abonarea
 * propriu-zisa e in src/data/live.js, legarea in pms-app.jsx.
 *
 * Doua reguli tin totul consecvent:
 *   - un eveniment se aplica dupa id: inlocuieste randul cu acelasi id sau
 *     il adauga; DELETE il scoate. Un rand necunoscut (din afara ferestrei
 *     incarcate) se adauga — acum e cunoscut;
 *   - un eveniment MAI VECHI decat ce e deja in browser nu se aplica
 *     (`updated_at` / `changed_at`). Evenimentele vin in ordinea commit-ului,
 *     dar pot ajunge DUPA o reincarcare care le continea deja, sau in timp ce
 *     o salvare proprie tocmai a pus stampila noua. Fara regula asta, un
 *     eveniment intarziat ar da ecranul inapoi cu cateva secunde.
 */
import { camelRes, camelOcupare, camelBlocaj, camelStatusCamera } from "../data/mapari.js";

const ms = (t) => { const n = Date.parse(t ?? ""); return Number.isNaN(n) ? null : n; };

/* Adevarat cand `nou` (ISO) e strict mai vechi decat `existent` (ISO). Fara
   una din stampile nu se poate compara — se aplica. */
export function esteMaiVechi(nou, existent) {
  const a = ms(nou), b = ms(existent);
  return a != null && b != null && a < b;
}

/* Inlocuieste randul cu acelasi id (pe pozitia lui), sau il adauga la coada. */
function pune(lista, rand) {
  const i = lista.findIndex((x) => x.id === rand.id);
  if (i < 0) return [...lista, rand];
  const copie = lista.slice(); copie[i] = rand; return copie;
}

/* Rezervari si blocaje: ambele sunt randuri din `reservations` (blocajul are
   source = 'blocaj'), dar aplicatia le tine in doua liste. Intoarce ACEEASI
   stare (identitate) cand nu e nimic de schimbat, ca React sa nu redeseneze.
   `doarOcupare`: camerista primeste vederea fara nume (camelOcupare). */
export function aplicaSchimbareRezervare(stare, ev, doarOcupare = false) {
  const reservations = stare.reservations || [], blocks = stare.blocks || [];
  const id = ev?.tip === "DELETE" ? ev.vechi?.id : ev?.nou?.id;
  if (!id) return stare;
  const existent = reservations.find((r) => r.id === id);
  if (ev.tip === "DELETE") {
    if (!existent && !blocks.some((b) => b.id === id)) return stare;
    return { reservations: reservations.filter((r) => r.id !== id), blocks: blocks.filter((b) => b.id !== id) };
  }
  if (existent && esteMaiVechi(ev.nou.updated_at, existent.updatedAt)) return stare;
  if (ev.nou.source === "blocaj") {
    return { reservations: reservations.filter((r) => r.id !== id), blocks: pune(blocks, camelBlocaj(ev.nou)) };
  }
  const rand = doarOcupare ? camelOcupare(ev.nou) : camelRes(ev.nou);
  return { reservations: pune(reservations, rand), blocks: blocks.filter((b) => b.id !== id) };
}

/* Ce trebuie adus din baza ca rezervarea abia sosita sa se poata desena:
   oaspetele si grupul ei, daca nu sunt in browser. `core.guests` e un cache
   partial (docs/faza1.md, 2.4), deci o rezervare facuta de pe alta tableta
   vine de obicei cu un oaspete necunoscut aici. */
export function ceLipseste(rand, { guests = [], groups = [] } = {}) {
  const guestIds = rand?.guestId && !guests.some((g) => g.id === rand.guestId) ? [rand.guestId] : [];
  const groupIds = rand?.groupId && !groups.some((g) => g.id === rand.groupId) ? [rand.groupId] : [];
  return { guestIds, groupIds };
}

/* Statusul de curatenie: harta { roomId: { status, updatedAt, deCine } }. */
export function aplicaSchimbareStatusCamera(hk, ev) {
  const stare = hk || {};
  const id = ev?.tip === "DELETE" ? ev.vechi?.room_id : ev?.nou?.room_id;
  if (!id) return stare;
  if (ev.tip === "DELETE") {
    if (!(id in stare)) return stare;
    const rest = { ...stare }; delete rest[id]; return rest;
  }
  if (stare[id] && esteMaiVechi(ev.nou.changed_at, stare[id].updatedAt)) return stare;
  return { ...stare, [id]: camelStatusCamera(ev.nou) };
}

/* Cat asteapta aplicatia prima abonare inainte sa porneasca oricum, fara
   live. O abonare dureaza de obicei sub o secunda; daca Realtime nu raspunde,
   receptia nu poate sta cu skeleton-ul pe ecran. */
export const ASTEPTARE_CANAL_MS = 4000;

/* Starea canalului, tradusa in ce are de facut aplicatia:
 *   "porneste"  — incarcarea initiala poate porni (o singura data);
 *   "reincarca" — trebuie reincarcat tot din baza;
 *   null        — nimic.
 *
 * Un canal Realtime trece prin SUBSCRIBED, iar la o intrerupere (tableta in
 * buzunar, 4G cazut) prin CHANNEL_ERROR / TIMED_OUT / CLOSED si apoi, dupa
 * reconectare, din nou prin SUBSCRIBED. Evenimentele din pauza s-au pierdut
 * — nu exista replay — deci orice SUBSCRIBED venit DUPA ce incarcarea a
 * pornit inseamna reincarcare: fie e o re-abonare dupa o intrerupere, fie
 * prima abonare a intarziat si aplicatia a pornit fara ea ("asteptare",
 * CHANNEL_ERROR, TIMED_OUT). Prima abonare venita la timp doar porneste
 * incarcarea — snapshot-ul se ia cu canalul deja deschis, deci nu ramane
 * nicio gaura intre el si primul eveniment. */
export function urmaritorAbonament() {
  let pornit = false;
  return (stare) => {
    if (stare === "SUBSCRIBED") {
      if (pornit) return "reincarca";
      pornit = true; return "porneste";
    }
    if (stare === "asteptare" || stare === "CHANNEL_ERROR" || stare === "TIMED_OUT") {
      if (pornit) return null;
      pornit = true; return "porneste";
    }
    return null;
  };
}

/* Coada de evenimente din timpul unei incarcari. Cat timp `loadAll` e pe
   drum, un eveniment aplicat peste starea VECHE ar fi sters de rezultatul
   incarcarii (care inlocuieste listele intregi). Asa ca evenimentele se tin
   deoparte si se REJOACA peste starea proaspata: cele deja cuprinse in
   snapshot sunt inofensive (acelasi rand, aceeasi stampila — vezi regula
   „mai vechi nu se aplica"), cele de dupa snapshot il aduc la zi. */
export function coadaEvenimente() {
  let coada = null;
  return {
    /* Intoarce true daca evenimentul a fost pus deoparte (deci NU trebuie
       aplicat acum). */
    retine(ev) { if (!coada) return false; coada.push(ev); return true; },
    incepe() { coada = []; },
    /* Goleste coada si o intoarce, in ordinea sosirii. */
    termina() { const c = coada || []; coada = null; return c; },
    get inCurs() { return coada != null; },
  };
}
