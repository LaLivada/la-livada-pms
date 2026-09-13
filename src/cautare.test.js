/* Cautarea globala (faza 3, C1) — regulile pure: ce text pleaca la server,
 * cum arata un rezultat pe rand, cum se plimba selectia cu sagetile, cum
 * se citeste randul intors de `cauta_rezervari`.
 */
import { describe, it, expect, vi } from "vitest";
import { textDeCautat, descrieRezultat, urmatorulIndex, MIN_LITERE_CAUTARE_GLOBALA } from "./lib/cautare.js";

vi.mock("./supabase.js", () => ({ supabase: {} }));
const { camelRezultat } = await import("./data/cautare.js");

describe("textDeCautat", () => {
  it("taie spatiile de la capete si le strange pe cele dinauntru", () => {
    expect(textDeCautat("  Pop   escu ")).toBe("Pop escu");
  });

  /* Sub 3 caractere indexul trigram n-are ce cauta — nu pleaca nimic. */
  it("sub pragul de litere nu cere nimic", () => {
    expect(MIN_LITERE_CAUTARE_GLOBALA).toBe(3);
    expect(textDeCautat("ab")).toBe("");
    expect(textDeCautat(" ab ")).toBe("");
    expect(textDeCautat("abc")).toBe("abc");
  });

  it("tace pe lipsa", () => {
    expect(textDeCautat(null)).toBe("");
    expect(textDeCautat(undefined)).toBe("");
    expect(textDeCautat("   ")).toBe("");
  });
});

/* Randul asa cum il intoarce functia SQL: rezervarea e valoare compusa,
   in snake_case, cu titularul, camera si grupul alaturi. */
const RAND = {
  rezervare: {
    id: "r1", room_id: "c1005", guest_id: "g1", group_id: null,
    checkin: "2026-10-17T11:00:00Z", checkout: "2026-10-19T09:00:00Z", status: "confirmed",
    adults: 2, children: 0, source: "direct", tags: [], notes: null,
    occupant_last_name: null, occupant_first_name: null, occupant_phone: null,
    guest_code: "5WjrCBt6", seeded: false,
  },
  room_name: "1005", guest_last_name: "Popescu", guest_first_name: "Ana", guest_phone: "+40 722 111 222",
  group_name: null, potrivire: "nume",
};

describe("camelRezultat", () => {
  it("trece rezervarea prin camelRes si pune restul alaturi", () => {
    const r = camelRezultat(RAND);
    expect(r.rezervare.id).toBe("r1");
    expect(r.rezervare.roomId).toBe("c1005");
    expect(r.rezervare.guestCode).toBe("5WjrCBt6");
    expect(r.rezervare.occupantName).toBe("");
    expect(r.camera).toBe("1005");
    expect(r.oaspete).toEqual({ lastName: "Popescu", firstName: "Ana", phone: "+40 722 111 222" });
    expect(r.grup).toBe("");
    expect(r.potrivire).toBe("nume");
  });

  it("nu se sufoca pe un rand ciuntit", () => {
    const r = camelRezultat({});
    expect(r.rezervare.tags).toEqual([]);
    expect(r.camera).toBe("");
    expect(r.oaspete.lastName).toBe("");
  });
});

describe("descrieRezultat", () => {
  it("titularul, camera, perioada (anul o singura data) si statusul", () => {
    const d = descrieRezultat(camelRezultat(RAND));
    expect(d.titlu).toBe("Popescu Ana");
    expect(d.detalii).toEqual(["Camera 1005", "17.10 → 19.10.2026"]);
    expect(d.status).toBe("Confirmată");
    expect(d.nota).toBe("");
    expect(d.motiv).toBe("titular");
  });

  it("ocupantul diferit de titular si grupul apar in nota", () => {
    const d = descrieRezultat(camelRezultat({
      ...RAND, group_name: "Nunta Grand'Or",
      rezervare: { ...RAND.rezervare, occupant_last_name: "Olaru", occupant_first_name: "Florin" },
      potrivire: "ocupant",
    }));
    expect(d.nota).toBe("ocupant: Olaru Florin · grup: Nunta Grand'Or");
    expect(d.motiv).toBe("ocupant");
  });

  it("acelasi ocupant ca titularul nu se repeta", () => {
    const d = descrieRezultat(camelRezultat({
      ...RAND, rezervare: { ...RAND.rezervare, occupant_last_name: "Popescu", occupant_first_name: "Ana" },
    }));
    expect(d.nota).toBe("");
  });

  /* De ce a iesit randul: la telefon se vede telefonul, la cod — codul;
     altfel recepția se intreaba de ce apare un Popescu la cautarea „1005". */
  it("la potrivire pe telefon sau cod, arata ce s-a potrivit", () => {
    expect(descrieRezultat(camelRezultat({ ...RAND, potrivire: "telefon" })).nota).toBe("+40 722 111 222");
    expect(descrieRezultat(camelRezultat({ ...RAND, potrivire: "cod" })).nota).toBe("5WjrCBt6");
    expect(descrieRezultat(camelRezultat({ ...RAND, potrivire: "camera" })).motiv).toBe("cameră");
    expect(descrieRezultat(camelRezultat({ ...RAND, potrivire: "telefon" })).motiv).toBe("telefon");
  });

  it("fara titular, ocupantul e titlul; fara niciunul, „Fără nume”", () => {
    const faraTitular = { ...RAND, guest_last_name: null, guest_first_name: null,
      rezervare: { ...RAND.rezervare, occupant_last_name: "Olaru", occupant_first_name: "Florin" } };
    expect(descrieRezultat(camelRezultat(faraTitular)).titlu).toBe("Olaru Florin");
    expect(descrieRezultat(camelRezultat(faraTitular)).nota).toBe("");
    expect(descrieRezultat(camelRezultat({ ...RAND, guest_last_name: null, guest_first_name: null })).titlu).toBe("Fără nume");
  });

  it("un status necunoscut nu crapa randul", () => {
    expect(descrieRezultat(camelRezultat({ ...RAND, rezervare: { ...RAND.rezervare, status: "x" } })).status).toBe("x");
  });
});

describe("urmatorulIndex", () => {
  it("merge in jos si in sus si se invarte la capete", () => {
    expect(urmatorulIndex(0, 3, 1)).toBe(1);
    expect(urmatorulIndex(2, 3, 1)).toBe(0);
    expect(urmatorulIndex(0, 3, -1)).toBe(2);
    expect(urmatorulIndex(1, 3, -1)).toBe(0);
  });

  it("fara selectie, prima apasare alege primul (in jos) sau ultimul (in sus)", () => {
    expect(urmatorulIndex(-1, 3, 1)).toBe(0);
    expect(urmatorulIndex(-1, 3, -1)).toBe(2);
  });

  it("lista goala n-are ce selecta; un index iesit din lista revine la capat", () => {
    expect(urmatorulIndex(0, 0, 1)).toBe(-1);
    expect(urmatorulIndex(5, 3, 1)).toBe(0);
  });
});
