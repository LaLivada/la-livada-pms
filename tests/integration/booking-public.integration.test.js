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

  /* Funcția nu mai întoarce o listă de TIPURI cu câte camere sunt libere,
     ci o listă de PROPUNERI: pentru fiecare tip care poate găzdui grupul,
     o repartizare completă, cu prețul ei. Numărătoarea de camere nu se mai
     face în browser. Testele de mai jos au fost rescrise pe forma nouă —
     rămăseseră pe `roomTypes`, care nu mai există. */
  describe("public_availability", () => {
    it("întoarce propuneri complete, cu preț", async () => {
      const { data, error } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202),
        p_adults: 2, p_children: 0,
      });
      expect(error).toBeNull();
      expect(data.options).toBeInstanceOf(Array);
      expect(data.nights).toBe(2);
      for (const o of data.options) {
        expect(o).toHaveProperty("roomType");
        expect(o.roomsNeeded).toBeGreaterThan(0);
        expect(o.total).toBeGreaterThan(0);
        expect(o.rooms).toHaveLength(o.roomsNeeded);
      }
    });

    /* Camerele au capacități diferite ÎN INTERIORUL aceluiași tip, iar o
       propunere poate împărți grupul în mai multe camere. Nu mai există un
       `maxGuests` de comparat; ce trebuie să rămână adevărat e că
       repartizarea chiar duce tot grupul, nu o parte din el. */
    it("propunerile duc tot grupul, nu o parte din el", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202),
        p_adults: 3, p_children: 0,
      });
      for (const o of data.options) {
        const adulti = o.rooms.reduce((s, c) => s + c.adults, 0);
        expect(adulti).toBe(3);
      }
    });

    /* Verificare pe structură, nu pe potrivire de text: un regex de tipul
       /guest/ ar prinde și `guests`, care e o informație legitimă. */
    it("expune STRICT câmpurile necesare, nimic altceva", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202), p_adults: 2,
      });
      expect(Object.keys(data).sort())
        .toEqual(["checkIn", "checkOut", "guests", "nights", "options"]);
      for (const o of data.options) {
        expect(Object.keys(o).sort())
          .toEqual(["roomType", "rooms", "roomsNeeded", "total"]);
        for (const c of o.rooms) {
          expect(Object.keys(c).sort()).toEqual(["adults", "children", "roomType"]);
        }
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

    /* Aici era un test care cerea ca un grup de 8 să fie REFUZAT, cu
       îndrumare spre recepție. Nu mai e adevărat, și nu din greșeală: de
       când funcția întoarce propuneri, un grup mare nu mai e o problemă, e
       o repartizare — 8 adulți primesc patru tiny houses. Testul a fost
       scos, nu rescris ca să treacă: comportamentul pe care îl apăra a fost
       înlocuit intenționat.

       Testele de mai jos apără regula care l-a înlocuit, la amândouă
       capetele. Merită apărată explicit fiindcă un plafon fix de camere e
       ușor de reintrodus din neatenție, iar atunci grupurile mari s-ar lovi
       de el fără ca nimeni să observe: din formular nu se ajunge acolo
       decât cu un grup adevărat, mare, adică exact clientul pe care nu
       vrei să-l pierzi. */
    it("mai multe persoane înseamnă mai multe camere, fără plafon fix", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202), p_adults: 30,
      });
      expect(data.error).toBeUndefined();
      expect(data.options.length).toBeGreaterThan(0);
      // Un plafon fix de 5 camere ar tăia exact aici.
      expect(Math.max(...data.options.map((o) => o.roomsNeeded))).toBeGreaterThan(5);
      for (const o of data.options) {
        expect(o.rooms.reduce((s, c) => s + c.adults, 0)).toBe(30);
      }
    });

    /* Capătul celălalt. Fără el, „fără plafon fix" s-ar putea citi drept
       „fără nicio limită", iar cineva ar putea scoate și limita reală. */
    it("peste locurile pensiunii trimite la telefon", async () => {
      const { data } = await anon.rpc("public_availability", {
        p_checkin: peste(200), p_checkout: peste(202), p_adults: 500,
      });
      expect(data.error).toMatch(/sună-ne/i);
    });
  });

  /* Aici stăteau validările lui create_public_booking, apelate direct cu
     cheia anonimă. Nu mai pot sta: funcția a fost închisă și lăsată doar
     pe `service_role`, fiindcă rezervările trec acum prin funcția edge
     `booking-create`, care verifică întâi captcha și ține camera pe hold.
     Chemată din browser, ocolea exact pașii aceia.

     Testele rămăseseră scrise pe drumul vechi. Patru dintre ele picau
     zgomotos, cu „permission denied" în loc de mesajul de validare — dar
     două treceau, fiindcă cereau doar ca `error` să nu fie null, iar un
     refuz de permisiune e și el o eroare. Alea două erau mai rele decât
     cele picate: ar fi rămas verzi și dacă validarea dispărea cu totul.
     De-asta nu le-am rescris ca să treacă, ci le-am înlocuit cu ce chiar
     are sens să verificăm de aici: că poarta e închisă.

     Validările propriu-zise nu se pot muta în fișierul ăsta fără să-i
     încalce regula de aur — ar însemna cereri către o funcție care, dacă
     validarea chiar e stricată, creează o rezervare adevărată în calendar.
     Ele se verifică în suita E2E, pe un proiect separat. */
  describe("create_public_booking — poarta închisă", () => {
    it("nu poate fi apelată cu cheia anonimă", async () => {
      const { error } = await anon.rpc("create_public_booking", {
        p_checkin: peste(200), p_checkout: peste(202),
        p_last_name: "Test", p_first_name: "Integrare",
        p_phone: "+40700000123", p_email: null,
        p_city: "Cluj", p_county: "Cluj", p_country: "România",
        p_rooms: [{ roomType: "tiny", adults: 2, children: 0 }],
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(error).not.toBeNull();
      /* Refuzul trebuie să fie lipsa dreptului, nu o validare care se
         întâmplă să pice. Altfel testul ar trece și dacă funcția redevine
         apelabilă, doar fiindcă datele de test sunt invalide. */
      expect(`${error.message} ${error.code || ""}`.toLowerCase())
        .toMatch(/permission|denied|42501|pgrst202/);
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
