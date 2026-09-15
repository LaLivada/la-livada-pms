/* iCalendar-ul serverului CalDAV (supabase/functions/caldav/ics.ts): linii
 * impaturite, parametri cu ghilimele, momente in UTC / fus IANA / toata
 * ziua, rezumatul unui obiect si impartirea unui export in obiecte per UID.
 * Ce s-ar strica tacut: o ora de vara citita ca de iarna (evenimentul ar
 * fi cu o ora alaturi si camerele s-ar bloca gresit), un export impartit
 * fara VTIMEZONE sau cu exceptiile separate de seria lor.
 */
import { describe, it, expect } from "vitest";
import {
  liniiDesfacute, parseazaLinie, parseazaICS, momentDin, instantDinLocal, durataMs,
  rezumaObiect, valideazaObiect, imparteInObiecte, numeCalendar, culoareCalendar, dezescapeaza,
} from "../supabase/functions/caldav/ics.ts";

const EXPORT = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Synology//Calendar//EN",
  "X-WR-CALNAME:Sala Mare",
  "X-APPLE-CALENDAR-COLOR:#C2410C",
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Bucharest",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700329T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "UID:nunta-1@synology",
  "DTSTART;TZID=Europe/Bucharest:20260718T160000",
  "DTEND;TZID=Europe/Bucharest:20260719T020000",
  "SUMMARY:Nuntă Popescu\\, cu formație",
  "DESCRIPTION:O descriere destul de lungă încât să fie împăturită pe două rân",
  " duri de export.",
  "BEGIN:VALARM",
  "TRIGGER:-PT15M",
  "ACTION:DISPLAY",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:sedinta-saptamanala",
  "DTSTART;TZID=Europe/Bucharest:20260907T100000",
  "DTEND;TZID=Europe/Bucharest:20260907T110000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO",
  "SUMMARY:Ședință",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:sedinta-saptamanala",
  "RECURRENCE-ID;TZID=Europe/Bucharest:20260914T100000",
  "DTSTART;TZID=Europe/Bucharest:20260914T140000",
  "DTEND;TZID=Europe/Bucharest:20260914T150000",
  "SUMMARY:Ședință mutată",
  "END:VEVENT",
  "BEGIN:VTODO",
  "UID:de-facut",
  "SUMMARY:Nu e eveniment",
  "END:VTODO",
  "END:VCALENDAR",
].join("\r\n") + "\r\n";

describe("linii si proprietati", () => {
  it("desface liniile impaturite si citeste parametrii, si cu ghilimele", () => {
    expect(liniiDesfacute("A:1\r\n b\r\nB:2\n")).toEqual(["A:1b", "B:2"]);
    const p = parseazaLinie('ATTENDEE;CN="Pop: Ion";ROLE=REQ-PARTICIPANT:mailto:ion@x.ro');
    expect(p.nume).toBe("ATTENDEE");
    expect(p.params).toEqual({ CN: "Pop: Ion", ROLE: "REQ-PARTICIPANT" });
    expect(p.valoare).toBe("mailto:ion@x.ro");
    expect(parseazaLinie("fara doua puncte")).toBeNull();
    expect(dezescapeaza("a\\, b\\; c\\nd")).toBe("a, b; c\nd");
  });

  it("construieste arborele de componente", () => {
    const cal = parseazaICS(EXPORT);
    expect(cal.tip).toBe("VCALENDAR");
    expect(cal.copii.map((c) => c.tip)).toEqual(["VTIMEZONE", "VEVENT", "VEVENT", "VEVENT", "VTODO"]);
    expect(cal.copii[1].copii[0].tip).toBe("VALARM");
  });
});

describe("momente", () => {
  it("UTC, fus IANA (vara si iarna), toata ziua", () => {
    expect(momentDin({ nume: "DTSTART", params: {}, valoare: "20260718T130000Z" }).data.toISOString()).toBe("2026-07-18T13:00:00.000Z");
    expect(momentDin({ nume: "DTSTART", params: { TZID: "Europe/Bucharest" }, valoare: "20260718T160000" }).data.toISOString()).toBe("2026-07-18T13:00:00.000Z");
    expect(momentDin({ nume: "DTSTART", params: { TZID: "Europe/Bucharest" }, valoare: "20261215T160000" }).data.toISOString()).toBe("2026-12-15T14:00:00.000Z");
    const zi = momentDin({ nume: "DTSTART", params: { VALUE: "DATE" }, valoare: "20260718" });
    expect(zi.toataZiua).toBe(true);
    expect(zi.data.toISOString()).toBe("2026-07-17T21:00:00.000Z");
    expect(momentDin({ nume: "DTSTART", params: {}, valoare: "nimic" })).toBeNull();
  });

  it("fara TZID inseamna fusul pensiunii; un fus necunoscut cade pe el", () => {
    expect(momentDin({ nume: "DTSTART", params: {}, valoare: "20260718T160000" }).data.toISOString()).toBe("2026-07-18T13:00:00.000Z");
    expect(instantDinLocal(2026, 7, 18, 16, 0, 0, "Nu/Exista").toISOString()).toBe("2026-07-18T13:00:00.000Z");
  });

  it("trecerea la ora de vara: 03:30 pe 29 martie 2026 nu exista, cade dupa salt", () => {
    const t = instantDinLocal(2026, 3, 29, 3, 30, 0, "Europe/Bucharest");
    expect(t.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("durate", () => {
    expect(durataMs("PT2H30M")).toBe(9_000_000);
    expect(durataMs("P1D")).toBe(86_400_000);
    expect(durataMs("-PT15M")).toBe(-900_000);
    expect(durataMs("P1W")).toBe(7 * 86_400_000);
    expect(durataMs("ceva")).toBeNull();
  });
});

describe("rezumatul unui obiect", () => {
  it("titlu dezescapat, inceput si sfarsit in UTC, cu VALARM si linii impaturite", () => {
    const [nunta] = imparteInObiecte(EXPORT);
    const r = rezumaObiect(nunta.ics);
    expect(r.uid).toBe("nunta-1@synology");
    expect(r.titlu).toBe("Nuntă Popescu, cu formație");
    expect(r.incepe.toISOString()).toBe("2026-07-18T13:00:00.000Z");
    expect(r.seTermina.toISOString()).toBe("2026-07-18T23:00:00.000Z");
    expect(r.toataZiua).toBe(false);
    expect(r.recurent).toBe(false);
    expect(r.evenimente).toBe(1);
  });

  it("seria recurenta: instanta mama da rezumatul, exceptia se numara", () => {
    const [, sedinta] = imparteInObiecte(EXPORT);
    const r = rezumaObiect(sedinta.ics);
    expect(r.recurent).toBe(true);
    expect(r.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(r.titlu).toBe("Ședință");
    expect(r.evenimente).toBe(2);
  });

  it("fara DTEND: DURATION, altfel o zi intreaga sau un moment", () => {
    const cu = (linii) => rezumaObiect(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", ...linii, "END:VEVENT", "END:VCALENDAR"].join("\n"));
    expect(cu(["DTSTART:20260718T130000Z", "DURATION:PT2H"]).seTermina.toISOString()).toBe("2026-07-18T15:00:00.000Z");
    expect(cu(["DTSTART;VALUE=DATE:20260718"]).seTermina.toISOString()).toBe("2026-07-18T21:00:00.000Z");
    expect(cu(["DTSTART:20260718T130000Z"]).seTermina.toISOString()).toBe("2026-07-18T13:00:00.000Z");
  });

  it("validarea unui PUT: VCALENDAR, macar un VEVENT, un singur UID", () => {
    expect(valideazaObiect("BEGIN:VCALENDAR\nEND:VCALENDAR").ok).toBe(false);
    expect(valideazaObiect("nimic").ok).toBe(false);
    const doua = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20260718T130000Z\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nDTSTART:20260718T130000Z\nEND:VEVENT\nEND:VCALENDAR";
    expect(valideazaObiect(doua).ok).toBe(false);
    const ok = valideazaObiect("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20260718T130000Z\nSUMMARY:X\nEND:VEVENT\nEND:VCALENDAR");
    expect(ok.ok).toBe(true);
    expect(ok.uid).toBe("a");
  });
});

describe("importul unui export", () => {
  it("un obiect per UID, cu VTIMEZONE copiat, exceptiile langa serie, fara VTODO", () => {
    const obiecte = imparteInObiecte(EXPORT);
    expect(obiecte.map((o) => o.uid)).toEqual(["nunta-1@synology", "sedinta-saptamanala"]);
    for (const o of obiecte) {
      expect(o.ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Synology//Calendar//EN\r\nBEGIN:VTIMEZONE")).toBe(true);
      expect(o.ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
      expect(o.ics).not.toContain("VTODO");
      expect(o.ics).not.toContain("X-WR-CALNAME");
    }
    expect(obiecte[0].ics).toContain("BEGIN:VALARM");
    expect(obiecte[0].ics).toContain(" duri de export.");
    expect((obiecte[1].ics.match(/BEGIN:VEVENT/g) || []).length).toBe(2);
    expect(obiecte[1].ics).toContain("RECURRENCE-ID;TZID=Europe/Bucharest:20260914T100000");
  });

  it("un eveniment fara UID primeste unul, iar un export gol nu da nimic", () => {
    const o = imparteInObiecte("BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260718T130000Z\nEND:VEVENT\nEND:VCALENDAR");
    expect(o).toHaveLength(1);
    expect(o[0].uid).toBe("fara-uid-1");
    expect(o[0].ics).toContain("PRODID:-//La Livada PMS//CalDAV//RO");
    expect(imparteInObiecte("")).toEqual([]);
  });

  it("numele si culoarea calendarului din export", () => {
    expect(numeCalendar(EXPORT)).toBe("Sala Mare");
    expect(culoareCalendar(EXPORT)).toBe("#C2410C");
    expect(numeCalendar("BEGIN:VCALENDAR\nEND:VCALENDAR")).toBeNull();
  });
});
