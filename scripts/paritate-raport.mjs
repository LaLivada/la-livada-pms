/* Paritate JS <-> SQL pentru raportul lunar (docs/faza1.md, §2.5).
 *
 * `statisticiLuna` + `statisticiProtocol` (src/lib/rapoarte.js) sunt
 * REFERINTA; `raport_luna` (schema.sql) trebuie sa dea aceleasi cifre. Scriptul
 * ruleaza referinta pe un export din baza si tipareste, pentru fiecare luna
 * ceruta, exact forma pe care o intoarce SQL-ul — de pus alaturi de
 * `select raport_luna(an, luna)`.
 *
 *   TZ=Europe/Bucharest node scripts/paritate-raport.mjs export.json [inca-un.json ...] -- 2026-08 2026-09
 *
 * TZ conteaza: JS-ul taie zilele la miezul noptii LOCAL (asa face browserul
 * receptiei), SQL-ul in Europe/Bucharest explicit. Rulat in alt fus, JS-ul ar
 * da alte nopti si paritatea ar pica din cauza scriptului, nu a bazei.
 *
 * Exportul (rulat in SQL Editor, ca postgres — RLS nu conteaza acolo):
 *
 *   select jsonb_build_object(
 *     'rooms', (select jsonb_agg(jsonb_build_object('id', id, 'type', type)) from rooms),
 *     'reservations', (select jsonb_agg(jsonb_build_array(id, room_id, checkin, checkout,
 *        status, source, price_override, booked_price) order by checkin)
 *        from reservations where source is distinct from 'blocaj'));
 *
 * Mai multe fisiere se lipesc (camerele din primul, rezervarile din toate):
 * asa se adauga o luna de fixture peste datele reale.
 */
import { readFileSync } from "node:fs";
import { statisticiLuna, statisticiProtocol } from "../src/lib/rapoarte.js";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const fisiere = sep < 0 ? argv.slice(0, 1) : argv.slice(0, sep);
const luni = sep < 0 ? argv.slice(1) : argv.slice(sep + 1);
if (!fisiere.length || !luni.length) {
  console.error("Folosire: node scripts/paritate-raport.mjs export.json [...] -- 2026-09 [...]");
  process.exit(2);
}

const seturi = fisiere.map((f) => JSON.parse(readFileSync(f, "utf8")));
const core = { rooms: (seturi[0].rooms || []).map((r) => ({ id: r.id, type: r.type })), rates: { base: {}, seasons: [] } };
const rezervari = seturi.flatMap((s) => s.reservations || []).map(
  ([id, roomId, checkin, checkout, status, source, priceOverride, bookedPrice]) =>
    ({ id, roomId, checkin, checkout, status, source, priceOverride, bookedPrice }));

const r2 = (v) => Math.round(v * 100) / 100;
for (const l of luni) {
  const [an, luna] = l.split("-").map(Number);
  const de = new Date(an, luna - 1, 1);
  const s = statisticiLuna(rezervari, core, de);
  const p = statisticiProtocol(rezervari, core, de);
  console.log(JSON.stringify({
    luna: l,
    roomNights: s.roomNights, revenue: r2(s.revenue), capacity: s.capacity,
    byType: s.byType.map((t) => ({ type: t.type, nights: t.nights, cap: t.cap })),
    bySource: s.bySource.map((x) => ({ key: x.key, count: x.count, rev: r2(x.rev) })),
    perDay: s.perDay.filter((d) => d.occ || d.rev).map((d) => [d.day, d.occ, r2(d.rev)]),
    protocol: { count: p.count, nights: p.nights, value: r2(p.value) },
  }));
}
