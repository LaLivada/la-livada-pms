import { describe, it, expect } from "vitest";
import { decideActiuni, MOTIVE, slugOta, sursaDinOta } from "./lib/ical-ota.js";
import { momentLocal } from "./lib/timp.js";

/* Fix si in ora hotelului, ca in tranzitii.test.js: o regula despre timp
   testata cu „acum" real trece sau cade dupa ora la care ruleaza suita. */
const ACUM = momentLocal("2026-10-01T09:00:00");
const zi = (data, ora) => momentLocal(`${data}T${ora}`);

/* Asa arata un eveniment dupa ce functia edge i-a pus orele hotelului pe
   zilele din .ics: sosire la 14, plecare la 11. */
const ev = (uid, de, pana) => ({ uid, checkin: zi(de, "14:00"), checkout: zi(pana, "11:00") });
const rez = (over = {}) => ({
  id: "r1", externalUid: "u1", status: "confirmed",
  checkin: zi("2026-10-10", "14:00"), checkout: zi("2026-10-12", "11:00"),
  ...over,
});

describe("decideActiuni — UID nou", () => {
  it("insereaza un eveniment pe care nu-l avem", () => {
    const r = decideActiuni([ev("u1", "2026-10-10", "2026-10-12")], [], ACUM);
    expect(r.deInserat).toHaveLength(1);
    expect(r.deInserat[0].uid).toBe("u1");
    expect(r.deActualizat).toHaveLength(0);
    expect(r.deAnulat).toHaveLength(0);
  });

  it("NU insereaza un sejur deja incheiat — feedurile OTA contin si istoric", () => {
    const r = decideActiuni([ev("vechi", "2026-09-01", "2026-09-03")], [], ACUM);
    expect(r.deInserat).toHaveLength(0);
    expect(r.sarite[0]).toMatchObject({ uid: "vechi", motiv: MOTIVE.trecut });
  });

  it("insereaza un sejur inceput dar neincheiat (import pornit la mijloc)", () => {
    const r = decideActiuni([ev("acum", "2026-09-30", "2026-10-03")], [], ACUM);
    expect(r.deInserat).toHaveLength(1);
  });
});

describe("decideActiuni — UID cunoscut", () => {
  it("nu face nimic cand datele coincid", () => {
    const r = decideActiuni([ev("u1", "2026-10-10", "2026-10-12")], [rez()], ACUM);
    expect(r.deInserat).toHaveLength(0);
    expect(r.deActualizat).toHaveLength(0);
    expect(r.deAnulat).toHaveLength(0);
    expect(r.sarite).toHaveLength(0);
  });

  it("actualizeaza cand oaspetele si-a prelungit sejurul pe OTA", () => {
    const r = decideActiuni([ev("u1", "2026-10-10", "2026-10-14")], [rez()], ACUM);
    expect(r.deActualizat).toHaveLength(1);
    expect(r.deActualizat[0]).toMatchObject({ id: "r1", uid: "u1", reactiveaza: false });
    expect(r.deActualizat[0].checkout).toEqual(zi("2026-10-14", "11:00"));
  });

  it("nu atinge o rezervare deja procesata la receptie", () => {
    for (const status of ["checkedin", "checkedout", "noshow"]) {
      const r = decideActiuni([ev("u1", "2026-10-10", "2026-10-14")], [rez({ status })], ACUM);
      expect(r.deActualizat).toHaveLength(0);
      expect(r.sarite[0]).toMatchObject({ id: "r1", motiv: MOTIVE.procesata });
    }
  });

  it("nu muta un sejur a carui sosire a trecut deja", () => {
    const veche = rez({ checkin: zi("2026-09-28", "14:00"), checkout: zi("2026-10-05", "11:00") });
    const r = decideActiuni([ev("u1", "2026-09-28", "2026-10-07")], [veche], ACUM);
    expect(r.deActualizat).toHaveLength(0);
    expect(r.sarite[0]).toMatchObject({ motiv: MOTIVE.inceputa });
  });

  it("muta un sejur inceput daca noua sosire e in viitor", () => {
    const veche = rez({ checkin: zi("2026-09-28", "14:00"), checkout: zi("2026-10-05", "11:00") });
    const r = decideActiuni([ev("u1", "2026-10-20", "2026-10-22")], [veche], ACUM);
    expect(r.deActualizat).toHaveLength(1);
  });

  it("invie o rezervare anulata care reapare in feed, in loc sa insereze alta", () => {
    const r = decideActiuni(
      [ev("u1", "2026-10-10", "2026-10-12")],
      [rez({ status: "cancelled" })],
      ACUM,
    );
    expect(r.deInserat).toHaveLength(0);
    expect(r.deActualizat).toHaveLength(1);
    expect(r.deActualizat[0].reactiveaza).toBe(true);
  });
});

describe("decideActiuni — UID disparut din feed", () => {
  it("anuleaza o rezervare viitoare care nu mai e in feed", () => {
    const r = decideActiuni([], [rez()], ACUM);
    expect(r.deAnulat).toEqual([{ id: "r1", uid: "u1" }]);
  });

  it("NU anuleaza un sejur a carui sosire a trecut — feedul arata o fereastra, nu istoria", () => {
    const veche = rez({ checkin: zi("2026-09-20", "14:00"), checkout: zi("2026-09-23", "11:00") });
    const r = decideActiuni([], [veche], ACUM);
    expect(r.deAnulat).toHaveLength(0);
    expect(r.sarite[0]).toMatchObject({ motiv: MOTIVE.inceputa });
  });

  it("nu anuleaza o rezervare deja procesata", () => {
    const r = decideActiuni([], [rez({ status: "checkedin" })], ACUM);
    expect(r.deAnulat).toHaveLength(0);
    expect(r.sarite[0]).toMatchObject({ motiv: MOTIVE.procesata });
  });

  it("nu reanuleaza ce e deja anulat", () => {
    const r = decideActiuni([], [rez({ status: "cancelled" })], ACUM);
    expect(r.deAnulat).toHaveLength(0);
    expect(r.sarite).toHaveLength(0);
  });

  it("un feed gol legitim anuleaza tot ce lipseste — eroarea de retea se filtreaza inainte", () => {
    const rezervari = [
      rez({ id: "a", externalUid: "ua" }),
      rez({ id: "b", externalUid: "ub" }),
    ];
    const r = decideActiuni([], rezervari, ACUM);
    expect(r.deAnulat.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("decideActiuni — rezistenta la intrari stricate", () => {
  it("ignora evenimentele fara UID", () => {
    const r = decideActiuni([{ checkin: zi("2026-10-10", "14:00"), checkout: zi("2026-10-12", "11:00") }], [], ACUM);
    expect(r.deInserat).toHaveLength(0);
  });

  it("ignora rezervarile fara external_uid (introduse de mana pe aceeasi camera)", () => {
    const r = decideActiuni([], [rez({ externalUid: null })], ACUM);
    expect(r.deAnulat).toHaveLength(0);
  });

  it("accepta si siruri ISO, nu doar Date", () => {
    const existenta = rez({ checkin: zi("2026-10-10", "14:00").toISOString(), checkout: zi("2026-10-12", "11:00").toISOString() });
    const r = decideActiuni([ev("u1", "2026-10-10", "2026-10-12")], [existenta], ACUM);
    expect(r.deActualizat).toHaveLength(0);
  });
});

/* Constrangerea din migratie: `^[a-z0-9][a-z0-9._-]{0,31}$`, si niciodata
   'eveniment'. Un slug care n-o respecta ar fi respins abia de baza, cu un
   mesaj pe care nimeni nu l-ar lega de numele scris in formular. */
const VALID = /^[a-z0-9][a-z0-9._-]{0,31}$/;

describe("slugOta — numele agentiei devine cheie de sursa", () => {
  it("curata spatiile si majusculele", () => {
    expect(slugOta("Travel Minit")).toBe("travel-minit");
  });

  it("scoate diacriticele romanesti", () => {
    expect(slugOta("Cazări Ștefan")).toBe("cazari-stefan");
  });

  it("refuza slug-ul rezervat blocajelor de eveniment", () => {
    expect(slugOta("Eveniment")).toBe("");
  });

  it("intoarce sir gol cand nu ramane nimic utilizabil", () => {
    for (const nume of ["", "   ", "---", "!!!", null, undefined]) {
      expect(slugOta(nume)).toBe("");
    }
  });

  it("produce mereu ceva ce trece de constrangerea din baza", () => {
    const nume = [
      "Booking.com", "Expedia Group", "HRS", "A".repeat(80),
      "-- agenție 2 --", "Trip.com / Ctrip", "hotelbeds_ro",
    ];
    for (const n of nume) {
      const s = slugOta(n);
      expect(s, `„${n}" a dat „${s}"`).toMatch(VALID);
    }
  });
});

describe("sursaDinOta", () => {
  it("pastreaza cele doua surse cunoscute de SOURCES", () => {
    expect(sursaDinOta("booking")).toBe("booking");
    expect(sursaDinOta("airbnb")).toBe("airbnb");
  });

  it("trimite restul pe sursa generica (Alta agentie)", () => {
    expect(sursaDinOta("travelminit")).toBe("other");
  });
});
