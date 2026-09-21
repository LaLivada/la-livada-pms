/* Trecerea de la textul unui feed OTA la zile de cazare
 * (supabase/functions/ical-import/feed.ts).
 *
 * Aici se verifica exact ce nu poate prinde niciun test al partilor: din ce
 * zi se citeste un DTSTART si ce ora primeste. Asteptarile sunt scrise in
 * ORA HOTELULUI (momentLocal), fiindca asa le vede recepția in calendar.
 */
import { describe, it, expect } from "vitest";
import { evenimenteDin, laOraHotelului } from "../supabase/functions/ical-import/feed.ts";
import { momentLocal, partiLocale } from "./lib/timp.js";

const calendar = (...vevente) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//RO", ...vevente, "END:VCALENDAR"].join("\r\n");

/* Forma reala a unui feed Airbnb: zile intregi, UID lung, rezumat generic.
   DTEND e EXCLUSIV — 20261014 inseamna ultima noapte 13→14. */
const vevent = (uid, de, pana, extra = []) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  "DTSTAMP:20260920T120000Z",
  `DTSTART;VALUE=DATE:${de}`,
  `DTEND;VALUE=DATE:${pana}`,
  "SUMMARY:Reserved",
  ...extra,
  "END:VEVENT",
].join("\r\n");

describe("evenimenteDin — zilele si orele", () => {
  it("pune sosirea la 14 si plecarea la 11, pe zilele din feed", () => {
    const { evenimente } = evenimenteDin(calendar(vevent("a1", "20261012", "20261014")));
    expect(evenimente).toHaveLength(1);
    expect(evenimente[0].uid).toBe("a1");
    expect(evenimente[0].checkin).toEqual(momentLocal("2026-10-12T14:00"));
    expect(evenimente[0].checkout).toEqual(momentLocal("2026-10-14T11:00"));
  });

  it("nu scade o zi din DTEND — plecarea e chiar ziua scrisa acolo", () => {
    const { evenimente } = evenimenteDin(calendar(vevent("a1", "20261012", "20261013")));
    const p = partiLocale(evenimente[0].checkout);
    expect([p.zi, p.luna, p.ore]).toEqual([13, 10, 11]);
  });

  it("trece corect peste schimbarea orei de iarna (25 octombrie 2026)", () => {
    const { evenimente } = evenimenteDin(calendar(vevent("dst", "20261024", "20261026")));
    expect(evenimente[0].checkin).toEqual(momentLocal("2026-10-24T14:00"));
    expect(evenimente[0].checkout).toEqual(momentLocal("2026-10-26T11:00"));
    // Ora de perete ramane 11, desi intre ele e o zi de 25 de ore.
    expect(partiLocale(evenimente[0].checkout).ore).toBe(11);
  });

  it("citeste ziua in fusul pensiunii, nu in UTC", () => {
    /* 23:00Z pe 11 octombrie e deja 02:00 pe 12 la Vaslui. Rezervarea
       trebuie sa cada pe 12, ziua pe care o vede recepția. */
    const cuOra = [
      "BEGIN:VEVENT", "UID:tz1", "DTSTAMP:20260920T120000Z",
      "DTSTART:20261011T230000Z", "DTEND:20261013T230000Z",
      "SUMMARY:Reserved", "END:VEVENT",
    ].join("\r\n");
    const { evenimente } = evenimenteDin(calendar(cuOra));
    expect(evenimente[0].checkin).toEqual(momentLocal("2026-10-12T14:00"));
    expect(evenimente[0].checkout).toEqual(momentLocal("2026-10-14T11:00"));
  });
});

describe("evenimenteDin — ce se lasa deoparte", () => {
  it("sare peste evenimentele anulate pe OTA", () => {
    const { evenimente } = evenimenteDin(
      calendar(vevent("a1", "20261012", "20261014", ["STATUS:CANCELLED"])),
    );
    expect(evenimente).toHaveLength(0);
  });

  it("numara si ignora evenimentele fara UID", () => {
    const faraUid = [
      "BEGIN:VEVENT", "DTSTAMP:20260920T120000Z",
      "DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261014",
      "SUMMARY:Reserved", "END:VEVENT",
    ].join("\r\n");
    const r = evenimenteDin(calendar(faraUid));
    expect(r.evenimente).toHaveLength(0);
    expect(r.faraUid).toBe(1);
  });

  it("sare peste o zi inchisa (DTSTART = DTEND), care ar da un interval negativ", () => {
    const { evenimente } = evenimenteDin(calendar(vevent("zi", "20261012", "20261012")));
    expect(evenimente).toHaveLength(0);
  });

  it("nu se poticneste intr-un calendar fara niciun eveniment", () => {
    expect(evenimenteDin(calendar()).evenimente).toEqual([]);
  });

  it("citeste liniile impaturite, asa cum le trimite Booking.com", () => {
    const impaturit = [
      "BEGIN:VEVENT",
      "UID:booking-1234567890-abcdefghijklmnopqrstuvwxyz-",
      " 0987654321",
      "DTSTAMP:20260920T120000Z",
      "DTSTART;VALUE=DATE:20261012",
      "DTEND;VALUE=DATE:20261014",
      "SUMMARY:CLOSED - Not available",
      "END:VEVENT",
    ].join("\r\n");
    const { evenimente } = evenimenteDin(calendar(impaturit));
    expect(evenimente[0].uid).toBe("booking-1234567890-abcdefghijklmnopqrstuvwxyz-0987654321");
  });

  it("acopera mai multe evenimente dintr-un singur feed", () => {
    const { evenimente } = evenimenteDin(calendar(
      vevent("a1", "20261012", "20261014"),
      vevent("a2", "20261020", "20261022"),
      vevent("a3", "20261101", "20261103"),
    ));
    expect(evenimente.map((e) => e.uid)).toEqual(["a1", "a2", "a3"]);
  });
});

describe("laOraHotelului", () => {
  it("da o data invalida pentru o intrare invalida, fara sa arunce", () => {
    expect(Number.isNaN(laOraHotelului(new Date(NaN), 14).getTime())).toBe(true);
  });
});
