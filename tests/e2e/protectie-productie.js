/* Refuzul de a rula testele E2E pe baza de productie.
 *
 * DE CE EXISTA ACEST FISIER, pe larg — merita citit inainte de a-l ocoli:
 *
 * Testele E2E parcurg fluxul complet, inclusiv emiterea unei facturi.
 * Emiterea consuma un numar din seria de facturare, printr-o functie
 * tranzactionala (next_invoice_number). Acel numar NU se poate elibera:
 *  - numerotarea trebuie sa fie strict secventiala, fara goluri;
 *  - o factura emisa nu poate fi stearsa (nu exista policy de delete pe
 *    `invoices`, intentionat — vezi schema.sql);
 *  - singura corectie posibila e stornarea, care consuma inca un numar.
 *
 * Adica un singur test rulat din greseala pe productie lasa in
 * contabilitate doua documente fiscale fantoma, permanent. De aici
 * refuzul: implicit, testele nu pornesc daca URL-ul bazei arata a
 * productie.
 *
 * Pentru rulare corecta: un proiect Supabase separat (sau un branch
 * Supabase), cu propriile chei in .env.e2e.
 */

/* Proiectul real al aplicatiei. Daca se muta vreodata, se schimba aici —
   e singurul loc in care e scris in testare. */
const PROIECT_PRODUCTIE = "suoowrginsliyrbxqeap";

export function verificaBazaDeTest() {
  const url = process.env.VITE_SUPABASE_URL || "";
  const permisExplicit = process.env.E2E_PERMITE_PRODUCTIE === "da-stiu-ce-fac";

  if (!url) {
    throw new Error(
      "VITE_SUPABASE_URL nu e setata. Testele E2E au nevoie de o baza de test " +
      "(vezi tests/e2e/README.md)."
    );
  }

  if (url.includes(PROIECT_PRODUCTIE) && !permisExplicit) {
    throw new Error(
      "OPRIT: testele E2E ar rula pe baza de PRODUCTIE (" + PROIECT_PRODUCTIE + ").\n" +
      "Fluxul emite o factura reala si consuma un numar din serie, care nu se mai\n" +
      "poate elibera — factura emisa nu se poate sterge, iar stornarea consuma inca\n" +
      "un numar. Ai ramane cu doua documente fantoma in contabilitate.\n\n" +
      "Foloseste un proiect Supabase separat pentru teste (vezi tests/e2e/README.md)."
    );
  }
}

/* Marcaj pus in toate datele create de teste, ca sa poata fi gasite si
   sterse usor daca raman in urma unei rulari intrerupte. */
export const MARCAJ_TEST = "E2E-TEST";

/* Nume unic per rulare — doua rulari in paralel nu se incurca, iar la
   nevoie se vede exact ce rulare a lasat ce date. */
export function numeUnic(prefix) {
  return `${prefix}-${MARCAJ_TEST}-${Date.now().toString(36)}`;
}
