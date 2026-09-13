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
import { reservationTotal } from "./pricing.js";
import { SOURCES } from "./constante.js";

const ZI_MS = 86400000;

/* Prima zi a lunii cerute, la miezul nopții locale. `monthOffset` e relativ
   la luna curentă (0 = luna asta, -1 = luna trecută). */
export function inceputDeLuna(monthOffset = 0, acum = new Date()) {
  const base = new Date(acum);
  base.setDate(1); base.setHours(0, 0, 0, 0);
  base.setMonth(base.getMonth() + monthOffset);
  return base;
}

export function sfarsitDeLuna(monthStart) {
  const e = new Date(monthStart);
  e.setMonth(e.getMonth() + 1);
  return e;
}

export function zileInLuna(monthStart) {
  return Math.round((sfarsitDeLuna(monthStart) - monthStart) / ZI_MS);
}

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
    const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
    const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
    /* Cota pe noapte din prețul REAL (înghețat/manual), nu un recalcul cu
       tarifele curente — la fel ca în TodayView.revenueToday, altfel
       veniturile de aici nu s-ar potrivi cu cele din bySource. */
    const totalNights = Math.max(1, Math.round((coDay - ciDay) / ZI_MS));
    const perNight = reservationTotal(r, core) / totalNights;
    active.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime(), room: roomById.get(r.roomId), perNight });
  }

  let roomNights = 0, revenue = 0;
  const perDay = [];
  const nightsByType = { tiny: 0, loft: 0 };

  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(monthStart); d.setDate(monthStart.getDate() + i);
    const dStart = d.getTime();
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
    const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
    const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
    const totalNights = Math.max(1, Math.round((coDay - ciDay) / ZI_MS));
    const perNight = reservationTotal(r, core) / totalNights;
    for (let d = new Date(ciDay); d < coDay; d.setDate(d.getDate() + 1)) {
      if (d.getTime() >= monthStartMs && d.getTime() < monthEndMs) { nights++; value += perNight; }
    }
  }
  return { count, nights, value };
}
