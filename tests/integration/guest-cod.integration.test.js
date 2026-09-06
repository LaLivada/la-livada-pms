/* Guest app, pasul 1 — suprafata pe care o vede un strain.
 *
 * Codul de sejur are cinci caractere, deci spatiul lui e de 916 milioane,
 * nu de 2^128. Socoteala din docs/guest-app.md 4.1 se sprijina pe doua
 * presupuneri, si amandoua se verifica aici, nu se cred pe cuvant:
 *
 *   1. singura cale spre o rezervare e poarta, iar poarta nu e apelabila
 *      din afara — altfel plafonul de cautari esuate n-ar mai fi trecut
 *      de nimeni si lacatul ar sta pe usa deschisa;
 *   2. codul insusi nu se poate citi de nicaieri; unul scurs face de
 *      prisos orice ghicire.
 *
 * Motivul pentru care testele astea nu sunt de prisos: in Postgres, orice
 * functie noua primeste EXECUTE pentru PUBLIC. O revocare scrisa doar
 * pentru `anon` arata corect si nu face nimic. S-a intamplat deja in
 * proiectul asta, la create_public_booking.
 *
 * REGULA DE AUR, ca la restul testelor de integrare: fiecare caz verifica
 * un REFUZ. Niciun test nu creeaza si nu modifica date.
 *
 * Rulare:  npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const auConfig = Boolean(URL && ANON_KEY);

describe.skipIf(!auConfig)("Guest app — codul de sejur, vazut din afara", () => {
  let anon;
  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  /* Poarta si generatorul sunt unelte interne. Functiile de citire din
     pasul 2 le vor chema din interior, fiind ele insele security definer —
     deci nimeni din afara n-are motiv sa ajunga la ele. */
  const functiiInterne = [
    ["guest_poarta", { p_cod: "Ajh6k" }],
    ["guest_code_nou", {}],
  ];

  it.each(functiiInterne)("nu poate chema %s", async (nume, argumente) => {
    const { error } = await anon.rpc(nume, argumente);
    expect(error).not.toBeNull();
  });

  /* Daca poarta ar fi apelabila, un atacator ar avea exact unealta de care
     are nevoie: raspuns imediat, cod cu cod. Verificam si ca refuzul nu e
     din alt motiv (argument gresit), ci chiar lipsa dreptului. */
  it("refuzul portii e lipsa dreptului, nu o eroare de argument", async () => {
    const { error } = await anon.rpc("guest_poarta", { p_cod: "Ajh6k" });
    expect(error).not.toBeNull();
    expect(`${error.message} ${error.code || ""}`.toLowerCase())
      .toMatch(/permission|denied|not exist|42501|pgrst202/);
  });

  /* Contorul de cautari esuate e chiar evidenta atacului. Citit din afara,
     ar spune atacatorului cat mai are pana in plafon si care coduri au fost
     deja incercate. */
  it("nu poate citi contorul de cautari esuate", async () => {
    const { data, error } = await anon.from("guest_code_attempts").select("*").limit(5);
    if (!error) expect(data).toEqual([]);
  });

  it("nu poate scrie in contorul de cautari esuate", async () => {
    const { error } = await anon.from("guest_code_attempts").insert({ cod: "xxxxx" });
    expect(error).not.toBeNull();
  });

  /* Un cod citit direct din tabel ar face toata socoteala de mai sus
     inutila — n-ar mai fi nimic de ghicit. */
  it("nu poate citi coduri de sejur din reservations", async () => {
    const { data, error } = await anon.from("reservations").select("guest_code").limit(5);
    if (!error) expect(data).toEqual([]);
  });

  /* Nici pe ocolite, prin functia publica de rezervari: ea intoarce un
     jsonb construit explicit, iar codul de sejur n-are ce cauta in el. */
  it("codul de sejur nu apare in raspunsul public de disponibilitate", async () => {
    const peste = (zile) => {
      const d = new Date();
      d.setDate(d.getDate() + zile);
      d.setHours(14, 0, 0, 0);
      return d.toISOString();
    };
    const { data, error } = await anon.rpc("public_availability", {
      p_checkin: peste(200), p_checkout: peste(202), p_adults: 2, p_children: 0,
    });
    expect(error).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/guest_?code/i);
  });
});
