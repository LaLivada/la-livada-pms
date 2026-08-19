/* Teste de integrare pentru RLS — ruleaza pe baza de date REALA.
 *
 * De ce exista: pana acum, singura dovada ca politicile RLS chiar
 * protejeaza ceva era ca cineva le citea si le credea corecte. Testele
 * de mai jos verifica efectul lor prin API-ul public, exact pe calea pe
 * care ar veni si un atacator.
 *
 * REGULA DE AUR: fiecare test verifica un lucru care trebuie sa fie
 * REFUZAT. Niciun test nu creeaza si nu modifica date. Un test care ar
 * avea nevoie sa scrie ceva nu-si are locul aici — nu vrem sa lasam
 * gunoi intr-o baza de productie.
 *
 * Rulare:  npm run test:integration
 * NU ruleaza la `npm test` si nici in CI (vezi vite.config.js): are
 * nevoie de cheile din .env si de acces la retea.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/* Fara chei nu are rost sa dam erori derutante — spunem clar de ce. */
const auConfig = Boolean(URL && ANON_KEY);

describe.skipIf(!auConfig)("RLS — utilizator anonim (nelogat)", () => {
  let anon;

  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  /* Un client anonim nu trebuie sa vada nimic din datele operationale.
     Postgres raspunde la un SELECT blocat de RLS cu zero randuri (nu cu
     eroare), deci verificam lungimea, nu prezenta unei erori. */
  const tabeleInterzise = [
    "reservations", "guests", "staff", "billing_customers",
    "invoices", "payments", "folio_items", "app_state", "rooms",
  ];

  it.each(tabeleInterzise)("nu poate citi %s", async (tabel) => {
    const { data, error } = await anon.from(tabel).select("*").limit(5);
    // Fie eroare explicita (permission denied dupa REVOKE), fie 0 randuri
    // (RLS blocheaza tacit). Ambele sunt corecte; ce NU e acceptabil e
    // sa se intoarca date.
    if (!error) expect(data).toEqual([]);
  });

  it("nu poate insera o rezervare direct in tabel", async () => {
    const { error } = await anon.from("reservations").insert({
      id: "test-nu-trebuie-sa-existe",
      room_id: "r1001",
      checkin: new Date(Date.now() + 86400000).toISOString(),
      checkout: new Date(Date.now() + 172800000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("nu poate insera un oaspete direct in tabel", async () => {
    const { error } = await anon.from("guests").insert({
      id: "test-nu-trebuie-sa-existe",
      last_name: "Test", first_name: "Test", phone: "+40700000000",
      city: "Test", county: "Test",
    });
    expect(error).not.toBeNull();
  });

  it("nu poate modifica tarifele", async () => {
    const { error, data } = await anon.from("rates")
      .update({ base_price: 1 }).eq("room_type", "tiny").select();
    // Sau eroare, sau zero randuri afectate — in niciun caz o modificare.
    if (!error) expect(data).toEqual([]);
  });

  it("nu poate sterge rezervari", async () => {
    const { error, data } = await anon.from("reservations")
      .delete().eq("id", "orice").select();
    if (!error) expect(data).toEqual([]);
  });

  it("nu poate citi matricea de permisiuni de facturare", async () => {
    const { data, error } = await anon.from("billing_permissions").select("*");
    if (!error) expect(data).toEqual([]);
  });
});

describe.skipIf(!auConfig)("create_booking — RPC publica", () => {
  let anon;
  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  /* Toate cazurile de mai jos sunt respinse INAINTE de orice insert, deci
     nu ating baza. Nu testam aici limita de 5/ora: ar insemna sa cream
     rezervari reale intr-o baza de productie. */

  it("refuza o rezervare fara nume/telefon", async () => {
    const { error } = await anon.rpc("create_booking", {
      p_room_id: "r1001",
      p_checkin: new Date(Date.now() + 86400000).toISOString(),
      p_checkout: new Date(Date.now() + 172800000).toISOString(),
      p_last_name: "", p_first_name: "", p_phone: "",
      p_email: null, p_city: "Cluj", p_county: "Cluj", p_country: "România",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/obligatorii/i);
  });

  it("refuza o rezervare in trecut", async () => {
    const { error } = await anon.rpc("create_booking", {
      p_room_id: "r1001",
      p_checkin: new Date(Date.now() - 30 * 86400000).toISOString(),
      p_checkout: new Date(Date.now() - 29 * 86400000).toISOString(),
      p_last_name: "Test", p_first_name: "Integrare", p_phone: "+40700000001",
      p_email: null, p_city: "Cluj", p_county: "Cluj", p_country: "România",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/trecut/i);
  });

  it("refuza plecarea inaintea sosirii", async () => {
    const t = Date.now() + 10 * 86400000;
    const { error } = await anon.rpc("create_booking", {
      p_room_id: "r1001",
      p_checkin: new Date(t + 86400000).toISOString(),
      p_checkout: new Date(t).toISOString(),
      p_last_name: "Test", p_first_name: "Integrare", p_phone: "+40700000002",
      p_email: null, p_city: "Cluj", p_county: "Cluj", p_country: "România",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/plecare|sosir/i);
  });
});

describe.skipIf(!auConfig)("Functii interne — nu trebuie apelabile anonim", () => {
  let anon;
  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  /* Calculul de pret nu e expus public: daca ar fi, cineva ar putea
     cartografia tarifele fara sa treaca prin available_rooms. */
  it("stay_total nu e apelabila anonim", async () => {
    const { error } = await anon.rpc("stay_total", {
      p_room_id: "r1001",
      p_checkin: new Date().toISOString(),
      p_checkout: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("nightly_rate nu e apelabila anonim", async () => {
    const { error } = await anon.rpc("nightly_rate", {
      p_room_type: "tiny",
      p_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).not.toBeNull();
  });

  /* next_invoice_number e security definer si apelabila, dar are o
     verificare interna de permisiune — un anonim nu poate consuma
     numere din serie. Daca testul asta pica, s-a spart numerotarea. */
  it("next_invoice_number refuza un apelant fara permisiune", async () => {
    const { error } = await anon.rpc("next_invoice_number", { p_series: "LIV" });
    expect(error).not.toBeNull();
  });

  it("next_receipt_number refuza un apelant fara permisiune", async () => {
    const { error } = await anon.rpc("next_receipt_number", { p_series: "CH" });
    expect(error).not.toBeNull();
  });
});
