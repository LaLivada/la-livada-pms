/* Testele suprafeței publice de rezervări — ce poate și ce nu poate face
 * un vizitator nelogat, prin exact aceleași apeluri pe care le va face
 * site-ul.
 *
 * REGULA, ca la restul testelor de integrare: nimic din acest fișier nu
 * creează date. Toate cazurile verifică fie o citire, fie un REFUZ.
 *
 * Crearea propriu-zisă de rezervări (idempotență, grup, cursă, atomicitate
 * pe grup parțial) nu poate fi testată aici fără să lase rezervări reale
 * în calendar. Acele scenarii se verifică:
 *   · în tranzacții cu ROLLBACK, rulate manual în SQL Editor;
 *   · în suita E2E, pe un proiect Supabase separat (vezi tests/e2e/README.md).
 *
 * Rulare:  npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const auConfig = Boolean(URL && ANON_KEY);

/* Date suficient de departe încât să nu se lovească de rezervări reale. */
const peste = (zile) => {
  const d = new Date();
  d.setDate(d.getDate() + zile);
  d.setHours(14, 0, 0, 0);
  return d.toISOString();
};

describe.skipIf(!auConfig)("Suprafața publică de rezervări", () => {
  let anon;
  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  describe("public_availability", () => {
    it("întoarce tipurile de cameră disponibile, cu preț", async () => {
      const { data, error } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202),
        p_adults: 2, p_children: 0,
      });
      expect(error).toBeNull();
      expect(data.roomTypes).toBeInstanceOf(Array);
      expect(data.nights).toBe(2);
      for (const t of data.roomTypes) {
        expect(t).toHaveProperty("roomType");
        expect(t).toHaveProperty("available");
        expect(t.price).toBeGreaterThan(0);
      }
    });

    /* Camerele au capacități diferite ÎN INTERIORUL aceluiași tip, deci
       filtrarea trebuie făcută pe capacitate, nu pe tip. */
    it("nu oferă camere mai mici decât numărul de persoane", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202),
        p_adults: 3, p_children: 0,
      });
      for (const t of data.roomTypes) {
        expect(t.maxGuests).toBeGreaterThanOrEqual(3);
      }
    });

    /* Verificare pe structură, nu pe potrivire de text: un regex de tipul
       /guest/ ar prinde și `maxGuests`, care e o informație legitimă. */
    it("expune STRICT câmpurile necesare, nimic altceva", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202), p_adults: 2,
      });
      expect(Object.keys(data).sort())
        .toEqual(["checkIn", "checkOut", "nights", "roomTypes"]);
      for (const t of data.roomTypes) {
        expect(Object.keys(t).sort())
          .toEqual(["available", "maxGuests", "price", "roomType"]);
      }
    });

    const limite = [
      ["sejur mai lung de 30 de nopți", { p_checkin: peste(200), p_checkout: peste(240) }, /30 de nopți/i],
      ["dată în trecut",                { p_checkin: peste(-10), p_checkout: peste(-8) },  /trecut/i],
      ["dată prea îndepărtată",         { p_checkin: peste(500), p_checkout: peste(502) }, /400 de zile/i],
      ["plecare înaintea sosirii",      { p_checkin: peste(202), p_checkout: peste(200) }, /invalidă/i],
    ];
    it.each(limite)("respinge %s", async (_nume, params, tipar) => {
      const { data } = await anon.rpc("public_availability", { ...params, p_adults: 2 });
      expect(data.error).toMatch(tipar);
    });

    it("respinge grupurile prea mari, cu îndrumare spre recepție", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202), p_adults: 8,
      });
      expect(data.error).toMatch(/recepția/i);
    });
  });

  describe("create_public_booking — validări (fără a crea nimic)", () => {
    /* Fiecare caz e respins ÎNAINTE de orice inserare, deci nu atinge
       baza. Cheia de idempotență e nouă de fiecare dată, ca respingerea
       să vină de la validare, nu de la o cerere anterioară. */
    const cheie = () => crypto.randomUUID();
    const bazaCerere = {
      p_checkin: peste(200), p_checkout: peste(202),
      p_last_name: "Test", p_first_name: "Integrare",
      p_phone: "+40700000123", p_email: null,
      p_city: "Cluj", p_county: "Cluj", p_country: "România",
      p_rooms: [{ roomType: "tiny", adults: 2, children: 0 }],
    };

    it("refuză fără nume sau telefon", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: cheie(),
        p_last_name: "", p_first_name: "", p_phone: "",
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/obligatorii/i);
    });

    it("refuză un email invalid", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: cheie(), p_email: "nu-e-email",
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/email/i);
    });

    it("refuză o dată în trecut", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: cheie(),
        p_checkin: peste(-10), p_checkout: peste(-8),
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/trecut/i);
    });

    it("refuză mai mult de 5 camere", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: cheie(),
        p_rooms: Array.from({ length: 6 }, () => ({ roomType: "tiny", adults: 2 })),
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/1 și 5 camere/i);
    });

    it("refuză o listă goală de camere", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: cheie(), p_rooms: [],
      });
      expect(error).not.toBeNull();
    });

    it("refuză un tip de cameră inventat", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: cheie(),
        p_rooms: [{ roomType: "penthouse", adults: 2 }],
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/tip de cameră/i);
    });

    it("refuză fără cheie de idempotență", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        ...bazaCerere, p_idempotency_key: null,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("Ce NU poate face un vizitator", () => {
    it("nu poate apela create_booking (drumul vechi, închis)", async () => {
      const { error } = await anon.rpc("create_booking", {
        p_room_id: "r1001", p_checkin: peste(200), p_checkout: peste(202),
        p_last_name: "X", p_first_name: "Y", p_phone: "+40700000999",
        p_email: null, p_city: "c", p_county: "c", p_country: "România",
      });
      expect(error).not.toBeNull();
    });

    it("nu poate citi tabelul de rezervări publice", async () => {
      const { data, error } = await anon.from("public_bookings").select("*").limit(1);
      if (!error) expect(data).toEqual([]);
    });

    it("nu poate consuma numere de confirmare", async () => {
      const { error } = await anon.rpc("next_confirmation_number");
      expect(error).not.toBeNull();
    });

    it("nu găsește nimic cu un token inventat", async () => {
      const { data } = await anon.rpc("public_booking_by_token", {
        p_token: "token-inexistent-" + "0".repeat(20),
      });
      expect(data).toBeNull();
    });
  });
});
