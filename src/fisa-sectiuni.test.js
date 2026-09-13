/* Fisa de rezervare in sectiuni (faza 3, C4) — regulile pure: care
 * sectiuni pornesc deschise si ce scrie in capul lor cand sunt pliate.
 * Ce s-ar strica tacut: o rezervare noua cu „Oaspete" pliat (omul nu vede
 * ca trebuie sa aleaga clientul); un rezumat care trece ziua prin Date si
 * aluneca o zi in alt fus; ocupantul repetat cand e acelasi cu clientul.
 */
import { describe, it, expect } from "vitest";
import {
  sectiuniImplicite, TOATE_DESCHISE, rezumatOaspete, rezumatSejur, rezumatPret, rezumatNote,
  rezumatAcces, rezumatFisa,
} from "./lib/fisa-sectiuni.js";

describe("sectiuniImplicite", () => {
  it("noua: de completat deschise, restul pliate; editare: toate pliate", () => {
    expect(sectiuniImplicite({ editing: false })).toEqual({ oaspete: true, sejur: true, pret: true, note: false, acces: false });
    expect(sectiuniImplicite({ editing: true })).toEqual({ oaspete: false, sejur: false, pret: false, note: false, acces: false });
    expect(sectiuniImplicite()).toEqual(sectiuniImplicite({ editing: false }));
    expect(TOATE_DESCHISE).toEqual({ oaspete: true, sejur: true, pret: true, note: true, acces: true });
  });
});

describe("rezumatOaspete", () => {
  it("clientul, ocupantul doar daca e altul, persoanele", () => {
    expect(rezumatOaspete({ nume: "Popescu Ana", adults: 2, children: 1 })).toBe("Popescu Ana · 2 adulți, 1 copil");
    expect(rezumatOaspete({ nume: "Popescu Ana", ocupant: "Olaru Florin", adults: 1 })).toBe("Popescu Ana · ocupant Olaru Florin · 1 adult");
    expect(rezumatOaspete({ nume: "Popescu Ana", ocupant: "Popescu Ana", adults: 2 })).toBe("Popescu Ana · 2 adulți");
  });
  it("fara client, spune ce e de facut", () => {
    expect(rezumatOaspete({})).toBe("Alege clientul");
    expect(rezumatOaspete({ grup: true })).toBe("Alege clientul principal");
  });
});

describe("rezumatSejur", () => {
  /* Ziua vine din sirul formularului, nu prin Date: la vest de Greenwich
     „2026-10-17T14:00" ar fi putut aluneca pe 16. */
  it("camera, perioada cu noptile, statusul", () => {
    expect(rezumatSejur({ camere: ["1005"], checkin: "2026-10-17T14:00", checkout: "2026-10-19T12:00", status: "confirmed" }))
      .toBe("1005 · 17.10 → 19.10 (2 nopți) · Confirmată");
    expect(rezumatSejur({ camere: ["1005"], checkin: "2026-10-17T14:00", checkout: "2026-10-18T12:00" }))
      .toBe("1005 · 17.10 → 18.10 (1 noapte)");
  });
  it("mai multe camere: lista scurta sau numarul lor; fara camera spune", () => {
    expect(rezumatSejur({ camere: ["1001", "1002"] })).toBe("1001, 1002");
    expect(rezumatSejur({ camere: ["1001", "1002", "1003", "1004"] })).toBe("4 camere");
    expect(rezumatSejur({ camere: [] })).toBe("Fără cameră");
  });
});

describe("rezumatPret / rezumatNote / rezumatAcces", () => {
  it("pretul, cu mentiunea manual", () => {
    expect(rezumatPret({ total: 600 })).toBe("600 lei");
    expect(rezumatPret({ total: 550, manual: true })).toBe("550 lei · preț manual");
    expect(rezumatPret({})).toBe("0 lei");
  });
  it("etichetele, nota scurtata, mesajele; sau „Fără note”", () => {
    expect(rezumatNote({ tags: ["vip"], notes: "vine târziu", mesaje: 2 })).toBe("vip · „vine târziu” · 2 mesaje");
    expect(rezumatNote({ notes: "a".repeat(50) })).toBe(`„${"a".repeat(40)}…”`);
    expect(rezumatNote({ notes: "  spații   multe  " })).toBe("„spații multe”");
    expect(rezumatNote({ mesaje: 1 })).toBe("1 mesaj");
    expect(rezumatNote({})).toBe("Fără note");
  });
  it("orele cazarii", () => {
    expect(rezumatAcces({ checkin: "2026-10-17T14:00", checkout: "2026-10-19T12:00" })).toBe("Orele 14:00 → 12:00");
    expect(rezumatAcces({})).toBe("");
  });
});

describe("rezumatFisa", () => {
  it("randul din capul dialogului", () => {
    expect(rezumatFisa({ nume: "Popescu Ana", camera: "1005", checkin: "2026-10-17T14:00", checkout: "2026-10-19T12:00", total: 600, status: "checkedin" }))
      .toBe("Popescu Ana · Camera 1005 · 17.10 → 19.10 · 2 nopți · 600 lei · Checked-in");
    expect(rezumatFisa({ total: 0 })).toBe("Fără nume · 0 lei");
  });
});
