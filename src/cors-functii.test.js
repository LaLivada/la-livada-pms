/* Funcțiile edge chemate din browser trebuie să lase browserul să trimită
 * `x-client-info`.
 *
 * `supabase.functions.invoke` adaugă singur antetul `x-client-info`
 * („supabase-js/2.112.3; runtime=web"). Dacă răspunsul la preflight nu-l
 * permite, browserul nu mai trimite cererea adevărată deloc: funcția pornește,
 * răspunde 204 la OPTIONS, se oprește, și nu scrie nicio eroare nicăieri.
 * În jurnal nu se vede decât un OPTIONS singuratic, iar omul primește
 * „nu am putut contacta serviciul" — un mesaj care trimite spre rețea sau
 * spre token, adică fix în partea greșită.
 *
 * Așa a căzut „Verifică legătura" de la Oblio pe 17 septembrie 2026: lista de
 * anteturi era scrisă de mână și nu cuprindea `x-client-info`. Leacul, pe care
 * îl foloseau deja access-provider, device-provider și caldav, e să oglindim
 * `Access-Control-Request-Headers`. Nu slăbește nimic: antetul spune doar ce
 * are voie browserul să trimită, nu cine are voie să cheme.
 *
 * Testul își ia singur lista de funcții din apelurile `functions.invoke` din
 * `src/`, deci acoperă și ce se adaugă mâine.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

function fisiereSursa(d, acc = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) fisiereSursa(p, acc);
    else if (/\.(js|jsx)$/.test(n) && !n.includes(".test.")) acc.push(p);
  }
  return acc;
}

/* Numele funcției e prima bucată din calea cerută:
   `functions.invoke("caldav/import/${slug}")` → caldav. */
function functiiChemate() {
  const nume = new Set();
  for (const f of fisiereSursa("src")) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/functions\.invoke\(\s*(["'`])([^"'`]+)\1/g)) {
      nume.add(m[2].split("/")[0]);
    }
  }
  return [...nume].sort();
}

describe("CORS-ul funcțiilor edge chemate din browser", () => {
  const functii = functiiChemate();

  it("găsește apelurile din src (altfel testul n-ar verifica nimic)", () => {
    expect(functii.length).toBeGreaterThan(0);
  });

  for (const nume of functii) {
    it(`${nume}: preflight-ul permite x-client-info`, () => {
      const cale = join("supabase", "functions", nume, "index.ts");
      expect(existsSync(cale), `${cale} nu există, dar src o cheamă`).toBe(true);
      const text = readFileSync(cale, "utf8");
      /* Ori oglindește ce cere browserul, ori numește antetul pe față. */
      const oglindeste = text.includes("Access-Control-Request-Headers");
      const numeste = /Access-Control-Allow-Headers[\s\S]{0,200}?x-client-info/i.test(text);
      expect(
        oglindeste || numeste,
        `${cale}: Access-Control-Allow-Headers nu acoperă x-client-info, deci browserul nu va trimite cererea`,
      ).toBe(true);
    });
  }
});
