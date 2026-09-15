// @ts-check
/* Calendarul pe ani al salilor de evenimente (ecranul „Evenimente", tabul
   „Calendar pe ani"): aritmetica pura — pe ce zile cade un eveniment,
   gruparea pe zile si luni, structura lunilor unui an, textele scurte din
   lista unei zile. Fara React, fara retea.

   Zilele sunt cele de la Vaslui (FUS_HOTEL), ca peste tot in PMS
   (lib/timp.js). Functia edge stocheaza un eveniment de toata ziua ca
   miezul noptii local (DTSTART;VALUE=DATE:20270605 → 2027-06-04T21:00Z
   vara), iar unul cu ora ca moment; DTEND e EXCLUSIV in iCalendar, deci
   ultima zi e cea a lui `se_termina - 1ms` (5–7 iunie se termina pe 8 la
   00:00 si ocupa trei zile, nu patru). */
import { FUS_HOTEL, adaugaZile, dataLocala, dinPartiLocale } from "./timp.js";

export const LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
/* Saptamana incepe luni, ca in calendarul de rezervari. */
export const ZILE_SAPT_SCURT = ["L", "Ma", "Mi", "J", "V", "S", "D"];
/* Un eveniment mai lung de atat e aproape sigur o greseala de date (un DTEND
   scris cu anul gresit); nu umplem tot anul cu el. */
export const MAX_ZILE_EVENIMENT = 31;

/** @typedef {{ id: string, calendar_id: string, uid?: string | null, rezumat: string | null, incepe: string | null, se_termina: string | null, toata_ziua: boolean, recurent?: boolean }} EvenimentSala */

/** „AAAA-LL-ZZ" pentru o zi a anului. @param {number} an @param {number} luna 1-12 @param {number} zi */
export function cheieZi(an, luna, zi) {
  return `${an}-${String(luna).padStart(2, "0")}-${String(zi).padStart(2, "0")}`;
}

/** Zilele (AAAA-LL-ZZ, fusul hotelului) pe care le acopera evenimentul, in
 * ordine. Gol daca n-are inceput sau inceputul e invalid.
 * @param {EvenimentSala} ev @returns {string[]} */
export function zileleEvenimentului(ev) {
  if (!ev.incepe) return [];
  const start = new Date(ev.incepe);
  if (Number.isNaN(start.getTime())) return [];
  const prima = dataLocala(start);
  const sfarsit = ev.se_termina ? new Date(ev.se_termina).getTime() : NaN;
  const ultima = Number.isFinite(sfarsit) && sfarsit > start.getTime() ? dataLocala(sfarsit - 1) : prima;
  const zile = [prima];
  /* Pas pe zile calendaristice (adaugaZile), nu pe 24 de ore: in ziua
     schimbarii orei un pas de 24h ar sari o zi sau ar repeta-o. */
  for (let n = 1; zile[zile.length - 1] < ultima && zile.length < MAX_ZILE_EVENIMENT; n++) {
    zile.push(dataLocala(adaugaZile(start, n)));
  }
  return zile;
}

/** @param {(id: string) => number} ordineSala */
function comparaEvenimente(ordineSala) {
  /** @param {EvenimentSala} a @param {EvenimentSala} b */
  return (a, b) => (Number(b.toata_ziua) - Number(a.toata_ziua))
    || (a.incepe || "").localeCompare(b.incepe || "")
    || (ordineSala(a.calendar_id) - ordineSala(b.calendar_id))
    || (a.rezumat || "").localeCompare(b.rezumat || "", "ro");
}

/** Grupeaza pe zile evenimentele care ating anul `an`; lista fiecarei zile
 * e sortata: toata ziua intai, apoi dupa ora, apoi dupa ordinea salii, apoi
 * dupa titlu. Un eveniment de mai multe zile apare in fiecare din ele.
 * @param {EvenimentSala[]} evenimente @param {number} an
 * @param {(id: string) => number} [ordineSala]
 * @returns {Map<string, EvenimentSala[]>} */
export function grupeazaPeZile(evenimente, an, ordineSala = () => 0) {
  /** @type {Map<string, EvenimentSala[]>} */
  const peZile = new Map();
  const prefix = `${an}-`;
  for (const ev of evenimente) {
    for (const zi of zileleEvenimentului(ev)) {
      if (!zi.startsWith(prefix)) continue;
      const lista = peZile.get(zi);
      if (lista) lista.push(ev); else peZile.set(zi, [ev]);
    }
  }
  const compara = comparaEvenimente(ordineSala);
  for (const lista of peZile.values()) lista.sort(compara);
  return peZile;
}

/** La TOTALURI (anul, luna, sala din legenda) intra doar evenimentele de
 * toata ziua — adica nuntile, botezurile, zilele tinute de cineva. Cele cu
 * doar interval orar (o degustare, o vizita, o intalnire) se vad in
 * calendar, dar nu umfla numerele: altfel „34 de evenimente in 2027" n-ar
 * mai insemna 34 de zile date. Ceruta pe 16 septembrie 2026.
 * @param {{ toata_ziua?: boolean }} ev @returns {boolean} */
export function intraInTotal(ev) {
  return ev?.toata_ziua === true;
}

/** Cate evenimente DISTINCTE are fiecare luna (index 0 = ianuarie): unul de
 * doua zile se numara o data in luna lui, sau o data in fiecare din cele
 * doua luni daca trece granita. Numara doar ce trece de `intraInTotal`.
 * @param {Map<string, EvenimentSala[]>} peZile @returns {number[]} */
export function numarPeLuni(peZile) {
  const seturi = Array.from({ length: 12 }, () => new Set());
  for (const [zi, lista] of peZile) {
    const luna = Number(zi.slice(5, 7)) - 1;
    for (const ev of lista) if (intraInTotal(ev)) seturi[luna].add(ev.id);
  }
  return seturi.map((s) => s.size);
}

/** Structura lunilor unui an: numele, cate zile are si cu cate casute goale
 * incepe grila (saptamana de luni). Nu depinde de fus: e calendarul in sine.
 * @param {number} an @returns {{ luna: number, nume: string, zile: number, decalaj: number }[]} */
export function luniAnului(an) {
  return LUNI.map((nume, i) => ({
    luna: i + 1,
    nume,
    zile: new Date(Date.UTC(an, i + 1, 0)).getUTCDate(),
    decalaj: (new Date(Date.UTC(an, i, 1)).getUTCDay() + 6) % 7,
  }));
}

/** Fereastra de citit din baza pentru un an: de la 31 decembrie al anului
 * trecut la 2 ianuarie al celui urmator, ora hotelului — o zi in plus de
 * fiecare parte pentru evenimentele care trec granita; filtrarea exacta pe
 * zile o face grupeazaPeZile.
 * @param {number} an @returns {{ de: string, la: string }} momente ISO */
export function fereastraAnului(an) {
  return { de: dinPartiLocale(an - 1, 12, 31).toISOString(), la: dinPartiLocale(an + 1, 1, 2).toISOString() };
}

const FMT_ZI_LUNGA = new Intl.DateTimeFormat("ro-RO", { timeZone: FUS_HOTEL, weekday: "long", day: "numeric", month: "long" });
const FMT_ZI_SCURTA = new Intl.DateTimeFormat("ro-RO", { timeZone: FUS_HOTEL, day: "numeric", month: "short" });
const FMT_ORA = new Intl.DateTimeFormat("ro-RO", { timeZone: FUS_HOTEL, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Titlul zilei alese: „sâmbătă, 5 iunie 2027". @param {string} cheie AAAA-LL-ZZ */
export function titluZi(cheie) {
  const [an, luna, zi] = cheie.split("-").map(Number);
  return `${FMT_ZI_LUNGA.format(dinPartiLocale(an, luna, zi, 12))} ${an}`;
}

/** Cand e evenimentul, pe scurt, in lista unei zile: „toată ziua",
 * „5 iun. – 7 iun.", „18:00–23:30", „31 dec. 20:00 – 1 ian. 04:00".
 * @param {EvenimentSala} ev */
export function descriereMoment(ev) {
  if (!ev.incepe) return "";
  const de = new Date(ev.incepe);
  if (Number.isNaN(de.getTime())) return "";
  const zile = zileleEvenimentului(ev);
  const la = ev.se_termina ? new Date(ev.se_termina) : null;
  const areSfarsit = la != null && !Number.isNaN(la.getTime()) && la.getTime() > de.getTime();
  if (ev.toata_ziua) {
    if (zile.length <= 1 || !areSfarsit) return "toată ziua";
    return `${FMT_ZI_SCURTA.format(de)} – ${FMT_ZI_SCURTA.format(la.getTime() - 1)}`;
  }
  if (!areSfarsit) return FMT_ORA.format(de);
  if (zile.length <= 1) return `${FMT_ORA.format(de)}–${FMT_ORA.format(la)}`;
  return `${FMT_ZI_SCURTA.format(de)} ${FMT_ORA.format(de)} – ${FMT_ZI_SCURTA.format(la)} ${FMT_ORA.format(la)}`;
}
