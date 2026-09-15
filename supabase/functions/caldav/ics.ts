/* iCalendar, atat cat ne trebuie serverului CalDAV (15 septembrie 2026):
 * desfacerea liniilor, proprietati si componente, momente (UTC, fus IANA,
 * toata ziua), rezumatul unui obiect (UID, titlu, inceput, sfarsit) si
 * impartirea unui calendar exportat in obiecte per UID, pentru import.
 *
 * Fara Deno.*, ca sa se testeze din vitest (src/caldav-ics.test.js). Nu e
 * o biblioteca iCalendar completa: obiectele se pastreaza in baza exact
 * cum le trimite telefonul, iar de aici iau doar campurile de indexare.
 */

export const FUS_IMPLICIT = "Europe/Bucharest";

/* Liniile lungi sunt „impaturite": continuarea incepe cu spatiu sau tab. */
export function liniiDesfacute(text: string): string[] {
  const out: string[] = [];
  for (const l of text.replace(/\r\n?/g, "\n").split("\n")) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && out.length) out[out.length - 1] += l.slice(1);
    else if (l.length) out.push(l);
  }
  return out;
}

export interface Proprietate { nume: string; params: Record<string, string>; valoare: string }

function despartInAfaraGhilimelelor(text: string, sep: string): string[] {
  const parti: string[] = [];
  let cur = "";
  let inGhilimele = false;
  for (const c of text) {
    if (c === '"') { inGhilimele = !inGhilimele; cur += c; }
    else if (c === sep && !inGhilimele) { parti.push(cur); cur = ""; }
    else cur += c;
  }
  parti.push(cur);
  return parti;
}

/* `DTSTART;TZID=Europe/Bucharest:20260915T180000` → nume, parametri, valoare.
   Doua puncte din interiorul ghilimelelor (`CN="a:b"`) nu despart. */
export function parseazaLinie(linie: string): Proprietate | null {
  let inGhilimele = false;
  let i = 0;
  for (; i < linie.length; i++) {
    const c = linie[i];
    if (c === '"') inGhilimele = !inGhilimele;
    else if (c === ":" && !inGhilimele) break;
  }
  if (i >= linie.length) return null;
  const [numeBrut, ...paramsBruti] = despartInAfaraGhilimelelor(linie.slice(0, i), ";");
  const nume = numeBrut.trim().toUpperCase();
  if (!nume) return null;
  const params: Record<string, string> = {};
  for (const p of paramsBruti) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { nume, params, valoare: linie.slice(i + 1) };
}

export function dezescapeaza(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

export interface Componenta { tip: string; props: Proprietate[]; copii: Componenta[] }

export function parseazaICS(text: string): Componenta | null {
  const stiva: Componenta[] = [];
  let radacina: Componenta | null = null;
  for (const l of liniiDesfacute(text)) {
    const p = parseazaLinie(l);
    if (!p) continue;
    if (p.nume === "BEGIN") {
      const c: Componenta = { tip: p.valoare.trim().toUpperCase(), props: [], copii: [] };
      if (stiva.length) stiva[stiva.length - 1].copii.push(c);
      else if (!radacina) radacina = c;
      stiva.push(c);
    } else if (p.nume === "END") {
      stiva.pop();
    } else if (stiva.length) {
      stiva[stiva.length - 1].props.push(p);
    }
  }
  return radacina;
}

export const prop = (c: Componenta, nume: string): Proprietate | null => c.props.find((p) => p.nume === nume) ?? null;
export const valoare = (c: Componenta, nume: string): string | null => prop(c, nume)?.valoare ?? null;

/* ---------- timp ---------- */

function oraDePereteCaUtc(ms: number, fus: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: fus, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
}

export function fusValid(fus: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: fus }); return true; } catch { return false; }
}

/* Ora de perete dintr-un fus IANA → momentul UTC. Doua treceri: prima
   ghiceste decalajul la momentul „ca si cum ar fi UTC", a doua il corecteaza
   daca ghicirea a cazut peste o schimbare de ora. */
export function instantDinLocal(an: number, luna: number, zi: number, ora: number, minut: number, secunda: number, fus: string): Date {
  const f = fusValid(fus) ? fus : FUS_IMPLICIT;
  const dorit = Date.UTC(an, luna - 1, zi, ora, minut, secunda);
  let t = dorit - (oraDePereteCaUtc(dorit, f) - dorit);
  const dif = oraDePereteCaUtc(t, f) - dorit;
  if (dif !== 0) t -= dif;
  return new Date(t);
}

export interface Moment { data: Date; toataZiua: boolean }

/* DTSTART/DTEND/RECURRENCE-ID: `20260915` (toata ziua, in fusul pensiunii),
   `20260915T160000Z` (UTC), `20260915T180000` (fara Z: fusul din TZID, sau
   al pensiunii cand lipseste). */
export function momentDin(p: Proprietate): Moment | null {
  const v = p.valoare.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if ((p.params.VALUE || "").toUpperCase() === "DATE" || m) {
    if (!m) return null;
    return { data: instantDinLocal(+m[1], +m[2], +m[3], 0, 0, 0, FUS_IMPLICIT), toataZiua: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const s = m[6] ? +m[6] : 0;
  if (m[7]) return { data: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], s)), toataZiua: false };
  return { data: instantDinLocal(+m[1], +m[2], +m[3], +m[4], +m[5], s, p.params.TZID || FUS_IMPLICIT), toataZiua: false };
}

/* `P1D`, `PT2H30M`, `P1W`, `-PT15M` → milisecunde. */
export function durataMs(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const s = (+(m[2] || 0)) * 7 * 86400 + (+(m[3] || 0)) * 86400 + (+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0));
  return (m[1] === "-" ? -1 : 1) * s * 1000;
}

/* ---------- rezumatul unui obiect (un UID, eventual cu exceptii) ---------- */

export interface RezumatObiect {
  uid: string | null;
  titlu: string;
  locatie: string | null;
  incepe: Date | null;
  seTermina: Date | null;
  toataZiua: boolean;
  recurent: boolean;
  rrule: string | null;
  evenimente: number;
}

export function rezumaObiect(text: string): RezumatObiect | null {
  const cal = parseazaICS(text);
  if (!cal || cal.tip !== "VCALENDAR") return null;
  const evenimente = cal.copii.filter((c) => c.tip === "VEVENT");
  if (!evenimente.length) return null;
  /* Instanta „mama" a unei serii nu are RECURRENCE-ID; exceptiile o au. */
  const principal = evenimente.find((e) => !prop(e, "RECURRENCE-ID")) ?? evenimente[0];
  const start = (() => { const p = prop(principal, "DTSTART"); return p ? momentDin(p) : null; })();
  let seTermina: Date | null = null;
  const dtend = prop(principal, "DTEND");
  const durata = prop(principal, "DURATION");
  if (dtend) seTermina = momentDin(dtend)?.data ?? null;
  else if (durata && start) {
    const ms = durataMs(durata.valoare);
    seTermina = ms == null ? null : new Date(start.data.getTime() + ms);
  } else if (start) {
    /* Fara sfarsit: o zi intreaga pentru cele pe zile, altfel un moment. */
    seTermina = start.toataZiua ? new Date(start.data.getTime() + 86_400_000) : start.data;
  }
  const rrule = valoare(principal, "RRULE");
  return {
    uid: (valoare(principal, "UID") || "").trim() || null,
    titlu: dezescapeaza(valoare(principal, "SUMMARY") || "").trim(),
    locatie: (() => { const l = valoare(principal, "LOCATION"); return l ? dezescapeaza(l).trim() || null : null; })(),
    incepe: start?.data ?? null,
    seTermina,
    toataZiua: start?.toataZiua ?? false,
    recurent: !!rrule || evenimente.some((e) => prop(e, "RDATE")),
    rrule,
    evenimente: evenimente.length,
  };
}

export type Validare = { ok: true; uid: string; rezumat: RezumatObiect } | { ok: false; motiv: string };

/* Ce accepta un PUT: un VCALENDAR cu cel putin un VEVENT, toate cu acelasi
   UID (o resursa = un eveniment, cu exceptiile lui). */
export function valideazaObiect(text: string): Validare {
  const cal = parseazaICS(text);
  if (!cal || cal.tip !== "VCALENDAR") return { ok: false, motiv: "Lipsește VCALENDAR." };
  const ev = cal.copii.filter((c) => c.tip === "VEVENT");
  if (!ev.length) return { ok: false, motiv: "Fără VEVENT: calendarul primește doar evenimente." };
  const uids = new Set(ev.map((e) => (valoare(e, "UID") || "").trim()));
  if (uids.size !== 1 || uids.has("")) return { ok: false, motiv: "O resursă are un singur UID." };
  const rezumat = rezumaObiect(text);
  if (!rezumat) return { ok: false, motiv: "Nu am putut citi evenimentul." };
  return { ok: true, uid: [...uids][0], rezumat };
}

/* ---------- import: un calendar exportat → obiecte per UID ---------- */

export interface ObiectImportat { uid: string; ics: string }

/* Lucreaza pe liniile brute (impaturite cum au venit), ca textul fiecarui
   eveniment sa ramana identic cu exportul. VTIMEZONE-urile se copiaza in
   fiecare obiect; VTODO si restul se lasa deoparte. */
export function imparteInObiecte(text: string): ObiectImportat[] {
  const linii = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.length);
  const antet: string[] = [];
  const fusuri: string[] = [];
  const perUid = new Map<string, string[]>();
  let adancime = 0;
  let bloc: string[] | null = null;
  let ultimaAntet = false;
  let faraUid = 0;
  const inchideBloc = () => {
    if (!bloc) return;
    const tip = bloc[0].slice(6).trim().toUpperCase();
    if (tip === "VTIMEZONE") fusuri.push(...bloc);
    else if (tip === "VEVENT") {
      const uidProp = liniiDesfacute(bloc.join("\n")).map(parseazaLinie).find((p) => p && p.nume === "UID");
      const uid = (uidProp?.valoare || "").trim() || `fara-uid-${++faraUid}`;
      perUid.set(uid, [...(perUid.get(uid) ?? []), ...bloc]);
    }
    bloc = null;
  };
  for (const l of linii) {
    const sus = l.toUpperCase();
    if (sus.startsWith("BEGIN:")) {
      adancime++;
      if (adancime === 2) bloc = [l];
      else if (adancime > 2 && bloc) bloc.push(l);
      ultimaAntet = false;
      continue;
    }
    if (sus.startsWith("END:")) {
      if (adancime === 2) { bloc?.push(l); inchideBloc(); }
      else if (adancime > 2 && bloc) bloc.push(l);
      adancime = Math.max(0, adancime - 1);
      ultimaAntet = false;
      continue;
    }
    if (adancime === 1) {
      if (/^(VERSION|PRODID|CALSCALE)[;:]/i.test(l)) { antet.push(l); ultimaAntet = true; }
      else if ((l.startsWith(" ") || l.startsWith("\t")) && ultimaAntet) antet.push(l);
      else ultimaAntet = false;
    } else if (adancime >= 2 && bloc) {
      bloc.push(l);
    }
  }
  const cap = antet.length ? antet : ["VERSION:2.0", "PRODID:-//La Livada PMS//CalDAV//RO"];
  return [...perUid].map(([uid, liniiUid]) => ({
    uid,
    ics: ["BEGIN:VCALENDAR", ...cap, ...fusuri, ...liniiUid, "END:VCALENDAR"].join("\r\n") + "\r\n",
  }));
}

export function numeCalendar(text: string): string | null {
  for (const l of liniiDesfacute(text)) {
    const p = parseazaLinie(l);
    if (p && p.nume === "X-WR-CALNAME") return dezescapeaza(p.valoare).trim() || null;
  }
  return null;
}

export function culoareCalendar(text: string): string | null {
  for (const l of liniiDesfacute(text)) {
    const p = parseazaLinie(l);
    if (p && p.nume === "X-APPLE-CALENDAR-COLOR") return p.valoare.trim() || null;
  }
  return null;
}
