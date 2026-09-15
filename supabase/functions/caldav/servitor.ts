/* Serverul CalDAV al PMS-ului — partea de protocol, fara Deno si fara
 * Supabase: primeste o cerere deja autentificata, vorbeste cu un `Depozit`
 * (interfata de mai jos; in productie Supabase, in teste memorie) si
 * intoarce raspunsul. Asa se testeaza cap-coada din vitest
 * (src/caldav-servitor.test.js) fara conturi si fara retea.
 *
 * Ce stie: OPTIONS, PROPFIND (radacina, principal, casa calendarelor,
 * calendar, obiect), REPORT (calendar-query, calendar-multiget,
 * sync-collection), PROPPATCH (nume, culoare, ordine), GET/HEAD/PUT/DELETE
 * pe obiecte. Calendarele se creeaza din PMS, nu din telefon (MKCALENDAR
 * nu trece de poarta Supabase, si nici nu e nevoie).
 *
 * Toate calendarele sunt comune tuturor userilor din PMS: casa calendarelor
 * e una singura, /calendars/, iar principalul e /principals/<utilizator>/.
 */
import { valideazaObiect, type RezumatObiect } from "./ics.ts";
import { esc, elementRadacina, propCerute, hrefuri, intervalTimp, tokenSync, cereAltcevaDecatEvenimente, propPatchSetari } from "./xml.ts";

export interface Cerere { metoda: string; cale: string; antete: Record<string, string>; corp: string }
export interface Raspuns { stare: number; antete: Record<string, string>; corp: string }
export interface Cont { utilizator: string; nume: string; email: string | null }
export interface Calendar { id: string; slug: string; nume: string; culoare: string | null; ordine: number; ctag: number }
export interface Obiect {
  id: string; calendarId: string; href: string; uid: string | null; etag: string; ics: string;
  sters: boolean; syncSeq: number; actualizatLa: string;
  incepe: string | null; seTermina: string | null; recurent: boolean;
}
export interface FiltruObiecte { dupaSync?: number; hrefuri?: string[]; interval?: { start: Date; end: Date } }
export interface Depozit {
  calendare(): Promise<Calendar[]>;
  calendarDupaSlug(slug: string): Promise<Calendar | null>;
  /* Fara `dupaSync`: doar cele vii. Cu `dupaSync`: vii si sterse, cu
     syncSeq > dupaSync (pentru sync-collection). */
  obiecte(calendarId: string, filtru: FiltruObiecte): Promise<Obiect[]>;
  obiect(calendarId: string, href: string): Promise<Obiect | null>;
  obiectDupaUid(calendarId: string, uid: string): Promise<Obiect | null>;
  scrieObiect(calendarId: string, href: string, ics: string, rezumat: RezumatObiect): Promise<Obiect>;
  stergeObiect(calendarId: string, href: string): Promise<boolean>;
  actualizeazaCalendar(calendarId: string, campuri: { nume?: string; culoare?: string; ordine?: number }): Promise<Calendar>;
}

const NS = 'xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/"';
const DAV = "1, 3, calendar-access";
const ALLOW = "OPTIONS, PROPFIND, PROPPATCH, REPORT, GET, HEAD, PUT, DELETE";
export const PREFIX_SYNC = "https://pms.lalivada.ro/caldav/sync/";
const TIP_XML = 'application/xml; charset="utf-8"';

/* Spatiul de nume al fiecarei proprietati cunoscute, pentru elementele
   goale din propstat-ul 404 si pentru cele randate. */
const SPATIU: Record<string, string> = {
  "calendar-home-set": "C", "calendar-user-address-set": "C", "supported-calendar-component-set": "C",
  "calendar-data": "C", "schedule-calendar-transp": "C", "calendar-timezone": "C", "calendar-description": "C",
  "schedule-inbox-url": "C", "schedule-outbox-url": "C", "calendar-free-busy-set": "C",
  "getctag": "CS", "email-address-set": "CS", "notification-url": "CS",
  "calendar-color": "A", "calendar-order": "A",
};
const elementGol = (nume: string) => `<${SPATIU[nume] || "D"}:${nume}/>`;

const segmentUrl = (s: string) => encodeURIComponent(s);

export function seg(cale: string): string[] {
  return cale.split("/").filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
}

function dataHttp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function dataDinTimeRange(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v.trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

function etagPotrivit(antet: string, etag: string): boolean {
  return antet.split(",").map((e) => e.trim().replace(/^W\//i, "").replace(/^"|"$/g, "")).some((e) => e === "*" || e === etag);
}

/* ---------- raspunsuri ---------- */

const gol = (stare: number, antete: Record<string, string> = {}): Raspuns => ({ stare, antete, corp: "" });

function multistatus(intrari: string[], extra = ""): Raspuns {
  return {
    stare: 207,
    antete: { "content-type": TIP_XML, dav: DAV },
    corp: `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus ${NS}>${intrari.join("")}${extra}</D:multistatus>`,
  };
}

function eroareXml(stare: number, element: string): Raspuns {
  return { stare, antete: { "content-type": TIP_XML }, corp: `<?xml version="1.0" encoding="utf-8"?>\n<D:error ${NS}>${element}</D:error>` };
}

/* Un <D:response> cu propstat 200 pentru ce exista si 404 pentru restul. */
function intrare(href: string, props: Record<string, string>, cerute: string[] | "allprop"): string {
  const lista = cerute === "allprop" ? Object.keys(props).filter((k) => k !== "calendar-data") : cerute;
  const gasite: string[] = [];
  const lipsa: string[] = [];
  for (const n of lista) (props[n] !== undefined ? gasite : lipsa).push(props[n] ?? n);
  let s = `<D:response><D:href>${esc(href)}</D:href>`;
  if (gasite.length || !lipsa.length) s += `<D:propstat><D:prop>${gasite.join("")}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>`;
  if (lipsa.length) s += `<D:propstat><D:prop>${lipsa.map(elementGol).join("")}</D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>`;
  return s + "</D:response>";
}

/* ---------- proprietatile fiecarui fel de resursa ---------- */

interface Adrese { baza: string; principal: string; casa: string }

const RAPOARTE_CALENDAR = "<D:supported-report-set>"
  + "<D:supported-report><D:report><C:calendar-query/></D:report></D:supported-report>"
  + "<D:supported-report><D:report><C:calendar-multiget/></D:report></D:supported-report>"
  + "<D:supported-report><D:report><D:sync-collection/></D:report></D:supported-report>"
  + "</D:supported-report-set>";

const PRIVILEGII_TOATE = "<D:current-user-privilege-set>"
  + ["read", "write", "write-properties", "write-content", "bind", "unbind", "read-current-user-privilege-set"]
    .map((p) => `<D:privilege><D:${p}/></D:privilege>`).join("")
  + "</D:current-user-privilege-set>";

function comune(a: Adrese): Record<string, string> {
  return {
    "current-user-principal": `<D:current-user-principal><D:href>${esc(a.principal)}</D:href></D:current-user-principal>`,
    "owner": `<D:owner><D:href>${esc(a.principal)}</D:href></D:owner>`,
    "principal-collection-set": `<D:principal-collection-set><D:href>${esc(a.baza + "/principals/")}</D:href></D:principal-collection-set>`,
  };
}

function propsRadacina(a: Adrese): Record<string, string> {
  return {
    ...comune(a),
    "resourcetype": "<D:resourcetype><D:collection/></D:resourcetype>",
    "displayname": "<D:displayname>La Livada PMS</D:displayname>",
    "supported-report-set": "<D:supported-report-set/>",
  };
}

function propsPrincipal(a: Adrese, cont: Cont): Record<string, string> {
  const adrese = (cont.email ? `<D:href>mailto:${esc(cont.email)}</D:href>` : "") + `<D:href>${esc(a.principal)}</D:href>`;
  return {
    ...comune(a),
    "resourcetype": "<D:resourcetype><D:principal/></D:resourcetype>",
    "displayname": `<D:displayname>${esc(cont.nume)}</D:displayname>`,
    "principal-URL": `<D:principal-URL><D:href>${esc(a.principal)}</D:href></D:principal-URL>`,
    "calendar-home-set": `<C:calendar-home-set><D:href>${esc(a.casa)}</D:href></C:calendar-home-set>`,
    "calendar-user-address-set": `<C:calendar-user-address-set>${adrese}</C:calendar-user-address-set>`,
    ...(cont.email ? { "email-address-set": `<CS:email-address-set><CS:email-address>${esc(cont.email)}</CS:email-address></CS:email-address-set>` } : {}),
    "alternate-URI-set": "<D:alternate-URI-set/>",
    "group-membership": "<D:group-membership/>",
    "supported-report-set": "<D:supported-report-set/>",
  };
}

function propsCasa(a: Adrese): Record<string, string> {
  return {
    ...comune(a),
    "resourcetype": "<D:resourcetype><D:collection/></D:resourcetype>",
    "displayname": "<D:displayname>Calendarele La Livada</D:displayname>",
    "supported-report-set": "<D:supported-report-set/>",
    "current-user-privilege-set": "<D:current-user-privilege-set><D:privilege><D:read/></D:privilege><D:privilege><D:read-current-user-privilege-set/></D:privilege></D:current-user-privilege-set>",
  };
}

/* Apple vrea culoarea cu alfa (#RRGGBBFF); noi tinem #RRGGBB. */
function culoareApple(c: string | null): string {
  const v = (c || "#2B5C8A").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() + "FF" : v;
}

function propsCalendar(a: Adrese, cal: Calendar): Record<string, string> {
  return {
    ...comune(a),
    "resourcetype": "<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>",
    "displayname": `<D:displayname>${esc(cal.nume)}</D:displayname>`,
    "calendar-color": `<A:calendar-color>${esc(culoareApple(cal.culoare))}</A:calendar-color>`,
    "calendar-order": `<A:calendar-order>${cal.ordine}</A:calendar-order>`,
    "getctag": `<CS:getctag>${cal.ctag}</CS:getctag>`,
    "sync-token": `<D:sync-token>${PREFIX_SYNC}${cal.id}/${cal.ctag}</D:sync-token>`,
    "supported-calendar-component-set": '<C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>',
    "supported-report-set": RAPOARTE_CALENDAR,
    "current-user-privilege-set": PRIVILEGII_TOATE,
    "schedule-calendar-transp": "<C:schedule-calendar-transp><C:opaque/></C:schedule-calendar-transp>",
  };
}

function propsObiect(a: Adrese, o: Obiect): Record<string, string> {
  return {
    "current-user-principal": comune(a)["current-user-principal"],
    "resourcetype": "<D:resourcetype/>",
    "getetag": `<D:getetag>"${esc(o.etag)}"</D:getetag>`,
    "getcontenttype": "<D:getcontenttype>text/calendar; charset=utf-8; component=VEVENT</D:getcontenttype>",
    "getlastmodified": `<D:getlastmodified>${dataHttp(o.actualizatLa)}</D:getlastmodified>`,
    "getcontentlength": `<D:getcontentlength>${new TextEncoder().encode(o.ics).length}</D:getcontentlength>`,
    "calendar-data": `<C:calendar-data>${esc(o.ics)}</C:calendar-data>`,
  };
}

/* ---------- intrarea ---------- */

export async function serveste(c: Cerere, cont: Cont, dep: Depozit, baza: string): Promise<Raspuns> {
  const metoda = c.metoda.toUpperCase();
  const s = seg(c.cale);
  const a: Adrese = {
    baza,
    principal: `${baza}/principals/${segmentUrl(cont.utilizator)}/`,
    casa: `${baza}/calendars/`,
  };
  const adancime = (c.antete["depth"] || "0").trim().toLowerCase();

  if (metoda === "OPTIONS") return gol(200, { dav: DAV, allow: ALLOW, "content-length": "0" });

  if (s[0] === ".well-known") return gol(301, { location: `${baza}/` });

  if (s.length === 0) {
    if (metoda !== "PROPFIND") return gol(405, { allow: "OPTIONS, PROPFIND" });
    const cerute = propCerute(c.corp);
    const intrari = [intrare(`${baza}/`, propsRadacina(a), cerute)];
    if (adancime !== "0") intrari.push(intrare(a.principal, propsPrincipal(a, cont), cerute), intrare(a.casa, propsCasa(a), cerute));
    return multistatus(intrari);
  }

  if (s[0] === "principals") {
    if (s.length > 2) return gol(404);
    if (s.length === 2 && s[1] !== cont.utilizator) return gol(404);
    if (metoda === "REPORT") {
      /* principal-property-search / expand-property: raspundem cu
         principalul nostru, atat cat e. */
      return multistatus([intrare(a.principal, propsPrincipal(a, cont), propCerute(c.corp))]);
    }
    if (metoda !== "PROPFIND") return gol(405, { allow: "OPTIONS, PROPFIND, REPORT" });
    const cerute = propCerute(c.corp);
    if (s.length === 1) {
      const intrari = [intrare(`${baza}/principals/`, { ...comune(a), resourcetype: "<D:resourcetype><D:collection/></D:resourcetype>", displayname: "<D:displayname>Principali</D:displayname>" }, cerute)];
      if (adancime !== "0") intrari.push(intrare(a.principal, propsPrincipal(a, cont), cerute));
      return multistatus(intrari);
    }
    return multistatus([intrare(a.principal, propsPrincipal(a, cont), cerute)]);
  }

  if (s[0] !== "calendars") return gol(404);

  if (s.length === 1) {
    if (metoda !== "PROPFIND") return gol(405, { allow: "OPTIONS, PROPFIND" });
    const cerute = propCerute(c.corp);
    const intrari = [intrare(a.casa, propsCasa(a), cerute)];
    if (adancime !== "0") for (const cal of await dep.calendare()) intrari.push(intrare(`${a.casa}${segmentUrl(cal.slug)}/`, propsCalendar(a, cal), cerute));
    return multistatus(intrari);
  }

  const cal = await dep.calendarDupaSlug(s[1]);
  if (!cal) return gol(404);
  const hrefCalendar = `${a.casa}${segmentUrl(cal.slug)}/`;
  const hrefObiect = (o: Obiect) => `${hrefCalendar}${segmentUrl(o.href)}`;

  if (s.length === 2) {
    if (metoda === "PROPFIND") {
      const cerute = propCerute(c.corp);
      const intrari = [intrare(hrefCalendar, propsCalendar(a, cal), cerute)];
      if (adancime !== "0") for (const o of await dep.obiecte(cal.id, {})) intrari.push(intrare(hrefObiect(o), propsObiect(a, o), cerute));
      return multistatus(intrari);
    }
    if (metoda === "REPORT") return raport(c, cal, dep, a, hrefObiect);
    if (metoda === "PROPPATCH") return propPatch(c, cal, dep, hrefCalendar);
    if (metoda === "DELETE" || metoda === "MKCALENDAR" || metoda === "MKCOL" || metoda === "PUT") return gol(403);
    return gol(405, { allow: "OPTIONS, PROPFIND, PROPPATCH, REPORT" });
  }

  if (s.length !== 3) return gol(404);
  const href = s[2];

  if (metoda === "GET" || metoda === "HEAD") {
    const o = await dep.obiect(cal.id, href);
    if (!o) return gol(404);
    return {
      stare: 200,
      antete: { "content-type": "text/calendar; charset=utf-8", etag: `"${o.etag}"`, "last-modified": dataHttp(o.actualizatLa) },
      corp: metoda === "HEAD" ? "" : o.ics,
    };
  }
  if (metoda === "PROPFIND") {
    const o = await dep.obiect(cal.id, href);
    if (!o) return gol(404);
    return multistatus([intrare(hrefObiect(o), propsObiect(a, o), propCerute(c.corp))]);
  }
  if (metoda === "PUT") {
    const val = valideazaObiect(c.corp);
    if (!val.ok) return eroareXml(403, `<C:valid-calendar-data/><D:responsedescription>${esc(val.motiv)}</D:responsedescription>`);
    const existent = await dep.obiect(cal.id, href);
    const daca = c.antete["if-match"];
    const dacaNu = c.antete["if-none-match"];
    if (dacaNu && dacaNu.trim() === "*" && existent) return gol(412);
    if (daca && (!existent || !etagPotrivit(daca, existent.etag))) return gol(412);
    const altul = await dep.obiectDupaUid(cal.id, val.uid);
    if (altul && altul.href !== href) return eroareXml(412, `<C:no-uid-conflict><D:href>${esc(hrefObiect(altul))}</D:href></C:no-uid-conflict>`);
    const salvat = await dep.scrieObiect(cal.id, href, c.corp, val.rezumat);
    return gol(existent ? 204 : 201, { etag: `"${salvat.etag}"` });
  }
  if (metoda === "DELETE") {
    const daca = c.antete["if-match"];
    if (daca) {
      const o = await dep.obiect(cal.id, href);
      if (!o || !etagPotrivit(daca, o.etag)) return gol(412);
    }
    return gol((await dep.stergeObiect(cal.id, href)) ? 204 : 404);
  }
  return gol(405, { allow: "OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE" });
}

/* ---------- REPORT pe un calendar ---------- */

async function raport(c: Cerere, cal: Calendar, dep: Depozit, a: Adrese, hrefObiect: (o: Obiect) => string): Promise<Raspuns> {
  const tip = elementRadacina(c.corp);
  const ceruteBrut = propCerute(c.corp);
  const cerute = ceruteBrut === "allprop" || ceruteBrut.length === 0 ? ["getetag", "calendar-data"] : ceruteBrut;

  if (tip === "calendar-multiget") {
    const vrute = hrefuri(c.corp);
    const nume = vrute.map((h) => { const p = seg(h); return p[p.length - 1] || ""; }).filter(Boolean);
    const gasite = nume.length ? await dep.obiecte(cal.id, { hrefuri: nume }) : [];
    const intrari: string[] = [];
    for (let i = 0; i < vrute.length; i++) {
      const o = gasite.find((x) => x.href === nume[i]);
      intrari.push(o ? intrare(hrefObiect(o), propsObiect(a, o), cerute)
        : `<D:response><D:href>${esc(vrute[i])}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`);
    }
    return multistatus(intrari);
  }

  if (tip === "calendar-query") {
    if (cereAltcevaDecatEvenimente(c.corp)) return multistatus([]);
    const tr = intervalTimp(c.corp);
    const start = dataDinTimeRange(tr?.start ?? null);
    const end = dataDinTimeRange(tr?.end ?? null);
    const filtru = start && end ? { interval: { start, end } } : start ? { interval: { start, end: new Date(8.64e15) } } : end ? { interval: { start: new Date(-8.64e15), end } } : {};
    const obiecte = await dep.obiecte(cal.id, filtru);
    return multistatus(obiecte.map((o) => intrare(hrefObiect(o), propsObiect(a, o), cerute)));
  }

  if (tip === "sync-collection") {
    const token = tokenSync(c.corp);
    let dupa = 0;
    if (token) {
      const rest = token.startsWith(PREFIX_SYNC) ? token.slice(PREFIX_SYNC.length).split("/") : null;
      if (!rest || rest[0] !== cal.id || !/^\d+$/.test(rest[1] || "") || Number(rest[1]) > cal.ctag) return eroareXml(403, "<D:valid-sync-token/>");
      dupa = Number(rest[1]);
    }
    const obiecte = await dep.obiecte(cal.id, dupa > 0 ? { dupaSync: dupa } : {});
    const intrari = obiecte.map((o) => o.sters
      ? `<D:response><D:href>${esc(hrefObiect(o))}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`
      : intrare(hrefObiect(o), propsObiect(a, o), cerute));
    return multistatus(intrari, `<D:sync-token>${PREFIX_SYNC}${cal.id}/${cal.ctag}</D:sync-token>`);
  }

  return eroareXml(403, "<D:supported-report/>");
}

/* ---------- PROPPATCH pe un calendar: nume, culoare, ordine ---------- */

async function propPatch(c: Cerere, cal: Calendar, dep: Depozit, hrefCalendar: string): Promise<Raspuns> {
  const setari = propPatchSetari(c.corp);
  const campuri: { nume?: string; culoare?: string; ordine?: number } = {};
  const ok: string[] = [];
  const refuzate: string[] = [];
  for (const [nume, text] of Object.entries(setari)) {
    if (nume === "displayname" && text.trim()) { campuri.nume = text.trim(); ok.push(nume); }
    else if (nume === "calendar-color" && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(text.trim())) { campuri.culoare = text.trim().slice(0, 7).toUpperCase(); ok.push(nume); }
    else if (nume === "calendar-order" && /^\d+$/.test(text.trim())) { campuri.ordine = Number(text.trim()); ok.push(nume); }
    else refuzate.push(nume);
  }
  if (Object.keys(campuri).length) await dep.actualizeazaCalendar(cal.id, campuri);
  let s = `<D:response><D:href>${esc(hrefCalendar)}</D:href>`;
  if (ok.length) s += `<D:propstat><D:prop>${ok.map(elementGol).join("")}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>`;
  if (refuzate.length) s += `<D:propstat><D:prop>${refuzate.map(elementGol).join("")}</D:prop><D:status>HTTP/1.1 403 Forbidden</D:status></D:propstat>`;
  return multistatus([s + "</D:response>"]);
}
