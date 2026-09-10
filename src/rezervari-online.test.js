/* Cardul „De pe site" de pe ecranul Azi.
 *
 * Doua reguli se pot strica tacut aici, si niciuna n-ar da vreo eroare:
 *  - ordinea, daca cineva sorteaza dupa `checkin` in loc de `createdAt` —
 *    cardul ar arata cele mai apropiate sosiri, nu ultimele intrari;
 *  - filtrul de sursa, daca prinde si rezervarile scrise la receptie —
 *    cardul si-ar pierde rostul fara sa se vada ca s-a stricat.
 */
import { describe, it, expect } from "vitest";
import { ultimeleOnline, candAVenit, SURSA_SITE, REZERVARI_PE_CARD }
  from "./lib/rezervari-online.js";

const rez = (id, sursa, creata, checkin = "2026-10-01T11:00:00Z") =>
  ({ id, source: sursa, createdAt: creata, checkin, status: "confirmed" });

describe("ultimeleOnline", () => {
  it("ia doar rezervarile de pe site propriu", () => {
    const toate = [
      rez("a", SURSA_SITE, "2026-09-10T08:00:00Z"),
      rez("b", "booking",  "2026-09-10T09:00:00Z"),
      rez("c", "direct",   "2026-09-10T10:00:00Z"),
      rez("d", "airbnb",   "2026-09-10T11:00:00Z"),
    ];
    expect(ultimeleOnline(toate).map((r) => r.id)).toEqual(["a"]);
  });

  /* „Ultimele intrate" inseamna cand a apasat omul butonul, nu cand vine el
     la poarta. O rezervare facuta azi pentru la vara e cea mai noua stire,
     desi are cel mai indepartat check-in. */
  it("sorteaza dupa cand a intrat, nu dupa data sosirii", () => {
    const toate = [
      rez("veche-dar-vine-curand", SURSA_SITE, "2026-09-01T08:00:00Z", "2026-09-12T11:00:00Z"),
      rez("noua-dar-vine-la-vara", SURSA_SITE, "2026-09-10T08:00:00Z", "2027-07-01T11:00:00Z"),
    ];
    expect(ultimeleOnline(toate).map((r) => r.id))
      .toEqual(["noua-dar-vine-la-vara", "veche-dar-vine-curand"]);
  });

  it("taie la cinci", () => {
    const toate = Array.from({ length: 9 }, (_, i) =>
      rez(`r${i}`, SURSA_SITE, `2026-09-0${i + 1}T08:00:00Z`));
    const iesite = ultimeleOnline(toate);
    expect(iesite).toHaveLength(REZERVARI_PE_CARD);
    expect(iesite[0].id).toBe("r8");
  });

  /* Anularea venita de pe site e exact felul de veste pentru care exista
     cardul: scoasa, cardul ar fi spus „ultimele cinci" si ar fi aratat
     altceva. */
  it("pastreaza anulatele", () => {
    const toate = [
      { ...rez("anulata", SURSA_SITE, "2026-09-10T09:00:00Z"), status: "cancelled" },
      rez("buna", SURSA_SITE, "2026-09-10T08:00:00Z"),
    ];
    expect(ultimeleOnline(toate).map((r) => r.id)).toEqual(["anulata", "buna"]);
  });

  /* Randurile fara `createdAt` (vederea rezervari_ocupare, randuri vechi) nu
     au voie sa sara in fata celor datate. */
  it("aseaza la coada randurile fara data de intrare", () => {
    const toate = [
      rez("fara", SURSA_SITE, null),
      rez("cu", SURSA_SITE, "2026-09-10T08:00:00Z"),
    ];
    expect(ultimeleOnline(toate).map((r) => r.id)).toEqual(["cu", "fara"]);
  });

  it("nu se sufoca pe o lista lipsa", () => {
    expect(ultimeleOnline(undefined)).toEqual([]);
    expect(ultimeleOnline(null)).toEqual([]);
  });

  it("nu modifica lista primita", () => {
    const toate = [
      rez("a", SURSA_SITE, "2026-09-01T08:00:00Z"),
      rez("b", SURSA_SITE, "2026-09-10T08:00:00Z"),
    ];
    ultimeleOnline(toate);
    expect(toate.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

/* Datele de aici sunt scrise FARA `Z`, adica in ora locala. Nu e o scapare:
   pragul dintre „acum N ore" si „ieri" e pe zi calendaristica locala, iar cu
   ore UTC testul ar fi trecut sau ar fi cazut dupa fusul masinii care il
   ruleaza. */
describe("candAVenit", () => {
  const acum = new Date("2026-09-10T12:00:00");
  const fmt = (d) => `data:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  it("spune chiar acum sub un minut", () => {
    expect(candAVenit("2026-09-10T11:59:30", acum)).toBe("chiar acum");
  });

  /* Ceasul calculatorului in urma fata de server ar fi dat „acum -3 minute",
     ceea ce arata ca o defectiune. Nu e. */
  it("nu scoate niciodata un minus", () => {
    expect(candAVenit("2026-09-10T12:03:00", acum)).toBe("chiar acum");
  });

  it("numara minutele, cu particula de la 20 in sus", () => {
    expect(candAVenit("2026-09-10T11:57:00", acum)).toBe("acum 3 minute");
    expect(candAVenit("2026-09-10T11:35:00", acum)).toBe("acum 25 de minute");
  });

  it("numara orele in aceeasi zi", () => {
    expect(candAVenit("2026-09-10T11:00:00", acum)).toBe("acum o oră");
    expect(candAVenit("2026-09-10T09:00:00", acum)).toBe("acum 3 ore");
  });

  /* Trecerea de la ore la „ieri" e pe ZI CALENDARISTICA, nu pe 24 de ore:
     ceva intrat aseara la 23:00, citit azi la 08:00, e „ieri" pentru omul de
     la receptie, nu „acum 9 ore". */
  it("trece pe ieri la schimbarea zilei, nu la 24 de ore", () => {
    const dimineata = new Date("2026-09-10T08:00:00");
    expect(candAVenit("2026-09-09T23:00:00", dimineata)).toBe("ieri");
  });

  it("spune alaltaieri", () => {
    expect(candAVenit("2026-09-08T10:00:00", acum)).toBe("alaltăieri");
  });

  it("trece pe data intreaga peste trei zile", () => {
    expect(candAVenit("2026-09-01T10:00:00", acum, fmt)).toBe("data:2026-9-1");
  });

  it("tace pe o data lipsa sau stricata", () => {
    expect(candAVenit(null, acum)).toBe("");
    expect(candAVenit("nu-e-o-data", acum)).toBe("");
  });
});
