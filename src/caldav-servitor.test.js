/* Serverul CalDAV (supabase/functions/caldav/servitor.ts), cap-coada pe un
 * depozit in memorie: descoperirea principalului si a casei calendarelor,
 * listarea calendarelor cu getctag, PUT/GET/DELETE pe obiecte cu ETag si
 * conditii, rapoartele calendar-query (cu interval), calendar-multiget si
 * sync-collection (cu stergeri si token expirat), PROPPATCH pe culoare.
 * Ce s-ar strica tacut: telefonul n-ar mai gasi calendarele, ar vedea
 * evenimente sterse ca vii, sau ar suprascrie o modificare mai noua.
 */
import { describe, it, expect } from "vitest";
import { serveste, adreseDinCale, prinDomeniulPms, PREFIX_SYNC } from "../supabase/functions/caldav/servitor.ts";
import { DepozitMemorie } from "../supabase/functions/caldav/depozit-memorie.ts";
import { propCerute, hrefuri, elementRadacina, intervalTimp, propPatchSetari, cereAltcevaDecatEvenimente } from "../supabase/functions/caldav/xml.ts";

const BAZA = "/functions/v1/caldav";
const CONT = { utilizator: "ovidiu@lalivada.ro", nume: "Ovidiu", email: "ovidiu@lalivada.ro" };
const PRINCIPAL = `${BAZA}/principals/${encodeURIComponent("ovidiu@lalivada.ro")}/`;

const eveniment = (uid, zi, titlu = "Eveniment") => [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//RO",
  "BEGIN:VEVENT", `UID:${uid}`, `DTSTART;TZID=Europe/Bucharest:${zi}T160000`, `DTEND;TZID=Europe/Bucharest:${zi}T220000`, `SUMMARY:${titlu}`, "END:VEVENT",
  "END:VCALENDAR", "",
].join("\r\n");

function depozitNou() {
  return new DepozitMemorie([{ slug: "sala-mare", nume: "Sala Mare", culoare: "#C2410C" }, { slug: "terasa", nume: "Terasa" }]);
}
const cere = (dep, metoda, cale, corp = "", antete = {}) => serveste({ metoda, cale, antete: { depth: "0", ...antete }, corp }, CONT, dep, BAZA);
const PROPFIND = (props) => `<?xml version="1.0"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/"><D:prop>${props}</D:prop></D:propfind>`;

describe("xml", () => {
  it("proprietatile cerute, indiferent de prefix; allprop; href-uri decodate", () => {
    expect(propCerute(PROPFIND("<D:displayname/><C:calendar-home-set/><CS:getctag/>"))).toEqual(["displayname", "calendar-home-set", "getctag"]);
    expect(propCerute('<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>')).toEqual(["resourcetype"]);
    expect(propCerute('<d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>')).toBe("allprop");
    expect(hrefuri("<x><D:href>/a/b%20c.ics</D:href><D:href>/a/&amp;.ics</D:href></x>")).toEqual(["/a/b%20c.ics", "/a/&.ics"]);
    expect(elementRadacina('<?xml version="1.0"?><C:calendar-multiget xmlns:C="x"/>')).toBe("calendar-multiget");
    expect(intervalTimp('<C:time-range start="20260101T000000Z" end="20261231T000000Z"/>')).toEqual({ start: "20260101T000000Z", end: "20261231T000000Z" });
    expect(propPatchSetari('<D:propertyupdate><D:set><D:prop><D:displayname>Sala &amp; Co</D:displayname><A:calendar-color>#112233FF</A:calendar-color></D:prop></D:set></D:propertyupdate>'))
      .toEqual({ displayname: "Sala & Co", "calendar-color": "#112233FF" });
    expect(cereAltcevaDecatEvenimente('<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"/></C:comp-filter>')).toBe(true);
    expect(cereAltcevaDecatEvenimente('<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter>')).toBe(false);
  });
});

describe("descoperire", () => {
  it("OPTIONS spune calendar-access; radacina si principalul duc la casa calendarelor", async () => {
    const dep = depozitNou();
    const o = await cere(dep, "OPTIONS", "/");
    expect(o.stare).toBe(200);
    expect(o.antete.dav).toContain("calendar-access");
    const r = await cere(dep, "PROPFIND", "/", PROPFIND("<D:current-user-principal/><D:resourcetype/>"));
    expect(r.stare).toBe(207);
    expect(r.corp).toContain(`<D:current-user-principal><D:href>${PRINCIPAL}</D:href></D:current-user-principal>`);
    /* Calea vine fara prefixul functiei: index.ts il taie inainte. */
    const p = await cere(dep, "PROPFIND", PRINCIPAL.slice(BAZA.length), PROPFIND("<C:calendar-home-set/><D:displayname/><D:nu-exista/>"));
    expect(p.stare).toBe(207);
    expect(p.corp).toContain(`<D:href>${PRINCIPAL}</D:href>`);
    expect(p.corp).toContain(`<C:calendar-home-set><D:href>${BAZA}/calendars/</D:href></C:calendar-home-set>`);
    expect(p.corp).toContain("<D:displayname>Ovidiu</D:displayname>");
    expect(p.corp).toContain("<D:nu-exista/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status>");
    expect((await cere(dep, "PROPFIND", "/principals/altcineva/")).stare).toBe(404);
  });

  it("casa calendarelor la adancime 1 listeaza calendarele, cu getctag, culoare si componente", async () => {
    const dep = depozitNou();
    const r = await cere(dep, "PROPFIND", "/calendars/", PROPFIND("<D:resourcetype/><D:displayname/><CS:getctag/><A:calendar-color xmlns:A=\"http://apple.com/ns/ical/\"/><C:supported-calendar-component-set/>"), { depth: "1" });
    expect(r.stare).toBe(207);
    expect(r.corp).toContain(`<D:href>${BAZA}/calendars/sala-mare/</D:href>`);
    expect(r.corp).toContain(`<D:href>${BAZA}/calendars/terasa/</D:href>`);
    expect(r.corp).toContain("<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>");
    expect(r.corp).toContain("<D:displayname>Sala Mare</D:displayname>");
    expect(r.corp).toContain("<CS:getctag>1</CS:getctag>");
    expect(r.corp).toContain("<A:calendar-color>#C2410CFF</A:calendar-color>");
    expect(r.corp).toContain('<C:comp name="VEVENT"/>');
    const zero = await cere(dep, "PROPFIND", "/calendars/", PROPFIND("<D:displayname/>"), { depth: "0" });
    expect(zero.corp).not.toContain("sala-mare");
    expect((await cere(dep, "PROPFIND", "/calendars/nu-exista/")).stare).toBe(404);
  });
});

describe("obiecte", () => {
  it("PUT creeaza (201, ETag), al doilea PUT modifica (204), GET intoarce exact textul", async () => {
    const dep = depozitNou();
    const ics = eveniment("ev-1", "20260718", "Nuntă");
    const c = await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", ics, { "if-none-match": "*" });
    expect(c.stare).toBe(201);
    expect(c.antete.etag).toMatch(/^".+"$/);
    const g = await cere(dep, "GET", "/calendars/sala-mare/ev-1.ics");
    expect(g.stare).toBe(200);
    expect(g.corp).toBe(ics);
    expect(g.antete.etag).toBe(c.antete.etag);
    const m = await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", eveniment("ev-1", "20260719", "Nuntă mutată"), { "if-match": c.antete.etag });
    expect(m.stare).toBe(204);
    expect(m.antete.etag).not.toBe(c.antete.etag);
    expect((await dep.calendarDupaSlug("sala-mare")).ctag).toBe(3);
  });

  it("conditiile: If-None-Match:* pe ceva existent si If-Match vechi dau 412; UID dublu la alt href la fel", async () => {
    const dep = depozitNou();
    await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", eveniment("ev-1", "20260718"));
    expect((await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", eveniment("ev-1", "20260718"), { "if-none-match": "*" })).stare).toBe(412);
    expect((await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", eveniment("ev-1", "20260718"), { "if-match": '"altceva"' })).stare).toBe(412);
    const dublu = await cere(dep, "PUT", "/calendars/sala-mare/alt-nume.ics", eveniment("ev-1", "20260720"));
    expect(dublu.stare).toBe(412);
    expect(dublu.corp).toContain("no-uid-conflict");
    expect((await cere(dep, "PUT", "/calendars/sala-mare/gol.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")).stare).toBe(403);
  });

  it("DELETE lasa 204 apoi 404, iar PROPFIND pe calendar la adancime 1 nu-l mai arata", async () => {
    const dep = depozitNou();
    await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", eveniment("ev-1", "20260718"));
    await cere(dep, "PUT", "/calendars/sala-mare/ev-2.ics", eveniment("ev-2", "20260801"));
    expect((await cere(dep, "DELETE", "/calendars/sala-mare/ev-1.ics")).stare).toBe(204);
    expect((await cere(dep, "DELETE", "/calendars/sala-mare/ev-1.ics")).stare).toBe(404);
    expect((await cere(dep, "GET", "/calendars/sala-mare/ev-1.ics")).stare).toBe(404);
    const l = await cere(dep, "PROPFIND", "/calendars/sala-mare/", PROPFIND("<D:getetag/>"), { depth: "1" });
    expect(l.corp).toContain("/calendars/sala-mare/ev-2.ics");
    expect(l.corp).not.toContain("/calendars/sala-mare/ev-1.ics");
  });

  it("href-urile cu caractere speciale se codeaza in raspuns si se decodeaza din cale", async () => {
    const dep = depozitNou();
    await cere(dep, "PUT", "/calendars/sala-mare/a%40b%20c.ics", eveniment("a@b c", "20260718"));
    const g = await cere(dep, "GET", "/calendars/sala-mare/a%40b%20c.ics");
    expect(g.stare).toBe(200);
    const l = await cere(dep, "PROPFIND", "/calendars/sala-mare/", PROPFIND("<D:getetag/>"), { depth: "1" });
    expect(l.corp).toContain("/calendars/sala-mare/a%40b%20c.ics");
  });
});

describe("rapoarte", () => {
  it("calendar-multiget da calendar-data pentru ce exista si 404 pentru rest", async () => {
    const dep = depozitNou();
    const ics = eveniment("ev-1", "20260718", "Nuntă");
    await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", ics);
    const corp = `<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/><C:calendar-data/></D:prop><D:href>${BAZA}/calendars/sala-mare/ev-1.ics</D:href><D:href>${BAZA}/calendars/sala-mare/nu.ics</D:href></C:calendar-multiget>`;
    const r = await cere(dep, "REPORT", "/calendars/sala-mare/", corp, { depth: "1" });
    expect(r.stare).toBe(207);
    expect(r.corp).toContain("<C:calendar-data>BEGIN:VCALENDAR");
    expect(r.corp).toContain("SUMMARY:Nuntă");
    expect(r.corp).toContain(`<D:href>${BAZA}/calendars/sala-mare/nu.ics</D:href><D:status>HTTP/1.1 404 Not Found</D:status>`);
  });

  it("calendar-query cu interval filtreaza; seriile recurente raman mereu; VTODO da gol", async () => {
    const dep = depozitNou();
    await cere(dep, "PUT", "/calendars/sala-mare/iulie.ics", eveniment("iulie", "20260718"));
    await cere(dep, "PUT", "/calendars/sala-mare/oct.ics", eveniment("oct", "20261010"));
    await cere(dep, "PUT", "/calendars/sala-mare/serie.ics", eveniment("serie", "20260101").replace("SUMMARY:", "RRULE:FREQ=WEEKLY\r\nSUMMARY:"));
    const query = (filtru) => `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/></D:prop><C:filter><C:comp-filter name="VCALENDAR">${filtru}</C:comp-filter></C:filter></C:calendar-query>`;
    const r = await cere(dep, "REPORT", "/calendars/sala-mare/", query('<C:comp-filter name="VEVENT"><C:time-range start="20260701T000000Z" end="20260801T000000Z"/></C:comp-filter>'), { depth: "1" });
    expect(r.corp).toContain("iulie.ics");
    expect(r.corp).not.toContain("oct.ics");
    expect(r.corp).toContain("serie.ics");
    const tot = await cere(dep, "REPORT", "/calendars/sala-mare/", query('<C:comp-filter name="VEVENT"/>'), { depth: "1" });
    expect(tot.corp).toContain("oct.ics");
    const todo = await cere(dep, "REPORT", "/calendars/sala-mare/", query('<C:comp-filter name="VTODO"/>'), { depth: "1" });
    expect(todo.corp).not.toContain("<D:response>");
  });

  it("sync-collection: prima data tot ce e viu; apoi doar schimbarile, cu stergerile ca 404; token strain → 403", async () => {
    const dep = depozitNou();
    await cere(dep, "PUT", "/calendars/sala-mare/ev-1.ics", eveniment("ev-1", "20260718"));
    const sync = (token) => `<D:sync-collection xmlns:D="DAV:"><D:sync-token>${token}</D:sync-token><D:sync-level>1</D:sync-level><D:prop><D:getetag/></D:prop></D:sync-collection>`;
    const prima = await cere(dep, "REPORT", "/calendars/sala-mare/", sync(""));
    expect(prima.stare).toBe(207);
    expect(prima.corp).toContain("ev-1.ics");
    const token = /<D:sync-token>([^<]+)<\/D:sync-token>/.exec(prima.corp)[1];
    expect(token.startsWith(PREFIX_SYNC)).toBe(true);

    await cere(dep, "PUT", "/calendars/sala-mare/ev-2.ics", eveniment("ev-2", "20260801"));
    await cere(dep, "DELETE", "/calendars/sala-mare/ev-1.ics");
    const aDoua = await cere(dep, "REPORT", "/calendars/sala-mare/", sync(token));
    expect(aDoua.corp).toContain("ev-2.ics");
    expect(aDoua.corp).toContain(`<D:href>${BAZA}/calendars/sala-mare/ev-1.ics</D:href><D:status>HTTP/1.1 404 Not Found</D:status>`);
    const token2 = /<D:sync-token>([^<]+)<\/D:sync-token>/.exec(aDoua.corp)[1];
    expect(token2).not.toBe(token);

    const nimic = await cere(dep, "REPORT", "/calendars/sala-mare/", sync(token2));
    expect(nimic.corp).not.toContain("<D:response>");
    const strain = await cere(dep, "REPORT", "/calendars/sala-mare/", sync("https://altundeva/9"));
    expect(strain.stare).toBe(403);
    expect(strain.corp).toContain("valid-sync-token");
  });
});

describe("PROPPATCH si metode nepermise", () => {
  it("culoarea si numele se pastreaza, restul se refuza cu 403 in propstat", async () => {
    const dep = depozitNou();
    const corp = '<D:propertyupdate xmlns:D="DAV:" xmlns:A="http://apple.com/ns/ical/" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><A:calendar-color>#112233FF</A:calendar-color><D:displayname>Sala Nouă</D:displayname><C:calendar-timezone>x</C:calendar-timezone></D:prop></D:set></D:propertyupdate>';
    const r = await cere(dep, "PROPPATCH", "/calendars/sala-mare/", corp);
    expect(r.stare).toBe(207);
    expect(r.corp).toContain("<A:calendar-color/><D:displayname/></D:prop><D:status>HTTP/1.1 200 OK</D:status>");
    expect(r.corp).toContain("<C:calendar-timezone/></D:prop><D:status>HTTP/1.1 403 Forbidden</D:status>");
    const cal = await dep.calendarDupaSlug("sala-mare");
    expect(cal.nume).toBe("Sala Nouă");
    expect(cal.culoare).toBe("#112233");
  });

  it("MKCALENDAR/DELETE pe calendar → 403; metoda necunoscuta → 405; cale straina → 404", async () => {
    const dep = depozitNou();
    expect((await cere(dep, "MKCALENDAR", "/calendars/noua/")).stare).toBe(404);
    expect((await cere(dep, "DELETE", "/calendars/sala-mare/")).stare).toBe(403);
    expect((await cere(dep, "PATCH", "/calendars/sala-mare/")).stare).toBe(405);
    expect((await cere(dep, "PROPFIND", "/altceva/")).stare).toBe(404);
    expect((await cere(dep, "PROPFIND", "/.well-known/caldav")).stare).toBe(301);
  });
});

describe("numele proprietatilor isi pastreaza literele (XML e case-sensitive)", () => {
  it("propCerute nu trece in litere mici; principal-URL primeste 200, nu 404", async () => {
    const corp = `<?xml version="1.0" encoding="UTF-8"?><A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><A:prop><A:principal-URL/><C:schedule-inbox-URL/><A:current-user-principal/></A:prop></A:propfind>`;
    expect(propCerute(corp)).toEqual(["principal-URL", "schedule-inbox-URL", "current-user-principal"]);
    const r = await cere(depozitNou(), "PROPFIND", "/principals/ovidiu%40lalivada.ro/", corp, { depth: "0" });
    expect(r.stare).toBe(207);
    expect(r.corp).toContain(`<D:principal-URL><D:href>${PRINCIPAL}</D:href></D:principal-URL>`);
    expect(r.corp).toContain("<C:schedule-inbox-URL/>");
    expect(r.corp).not.toContain("principal-url");
  });
});

describe("adreseDinCale: baza publica a hrefurilor, indiferent ce cale vede functia", () => {
  it("poarta Supabase taie /functions/v1: pathname /caldav/... da totusi baza publica", () => {
    expect(adreseDinCale("/caldav/principals/office%40lalivada.com/"))
      .toEqual({ baza: "/functions/v1/caldav", cale: "/principals/office%40lalivada.com/" });
    expect(adreseDinCale("/caldav/")).toEqual({ baza: "/functions/v1/caldav", cale: "/" });
    expect(adreseDinCale("/caldav")).toEqual({ baza: "/functions/v1/caldav", cale: "/" });
  });

  it("prin domeniul PMS-ului (proxy Vercel) baza publica e /caldav; pe supabase.co sau local ramane /functions/v1/caldav", () => {
    expect(prinDomeniulPms("pms.lalivada.ro")).toBe(true);
    expect(prinDomeniulPms("suoowrginsliyrbxqeap.supabase.co")).toBe(false);
    expect(prinDomeniulPms("edge-runtime.supabase.com")).toBe(false);
    expect(prinDomeniulPms("pms.lalivada.ro:443")).toBe(true);
    expect(prinDomeniulPms("localhost:54321")).toBe(false);
    expect(prinDomeniulPms("")).toBe(false);
    expect(adreseDinCale("/caldav/principals/office%40lalivada.com/", "pms.lalivada.ro"))
      .toEqual({ baza: "/caldav", cale: "/principals/office%40lalivada.com/" });
    expect(adreseDinCale("/caldav/", "suoowrginsliyrbxqeap.supabase.co")).toEqual({ baza: "/functions/v1/caldav", cale: "/" });
  });

  it("calea completa (local, supabase functions serve) nu dubleaza prefixul", () => {
    expect(adreseDinCale("/functions/v1/caldav/calendars/sala-mare/"))
      .toEqual({ baza: "/functions/v1/caldav", cale: "/calendars/sala-mare/" });
    expect(adreseDinCale("/functions/v1/caldav")).toEqual({ baza: "/functions/v1/caldav", cale: "/" });
  });

  it("hrefurile din raspunsul principalului folosesc baza publica", async () => {
    const { baza, cale } = adreseDinCale("/caldav/principals/ovidiu%40lalivada.ro/");
    const corpIOS = `<?xml version="1.0" encoding="UTF-8"?><A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><A:prop><A:current-user-principal/><A:principal-URL/><C:calendar-home-set/></A:prop></A:propfind>`;
    const r = await serveste({ metoda: "PROPFIND", cale, antete: { depth: "0" }, corp: corpIOS }, CONT, depozitNou(), baza);
    expect(r.stare).toBe(207);
    expect(r.corp).toContain(`<D:href>${PRINCIPAL}</D:href>`);
    expect(r.corp).toContain(`<D:href>${BAZA}/calendars/</D:href>`);
    expect(r.corp).not.toContain("<D:href>/caldav/");
  });
});
