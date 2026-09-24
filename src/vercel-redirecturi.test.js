import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PAGINI } from "./booking/seo.js";
import { CODURI_LIMBA, LIMBA_IMPLICITA } from "./booking/i18n/limbi.js";

/* vercel.json e COMUN celor trei proiecte Vercel construite din acest
   depozit (pms.lalivada.ro, rezervari.lalivada.ro, pagina oaspetelui) —
   toate au rădăcina în rădăcina depozitului. Situl de rezervări răspundea
   200 și la /index.html, și la /termeni fără slash, și la /anulare/fr fără
   slash: aceeași pagină sub mai multe adrese, pe care Google le tratează ca
   duplicate. `cleanUrls`/`trailingSlash` ar fi rezolvat-o, dar GLOBAL, deci
   și pentru PMS; de-aceea redirecturile poartă gazda în condiție, iar
   testul refuză orice variantă fără ea. JSON-ul nu poate purta comentarii —
   explicația stă aici. Adăugat pe 24 septembrie 2026. */

const GAZDA = "rezervari.lalivada.ro";
const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
const aleRezervarilor = config.redirects
  .filter((r) => r.has?.some((h) => h.type === "host" && h.value === GAZDA));
const celelalte = config.redirects.filter((r) => !aleRezervarilor.includes(r));

describe("vercel.json: adresele duble ale sitului de rezervări", () => {
  it("nu schimbă nimic global, iar redirecturile de rezervări au gazda în condiție", () => {
    expect(config).not.toHaveProperty("cleanUrls");
    expect(config).not.toHaveProperty("trailingSlash");
    for (const r of aleRezervarilor) {
      expect(r.has).toEqual([{ type: "host", value: GAZDA }]);
      expect(r.permanent).toBe(true);
    }
    // Singurul redirect fără gazdă rămâne cel de CalDAV al PMS-ului.
    expect(celelalte.map((r) => r.source)).toEqual(["/.well-known/caldav"]);
  });

  it("acoperă /index.html și formele fără slash ale paginilor legale, în toate limbile", () => {
    const pagini = PAGINI.join("|");
    const limbi = CODURI_LIMBA.filter((c) => c !== LIMBA_IMPLICITA).join("|");
    expect(aleRezervarilor.map((r) => [r.source, r.destination])).toEqual([
      ["/index.html", "/"],
      [`/:pagina(${pagini})`, "/:pagina/"],
      [`/:pagina(${pagini})/index.html`, "/:pagina/"],
      [`/:pagina(${pagini})/:limba(${limbi})`, "/:pagina/:limba/"],
      [`/:pagina(${pagini})/:limba(${limbi})/index.html`, "/:pagina/:limba/"],
    ]);
  });

  it("nu poate bucla: sursele sunt fără slash final, destinațiile cu", () => {
    /* Vercel potrivește sursa strict (path-to-regexp cu strict: true), deci
       „/termeni/" nu se potrivește cu „/:pagina(...)" — altfel destinația ar
       fi redirectată la nesfârșit spre ea însăși. */
    for (const r of aleRezervarilor) {
      expect(r.source.endsWith("/")).toBe(false);
      expect(r.destination.endsWith("/")).toBe(true);
    }
  });
});
