/* Fisa de cazare — suprafata pe care o vede un strain.
 *
 * Tabelul tine date de identitate: serie si numar de act, data si locul
 * nasterii, semnatura. Spec-ul (docs/fisa-cazare.md 3) spune ca fisa se
 * scrie o data si nu se citeste niciodata inapoi. Testele de aici sunt
 * felul in care afirmatia aia ramane adevarata si peste sase luni — nu
 * comentariul de deasupra ei.
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

describe.skipIf(!auConfig)("Fisa de cazare — vazuta din afara", () => {
  let anon;
  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("nu se poate citi tabelul", async () => {
    /* Cel mai important test din fisier. O politica permisiva pusa din
       greseala aici ar expune actele de identitate ale tuturor oaspetilor,
       dintr-o singura cerere. */
    const { data } = await anon.from("fise_cazare").select("*").limit(1);
    /* Ori eroare de permisiune, ori zero randuri — dar NICIODATA un rand.
       Scris asa, si nu ca `expect(error).toBeTruthy()`, fiindca PostgREST
       raspunde diferit dupa cum lipseste grantul sau lipseste politica, si
       amandoua sunt refuzuri bune. Ce nu e bun e sa vina continut. */
    expect(data ?? []).toHaveLength(0);
  });

  it("nu se poate scrie in tabel direct", async () => {
    const { error } = await anon.from("fise_cazare").insert({
      id: "test", reservation_id: "inexistent", nume: "X", prenume: "Y",
    });
    expect(error).toBeTruthy();
  });

  it("nu se poate sterge din tabel", async () => {
    const { error } = await anon.from("fise_cazare").delete().eq("id", "inexistent");
    expect(error).toBeTruthy();
  });
});
