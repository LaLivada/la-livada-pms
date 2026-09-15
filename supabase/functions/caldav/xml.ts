/* XML-ul cererilor WebDAV/CalDAV, citit cu expresii regulate pe numele
 * locale ale elementelor (prefixul de spatiu de nume difera de la un client
 * la altul: `D:prop`, `d:prop`, `prop xmlns="DAV:"`). Numele locale de care
 * avem nevoie sunt unice intre DAV:, caldav si calendarserver, deci ajunge.
 * Fara Deno.*, testat din vitest (src/caldav-servitor.test.js). */

const PREFIX = "(?:[A-Za-z_][\\w.-]*:)?";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function decodeaza(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
}

function corpElement(xml: string, local: string): string | null {
  const re = new RegExp("<" + PREFIX + local + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + PREFIX + local + "\\s*>", "i");
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function toateCorpurile(xml: string, local: string): string[] {
  const re = new RegExp("<" + PREFIX + local + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + PREFIX + local + "\\s*>", "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/* Numele local al elementului radacina: la REPORT e chiar tipul raportului
   (calendar-query, calendar-multiget, sync-collection). */
export function elementRadacina(xml: string): string | null {
  const m = /<(?!\?|!)(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w-]*)/.exec(xml);
  return m ? m[1].toLowerCase() : null;
}

/* Numele isi pastreaza literele: XML e case-sensitive, iar iOS cere
   principal-URL, schedule-inbox-URL etc. exact asa. */
function numeCopii(corp: string): string[] {
  const out: string[] = [];
  const re = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w-]*)(?:\s[^>]*)?\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corp))) out.push(m[1]);
  return [...new Set(out)];
}

/* Proprietatile cerute intr-un PROPFIND / REPORT: numele locale din primul
   <prop>; `allprop` cand clientul le vrea pe toate; [] cand nu cere nimic. */
export function propCerute(xml: string): string[] | "allprop" {
  if (new RegExp("<" + PREFIX + "allprop\\s*/?>", "i").test(xml)) return "allprop";
  const corp = corpElement(xml, "prop");
  if (corp == null) return [];
  return numeCopii(corp);
}

export function hrefuri(xml: string): string[] {
  return toateCorpurile(xml, "href").map((h) => decodeaza(h.trim())).filter(Boolean);
}

export function intervalTimp(xml: string): { start: string | null; end: string | null } | null {
  const m = new RegExp("<" + PREFIX + "time-range\\b([^>]*)/?>", "i").exec(xml);
  if (!m) return null;
  const atr = (n: string) => { const a = new RegExp("\\b" + n + "\\s*=\\s*\"([^\"]*)\"", "i").exec(m[1]); return a ? a[1] : null; };
  return { start: atr("start"), end: atr("end") };
}

export function tokenSync(xml: string): string | null {
  const t = corpElement(xml, "sync-token");
  return t == null ? null : decodeaza(t.trim());
}

/* Cere doar VTODO (sau alta componenta care nu e VEVENT)? Atunci raspunsul
   e gol: calendarele noastre au numai evenimente. */
export function cereAltcevaDecatEvenimente(xml: string): boolean {
  const nume: string[] = [];
  const re = /<(?:[A-Za-z_][\w.-]*:)?comp-filter\b[^>]*\bname\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) nume.push(m[1].toUpperCase());
  return nume.some((n) => n !== "VCALENDAR" && n !== "VEVENT");
}

/* PROPPATCH: proprietatile din <set><prop>…</prop></set>, nume local → text. */
export function propPatchSetari(xml: string): Record<string, string> {
  const set = corpElement(xml, "set");
  const corp = set == null ? null : corpElement(set, "prop");
  const out: Record<string, string> = {};
  if (corp == null) return out;
  const re = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w-]*)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?\1\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corp))) out[m[1].toLowerCase()] = decodeaza(m[2].trim());
  const goale = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w-]*)(?:\s[^>]*)?\/>/g;
  while ((m = goale.exec(corp))) if (!(m[1].toLowerCase() in out)) out[m[1].toLowerCase()] = "";
  return out;
}
