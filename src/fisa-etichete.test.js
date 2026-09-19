import { describe, it, expect, vi } from "vitest";
import { CAMPURI, ACT_TIPURI } from "./lib/fisa.js";
import { TEXTE } from "./guest/interfata.ro.js";

// features/fise.jsx si features/documente.jsx importa lantul care ajunge
// la supabase.js (client real) — mockuit ca in sectiune-fisa-ecran.test.js,
// aici conteaza doar cele doua harti de etichete exportate, nu clientul.
vi.mock("./supabase.js", () => ({ supabase: {} }));

const { CAMPURI_ETICHETE, ACT_TIPURI_ETICHETE: ACT_TIPURI_ETICHETE_FISE } = await import("./features/fise.jsx");
const { ACT_TIPURI_ETICHETE: ACT_TIPURI_ETICHETE_DOCUMENTE } = await import("./features/documente.jsx");

/* CAMPURI/ACT_TIPURI (lib/fisa.js) au trei copii independente ale
 * etichetelor RO: guest/interfata.ro.js (Task 3, 19 sept 2026, pagina
 * oaspetelui) si features/fise.jsx + features/documente.jsx (receptia,
 * ramasa netradusa deliberat). `eticheta(cheie) => HARTA[cheie] || cheie`
 * nu arunca la o cheie lipsa — arata cheia bruta pe ecran, tacut. Testul
 * asta e singurul lucru care ar prinde un camp nou uitat intr-una din
 * copii. */
describe("etichetele fisei raman in pas cu CAMPURI/ACT_TIPURI", () => {
  it("fiecare CAMPURI are eticheta in interfata.ro.js", () => {
    for (const c of CAMPURI) expect(TEXTE.fisa.campEtichete).toHaveProperty(c.cheie);
  });

  it("fiecare CAMPURI are eticheta la receptie (fise.jsx)", () => {
    for (const c of CAMPURI) expect(CAMPURI_ETICHETE).toHaveProperty(c.cheie);
  });

  it("fiecare ACT_TIPURI are eticheta in interfata.ro.js", () => {
    for (const t of ACT_TIPURI) expect(TEXTE.fisa.actTipEtichete).toHaveProperty(t.cheie);
  });

  it("fiecare ACT_TIPURI are eticheta la receptie (fise.jsx si documente.jsx)", () => {
    for (const t of ACT_TIPURI) {
      expect(ACT_TIPURI_ETICHETE_FISE).toHaveProperty(t.cheie);
      expect(ACT_TIPURI_ETICHETE_DOCUMENTE).toHaveProperty(t.cheie);
    }
  });
});
