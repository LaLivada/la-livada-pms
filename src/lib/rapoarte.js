/* Cifrele lunare din ecranul Rapoarte — logică pură, extrasă din ReportsView
 * (features/setari.jsx) fără nicio schimbare de comportament, ca să poată fi
 * (1) testată direct și (2) comparată cu varianta SQL (`raport_luna`) care o
 * înlocuiește în faza 1 din docs/audit-2026-09.md. La 100.000 de rezervări
 * bucla de aici n-are ce căuta în browser — dar definiția ei rămâne referința
 * pe care SQL-ul trebuie s-o respecte, cifră cu cifră (vezi rapoarte.test.js).
 *
 * Regula de noapte e aceeași cu subsolul calendarului: ziua plecării nu e
 * noapte vândută, deci o zi de rulaj (plecare + sosire) se numără o dată. */
import { isStatsEligible } from "./availability.js";
import { ziLocala, zileIntre, adaugaZile, inceputDeLuna, sfarsitDeLuna, zileInLuna } from "./timp.js";
import { reservationTotal } from "./pricing.js";
import { SOURCES, ROOM_TYPE } from "./constante.js";

/* Lunile incep la miezul noptii de la Vaslui — definitia sta in lib/timp.js
   si e re-exportata de aici pentru ecranul de rapoarte si testele lui. */
export { inceputDeLuna, sfarsitDeLuna, zileInLuna };

/* Ocupare, venit, ADR, RevPAR, pe zile, pe tip de cameră și pe sursă — dintr-o
   singură trecere: datele se parsează o dată pe rezervare, camerele se caută
   într-un Map, nopțile pe tip se adună în aceeași buclă. Rezervările protocol
   au statistica lor separată (statisticiProtocol) — nu intră aici, ca să nu
   denatureze cifrele de business cu șederi pe care nu se încasează bani. */
export function statisticiLuna(reservations, core, monthStart) {
  const monthEnd = sfarsitDeLuna(monthStart);
  const daysInMonth = zileInLuna(monthStart);
  const monthStartMs = monthStart.getTime();
  const roomById = new Map(core.rooms.map((r) => [r.id, r]));
  const active = [];
  for (const r of reservations) {
    if (!isStatsEligible(r)) continue;
    const ciMs = new Date(r.checkin).getTime();
    const coMs = new Date(r.checkout).getTime();
    if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
    const ciDay = ziLocala(ciMs), coDay = ziLocala(coMs);
    /* Cota pe noapte din prețul REAL (înghețat/manual), nu un recalcul cu
       tarifele curente — la fel ca în TodayView.revenueToday, altfel
       veniturile de aici nu s-ar potrivi cu cele din bySource. */
    const totalNights = Math.max(1, zileIntre(ciDay, coDay));
    const perNight = reservationTotal(r, core) / totalNights;
    active.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime(), room: roomById.get(r.roomId), perNight });
  }

  let roomNights = 0, revenue = 0;
  const perDay = [];
  const nightsByType = { tiny: 0, loft: 0 };

  for (let i = 0; i < daysInMonth; i++) {
    const dStart = adaugaZile(monthStart, i).getTime();
    let occ = 0, rev = 0;
    for (const e of active) {
      if (e.ciDayMs <= dStart && e.coDayMs > dStart) {
        occ++;
        if (e.room) {
          rev += e.perNight;
          if (nightsByType[e.room.type] != null) nightsByType[e.room.type]++;
        }
      }
    }
    roomNights += occ; revenue += rev;
    perDay.push({ day: i + 1, occ, rev });
  }

  const capacity = core.rooms.length * daysInMonth;
  const byType = ["tiny", "loft"].map((t) => {
    const cap = core.rooms.filter((r) => r.type === t).length * daysInMonth;
    const nights = nightsByType[t] || 0;
    return { type: t, nights, cap, pct: cap ? Math.round((nights / cap) * 100) : 0 };
  });

  const monthEndMs = monthEnd.getTime();
  const inMonth = active.filter((e) => e.ciMs < monthEndMs && e.coMs > monthStartMs);
  const totalInMonth = inMonth.length;
  const bySource = SOURCES.map((sc) => {
    const list = inMonth.filter((e) => (e.res.source || "direct") === sc.key);
    const rev = list.reduce((sum, e) => sum + reservationTotal(e.res, core), 0);
    return { ...sc, count: list.length, rev, pct: totalInMonth ? Math.round((list.length / totalInMonth) * 100) : 0 };
  }).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

  return {
    roomNights, revenue, perDay, capacity, byType, bySource,
    occupancy: capacity ? Math.round((roomNights / capacity) * 100) : 0,
    adr: roomNights ? revenue / roomNights : 0,
    revpar: capacity ? revenue / capacity : 0,
    maxOcc: Math.max(1, ...perDay.map((p) => p.occ)),
  };
}

/* Aceleași structuri ca statisticiLuna + statisticiProtocol, dar din
   răspunsul funcției SQL `raport_luna` (schema.sql), pe care ecranul o
   folosește din 13 septembrie 2026: browserul are doar fereastra de timp a
   rezervărilor, iar luna trecută începe dincolo de ea. SQL-ul întoarce doar
   agregatele brute (nopți, venit, pe zi, pe tip, pe sursă, protocol);
   procentele, ADR/RevPAR, maxOcc și etichetele surselor se pun aici, ca să
   existe o singură definiție a lor. Un răspuns lipsă dă luna goală. */
export function statisticiDinSql(raport) {
  const nr = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const perDay = (raport?.perDay || []).map((p) => ({ day: nr(p.day), occ: nr(p.occ), rev: nr(p.rev) }));
  const roomNights = nr(raport?.roomNights);
  const revenue = nr(raport?.revenue);
  const capacity = nr(raport?.capacity);
  const byType = (raport?.byType || []).map((t) => {
    const nights = nr(t.nights), cap = nr(t.cap);
    return { type: t.type, nights, cap, pct: cap ? Math.round((nights / cap) * 100) : 0 };
  });
  /* Totalul de la numitor e al TUTUROR rezervărilor care ating luna, chiar
     dacă o sursă necunoscută listei SOURCES nu apare pe ecran — ca în JS. */
  const surse = new Map((raport?.bySource || []).map((s) => [s.key, s]));
  const totalInMonth = [...surse.values()].reduce((n, s) => n + nr(s.count), 0);
  const bySource = SOURCES.map((sc) => {
    const s = surse.get(sc.key);
    const count = s ? nr(s.count) : 0;
    return { ...sc, count, rev: s ? nr(s.rev) : 0, pct: totalInMonth ? Math.round((count / totalInMonth) * 100) : 0 };
  }).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
  const p = raport?.protocol || {};
  return {
    luna: {
      roomNights, revenue, perDay, capacity, byType, bySource,
      occupancy: capacity ? Math.round((roomNights / capacity) * 100) : 0,
      adr: roomNights ? revenue / roomNights : 0,
      revpar: capacity ? revenue / capacity : 0,
      maxOcc: Math.max(1, ...perDay.map((x) => x.occ)),
    },
    protocol: { count: nr(p.count), nights: nr(p.nights), value: nr(p.value) },
  };
}

/* Statistica separată, doar pentru rezervările „protocol": număr de sejururi,
   nopți și valoarea lor (pe nopțile din lună, ca la venit), fără să se
   amestece cu cifrele de business. */
export function statisticiProtocol(reservations, core, monthStart) {
  const monthEndMs = sfarsitDeLuna(monthStart).getTime();
  const monthStartMs = monthStart.getTime();
  let count = 0, nights = 0, value = 0;
  const seen = new Set();
  for (const r of reservations) {
    if (r.status !== "protocol") continue;
    const ciMs = new Date(r.checkin).getTime();
    const coMs = new Date(r.checkout).getTime();
    if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
    if (ciMs >= monthEndMs || coMs <= monthStartMs) continue;
    if (!seen.has(r.id)) { seen.add(r.id); count++; }
    const ciDay = ziLocala(ciMs), coDay = ziLocala(coMs);
    const totalNights = Math.max(1, zileIntre(ciDay, coDay));
    const perNight = reservationTotal(r, core) / totalNights;
    for (let i = 0, d = ciDay; d < coDay; d = adaugaZile(ciDay, ++i)) {
      const t = d.getTime();
      if (t >= monthStartMs && t < monthEndMs) { nights++; value += perNight; }
    }
  }
  return { count, nights, value };
}

/* ---------------------------------------------------------------
   Delta fata de aceeasi luna a anului trecut (faza 3, C6).
   Procente pentru bani (venit, ADR, RevPAR), puncte procentuale pentru
   ocupare — „+3 pp" spune mai mult decat „+25 %" cand ocuparea a trecut
   de la 12 la 15. Semnul e pentru culoare: pentru toate patru, mai mult e
   mai bine. Minusul e cel tipografic (−), ca in restul cifrelor.
----------------------------------------------------------------*/
const semnat = (n, unitate) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unitate}`;

export function deltaFata(curent, anterior, { puncte = false } = {}) {
  const c = Number(curent) || 0, a = Number(anterior) || 0;
  if (puncte) {
    const d = Math.round(c - a);
    return { semn: Math.sign(d), text: semnat(d, " pp") };
  }
  /* Fara baza (0 anul trecut) nu exista procent: nu inventam „+∞ %". */
  if (!a) return { semn: 0, text: "—", faraBaza: true };
  const p = Math.round(((c - a) / a) * 100);
  return { semn: Math.sign(p), text: semnat(p, " %") };
}

/* Cele patru carduri. `null` cand anul trecut n-are nimic in luna aceea
   (nicio noapte, niciun leu): o luna dinaintea aplicatiei nu e „0 %", e
   necunoscuta, iar cardurile spun asta in loc sa arate +∞. */
export function deltaRaport(luna, anTrecut) {
  if (!luna || !anTrecut || (!anTrecut.roomNights && !anTrecut.revenue)) return null;
  return {
    ocupare: deltaFata(luna.occupancy, anTrecut.occupancy, { puncte: true }),
    venit: deltaFata(luna.revenue, anTrecut.revenue),
    adr: deltaFata(luna.adr, anTrecut.adr),
    revpar: deltaFata(luna.revpar, anTrecut.revpar),
  };
}

/* ---------------------------------------------------------------
   Export CSV al lunii (faza 3, C6): zilele, totalul, sursele, tipurile de
   camera, protocolul — aceleasi cifre ca pe ecran (statisticiDinSql),
   nimic recalculat. Separator „;" (Excel in romana il asteapta), un rand
   gol intre tabele, numere intregi in lei. Fara BOM aici — il pune cine
   scrie fisierul (descarcaText), ca textul sa ramana usor de testat.
----------------------------------------------------------------*/
const celula = (v) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rand = (...v) => v.map(celula).join(";");

export function csvRaport(stat, { an, luna }) {
  const { luna: l, protocol } = stat;
  const linii = [];
  linii.push(rand("luna", `${an}-${String(luna).padStart(2, "0")}`));
  linii.push("");
  linii.push(rand("zi", "camere_ocupate", "venit_lei"));
  for (const p of l.perDay) linii.push(rand(p.day, p.occ, Math.round(p.rev)));
  linii.push("");
  linii.push(rand("camere_nopti", "capacitate", "ocupare_pct", "venit_lei", "adr_lei", "revpar_lei"));
  linii.push(rand(l.roomNights, l.capacity, l.occupancy, Math.round(l.revenue), Math.round(l.adr), Math.round(l.revpar)));
  linii.push("");
  linii.push(rand("sursa", "rezervari", "venit_lei", "procent"));
  for (const s of l.bySource) linii.push(rand(s.label, s.count, Math.round(s.rev), s.pct));
  linii.push("");
  linii.push(rand("tip_camera", "camere_nopti", "capacitate", "ocupare_pct"));
  for (const t of l.byType) linii.push(rand(ROOM_TYPE[t.type]?.label || t.type, t.nights, t.cap, t.pct));
  if (protocol?.count) {
    linii.push("");
    linii.push(rand("protocol_sejururi", "protocol_nopti", "protocol_valoare_lei"));
    linii.push(rand(protocol.count, protocol.nights, Math.round(protocol.value)));
  }
  return linii.join("\n") + "\n";
}

export const numeFisierRaport = (an, luna) => `raport-${an}-${String(luna).padStart(2, "0")}.csv`;
