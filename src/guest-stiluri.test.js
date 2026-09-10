/* Foaia de stil a paginii oaspetelui e un template literal dintr-un fisier
 * .js, iar asta are o capcana care s-a inchis peste mine de cinci ori in
 * proiectul asta: un backtick scris intr-un comentariu CSS inchide sirul.
 * Rezultatul nu e o eroare care sa spuna asta, ci un 500 pe modul sau un
 * mesaj despre un punct si virgula lipsa, la sute de linii distanta.
 *
 * Fisierul nu e importat de niciun alt test — se incarca doar in main.jsx,
 * la rulare — deci pana acum nimic din suita nu-l atingea.
 *
 * DE CE IMPORTUL E DINAMIC, in fiecare test, si nu sus de tot: un import
 * obisnuit se rezolva inaintea oricarui test, deci un sir rupt facea
 * fisierul intreg sa nu porneasca, si tocmai testul care ar fi numit cauza
 * nu mai apuca sa ruleze. Verificat: cu backtick pus intentionat, suita
 * cadea cu o eroare de parsare si fara niciun cuvant despre backticks.
 * Asa, verificarea pe sursa merge oricum, iar mesajul ei ajunge la om.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/* Citit de pe disc, nu prin import.meta.url: vitest nu da mereu o adresa de
   tip file: pentru fisierul de test, iar fileURLToPath cade cu „The URL
   must be of scheme file". Radacina proiectului e directorul din care
   ruleaza vitest. */
const SURSA = readFileSync("src/guest/styles.js", "utf8");
const BT = String.fromCharCode(96);
const CAP = "export const STILURI = " + BT;

const interiorulSirului = () => {
  const de = SURSA.indexOf(CAP);
  if (de < 0) throw new Error("Nu am gasit inceputul foii de stil in sursa.");
  return SURSA.slice(de + CAP.length, SURSA.lastIndexOf(BT));
};

describe("foaia de stil, verificata pe sursa", () => {
  it("nu are backticks în interior", () => {
    const vinovate = interiorulSirului().split("\n")
      .map((rand, i) => (rand.includes(BT) ? `${i + 1}: ${rand.trim()}` : null))
      .filter(Boolean);
    expect(
      vinovate,
      "un backtick închide șirul — scrie numele proprietății simplu, fără ele",
    ).toEqual([]);
  });

  /* Numarul de acolade trebuie sa fie egal. E verificarea cea mai ieftina
     care prinde o foaie taiata la mijloc. */
  it("are acoladele în echilibru", () => {
    const corp = interiorulSirului();
    expect((corp.match(/{/g) || []).length).toBe((corp.match(/}/g) || []).length);
  });
});

describe("foaia de stil, încărcată", () => {
  it("se importă fără să crape", async () => {
    const { STILURI } = await import("./guest/styles.js");
    expect(typeof STILURI).toBe("string");
    expect(STILURI.length).toBeGreaterThan(1000);
  });

  it("conține regulile de care depinde pagina", async () => {
    const { STILURI } = await import("./guest/styles.js");
    for (const bucata of [".g-hero", ".g-usa", ".g-cod", ".g-scurtatura",
                          ".g-fereastra", ".g-vreme", ".g-leg", ".g-atractie",
                          ".g-harta-cadru", ".g-harta-rama",
                          ".g-actiune", ".g-instructiuni", ".g-qr",
                          ".g-total", ".g-reg", ".g-legatura",
                          ".g-legatura-rand", ".g-puncte a",
                          ".g-fisa", ".g-fisa-ajutor", ".g-fisa-trimit", ".g-camp",
                          ".g-semnatura", ".g-semnatura-panza"]) {
      expect(STILURI).toContain(bucata);
    }
  });

  /* Panza de semnat traduce punctele din dreptunghiul ei in coordonatele
     viewBox-ului printr-o regula de trei, si presupune ca cele doua au
     acelasi raport. Desincronizate, linia apare in alta parte decat degetul
     — si numai pe ecran, fiindca traseul salvat ramane valid. E genul de
     stricaciune pe care n-o vezi citind niciunul din cele doua fisiere. */
  it("panza de semnat are acelasi raport ca viewBox-ul ei", async () => {
    const { LATIME_PANZA, INALTIME_PANZA } = await import("./lib/semnatura.js");
    const { STILURI } = await import("./guest/styles.js");
    const regula = STILURI.slice(STILURI.indexOf(".g-semnatura-panza{"));
    const gasit = regula.slice(0, regula.indexOf("}")).match(/aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
    expect(gasit, "lipseste aspect-ratio de pe .g-semnatura-panza").toBeTruthy();
    expect(Number(gasit[1]) / Number(gasit[2])).toBeCloseTo(LATIME_PANZA / INALTIME_PANZA, 5);
  });

  /* Fara asta, degetul deruleaza pagina in loc sa deseneze. Regula de pe svg
     nu ajunge: Safari o ignora pe elemente SVG, de unde si cea de pe divul
     din jur. Vezi antetul lui guest/Semnatura.jsx. */
  it("panza de semnat opreste derularea, din ambele reguli", async () => {
    const { STILURI } = await import("./guest/styles.js");
    for (const selector of [".g-semnatura{", ".g-semnatura-panza{"]) {
      const de = STILURI.indexOf(selector);
      const regula = STILURI.slice(de, STILURI.indexOf("}", de));
      expect(regula, selector).toContain("touch-action:none");
    }
  });

  /* Cardul inchis are culorile scrise ca valori, nu ca jetoane, tocmai
     fiindca --ivory si --charcoal se inverseaza in tema de noapte. Daca
     cineva le „curata" inapoi in jetoane, textul devine negru pe negru pe
     telefoanele cu tema intunecata — o greseala care nu se vede la lumina
     zilei si de care afli de la un oaspete. */
  it("nu ia culorile cardului închis din jetoane", async () => {
    const { STILURI } = await import("./guest/styles.js");
    const hero = STILURI.slice(STILURI.indexOf(".g-hero{"));
    const regula = hero.slice(0, hero.indexOf("}"));
    expect(regula).not.toContain("var(--ivory)");
    expect(regula).not.toContain("var(--charcoal)");
  });

  /* JETOANELE DE HARTIE NU SE FOLOSESC CA CERNEALA.
     `--ivory` e hartia paginii, si se INVERSEAZA in tema de noapte: din
     #f5f1e8 devine #15170f. Pusa ca `color:` pe o suprafata care ramane
     inchisa in ambele teme — un buton masliniu, cardul principal — litera
     devine aproape neagra pe verde inchis si dispare.
     Nu e o grija inchipuita. Pe 10 septembrie 2026 erau patru locuri stricate
     asa, iar cel mai rau ajunsese la contrast 1.06: data plecarii de pe cardul
     principal, invizibila pe telefoanele cu tema intunecata. Niciunul nu se
     vedea la lumina zilei.
     Pentru text pe inchis exista `--g-pe-inchis`, care nu se redefineste. */
  it("nu foloseste hârtia paginii drept cerneală", async () => {
    const { STILURI } = await import("./guest/styles.js");
    expect(STILURI).not.toContain("color:var(--ivory)");
  });

  it("jetonul pentru text pe închis chiar nu se inversează", async () => {
    const { STILURI } = await import("./guest/styles.js");
    expect(STILURI).toContain("--g-pe-inchis:");
    /* Redefinit in blocul de noapte, ar fi exact jetonul de care fugim. */
    const noapte = STILURI.slice(STILURI.indexOf("@media (prefers-color-scheme: dark)"));
    expect(noapte).not.toContain("--g-pe-inchis:");
  });

  /* Casetele si panza de semnat au fundalul din jeton, nu #fff scris in
     regula: textul din ele e --g-text, care se inverseaza. Perechea trebuie
     sa se intoarca impreuna — altfel textul tastat iese aproape alb pe alb,
     iar semnatura nu se vede deloc. */
  it("casetele și panza își iau fundalul din jeton", async () => {
    const { STILURI } = await import("./guest/styles.js");
    for (const selector of [".g-camp input", ".g-semnatura-panza{"]) {
      const de = STILURI.indexOf(selector);
      const regula = STILURI.slice(de, STILURI.indexOf("}", de));
      expect(regula, selector).toContain("background:var(--g-camp)");
      expect(regula, selector).not.toContain("background:#fff");
    }
    /* Si jetonul TREBUIE sa se inverseze — altfel n-am rezolvat nimic. */
    const noapte = STILURI.slice(STILURI.indexOf("@media (prefers-color-scheme: dark)"));
    expect(noapte).toContain("--g-camp:");
  });
});
