/* Cât costă în browser arhitectura „încarcă tot", la 100.000 de rezervări —
 * și cât ar costa aceleași operații pe fereastra de timp propusă în faza 1
 * (rezervările deschise, plus cele închise din ultimele 30 de zile și
 * următoarele 400).
 *
 *   node --expose-gc scripts/bench/frontend.mjs [numar_rezervari]
 *
 * Rulează funcțiile REALE din src/lib și src/data pe date sintetice
 * deterministe (sintetic.mjs). Nu e un profil de React — e costul logicii
 * pure pe care ecranele o apelează, adică partea care nu se poate optimiza
 * din CSS. Rezultatele din 13 septembrie 2026 sunt în docs/faza1.md. */
import { performance } from "node:perf_hooks";
import { camelRes } from "../../src/data/mapari.js";
import { checkouturiRestante, sosiriRestante } from "../../src/lib/tranzitii.js";
import { liveReservationTotalOnline } from "../../src/lib/pricing.js";
import { occupancyForStay, isLive } from "../../src/lib/availability.js";
import { statisticiLuna, statisticiProtocol, inceputDeLuna } from "../../src/lib/rapoarte.js";
import { ultimeleOnline } from "../../src/lib/rezervari-online.js";
import { genereazaRezervari, genereazaOaspeti, CORE } from "./sintetic.mjs";

const N = Number(process.argv[2]) || 100_000;
const ACUM = new Date(2026, 8, 13, 12);
const ZI_MS = 86400000;
const DESCHISE = new Set(["pending", "confirmed", "protocol", "checkedin"]);

const gc = () => { if (globalThis.gc) globalThis.gc(); };
const mb = (b) => (b / 1048576).toFixed(1) + " MB";

/* Cel mai bun din trei rulări — cifrele de „pornire la rece" ar amesteca
   JIT-ul cu algoritmul. */
function masoara(fn, repetari = 3) {
  let best = Infinity, rezultat;
  for (let i = 0; i < repetari; i++) {
    const t0 = performance.now();
    rezultat = fn();
    best = Math.min(best, performance.now() - t0);
  }
  return { ms: best, rezultat };
}

/* Memoria: randurile brute (asa cum le tine supabase-js dupa JSON.parse)
   plus copia tradusa — exact ce sta in tab dupa loadAll. Masurata ca
   diferenta de heap intre doua colectari fortate. */
gc();
const heapInainte = process.memoryUsage().heapUsed;
const brute = genereazaRezervari(N);
const toate = brute.map(camelRes);
gc();
const heapRezervari = process.memoryUsage().heapUsed - heapInainte;

const oaspetiBruti = genereazaOaspeti(40_000);
const jsonOctetiRezervari = Buffer.byteLength(JSON.stringify(brute));
const jsonOctetiOaspeti = Buffer.byteLength(JSON.stringify(oaspetiBruti));

const fereastraDe = ACUM.getTime() - 30 * ZI_MS, fereastraPana = ACUM.getTime() + 400 * ZI_MS;
const inFereastra = toate.filter((r) => DESCHISE.has(r.status)
  || (new Date(r.checkout).getTime() >= fereastraDe && new Date(r.checkin).getTime() <= fereastraPana));

const linii = [];
const rand = (ce, tot, fer, nota = "") => linii.push({ ce, tot, fer, nota });

/* Fiecare masuratoare ruleaza pe ambele seturi: TOT (arhitectura de azi)
   si FEREASTRA (faza 1). */
function pereche(ce, fn, nota, repetari = 3) {
  const a = masoara(() => fn(toate), repetari);
  const b = masoara(() => fn(inFereastra), repetari);
  rand(ce, a.ms, b.ms, nota);
  return [a.rezultat, b.rezultat];
}

pereche("traducere camelRes la încărcare", (set) => brute.slice(0, set.length).map(camelRes).length);

/* syncTable: JSON.stringify pe fiecare rand din `after`, cautat in `before` */
pereche("diff syncTable la o salvare (o rezervare schimbată)", (set) => {
  const before = set;
  const after = set.map((r, i) => (i === 17 ? { ...r, notes: "x" } : r));
  const prevById = new Map(before.map((x) => [x.id, x]));
  return after.filter((x) => { const old = prevById.get(x.id); return !old || JSON.stringify(x) !== JSON.stringify(old); }).length;
});

pereche("night audit (tick la 60 s): checkouturi + sosiri restante", (set) =>
  checkouturiRestante(set, ACUM).length + sosiriRestante(set, ACUM).length);

pereche("calendar: bucket pe cameră (resByRoom)", (set) => {
  const map = new Map();
  for (const r of set) {
    if (!isLive(r)) continue;
    const ciMs = new Date(r.checkin).getTime(), coMs = new Date(r.checkout).getTime();
    let b = map.get(r.roomId); if (!b) { b = []; map.set(r.roomId, b); }
    b.push({ res: r, ciMs, coMs });
  }
  return map.size;
});

pereche("rapoarte: statisticiLuna + protocol (luna curentă)", (set) => {
  const luna = inceputDeLuna(0, ACUM);
  return statisticiLuna(set, CORE, luna).roomNights + statisticiProtocol(set, CORE, luna).count;
});

pereche("preț la creare: occupancyForStay pe un sejur de 3 nopți", (set) =>
  occupancyForStay(new Date(2026, 9, 10, 14), new Date(2026, 9, 13, 12), set, CORE.rooms.length, "nou"));

pereche("backfill bookedPrice: 200 rezervări „site” fără snapshot", (set) => {
  const fara = set.filter((r) => r.source === "site").slice(0, 200).map((r) => ({ ...r, bookedPrice: null }));
  return fara.reduce((s, r) => s + liveReservationTotalOnline(r, CORE, set), 0);
}, "O(n × nopți) pe fiecare rând; ×5 pentru 1.000 de rânduri importate", 1);

pereche("clienți: sejururile a 30 de oaspeți din listă", (set) => {
  let n = 0;
  for (let g = 1; g <= 30; g++) { const id = `bg${g}`; n += set.filter((r) => r.guestId === id && isLive(r)).length; }
  return n;
}, "o pagină de listă; se refac la fiecare tastă în căutare");

pereche("card „De pe site”: ultimeleOnline", (set) => ultimeleOnline(set, 5).length);

const azi = new Date(ACUM); azi.setHours(0, 0, 0, 0);
pereche("ecranul Azi: sosiri/plecări de azi", (set) => set.filter((r) => {
  const ci = new Date(r.checkin); ci.setHours(0, 0, 0, 0);
  const co = new Date(r.checkout); co.setHours(0, 0, 0, 0);
  return ci.getTime() === azi.getTime() || co.getTime() === azi.getTime();
}).length);

const fmt = (ms) => (ms < 1 ? "<1" : ms < 10 ? ms.toFixed(1) : String(Math.round(ms)));
console.log(`Rezervări: ${N.toLocaleString("ro-RO")} (${inFereastra.length.toLocaleString("ro-RO")} în fereastra −30/+400 zile) · oaspeți: 40.000\n`);
console.log(`| Ce | Tot (${N.toLocaleString("ro-RO")}) | Fereastră (${inFereastra.length.toLocaleString("ro-RO")}) | Notă |`);
console.log("|---|---:|---:|---|");
console.log(`| JSON descărcat la pornire (rezervări) | ${mb(jsonOctetiRezervari)} | ${mb(jsonOctetiRezervari * inFereastra.length / N)} | fără gzip; oaspeții (40.000) încă ${mb(jsonOctetiOaspeti)} |`);
console.log(`| memorie heap: rândurile brute + traduse | ${mb(heapRezervari)} | ${mb(heapRezervari * inFereastra.length / N)} | fără React și fără DOM |`);
for (const l of linii) console.log(`| ${l.ce} | ${fmt(l.tot)} ms | ${fmt(l.fer)} ms | ${l.nota} |`);
