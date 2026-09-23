import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ORIGINE, PAGINI, adresaPagina, hreflangHtml, sitemapXml } from "./booking/seo.js";
import { CODURI_LIMBA, LIMBA_IMPLICITA } from "./booking/i18n/limbi.js";
import ro from "./booking/i18n/dictionare/ro.js";
import en from "./booking/i18n/dictionare/en.js";
import fr from "./booking/i18n/dictionare/fr.js";
import italiana from "./booking/i18n/dictionare/it.js";
import de from "./booking/i18n/dictionare/de.js";
import ru from "./booking/i18n/dictionare/ru.js";
import uk from "./booking/i18n/dictionare/uk.js";

/* Prima pagină a sitului de rezervări e HTML scris de mână
   (booking/index.html); React montează doar motorul, în #rezervari. Testul
   ține în frâu ce ar strica în tăcere poziția în Google: titlul, descrierea,
   canonical-ul, un singur H1, JSON-LD-ul fără date inventate, cheile de
   traducere ale textului static, sitemap-ul generat la build.

   Faptele verificate pe 23 septembrie 2026: 14 tiny houses (8 pentru două
   persoane, 6 pentru trei, cu pat etajat) și 2 lofturi — din tabela rooms;
   parcarea gratuită — de la Ovidiu, în aceeași zi. */

/* Rădăcina proiectului, ca în celelalte teste care citesc fișiere: Vite
   rescrie `new URL(..., import.meta.url)` ca adresă de resursă, nu de fișier. */
const RADACINA = process.cwd();
const fisier = (cale) => readFileSync(resolve(RADACINA, cale), "utf8");
const html = fisier("booking/index.html");
const DICTIONARE = { ro, en, fr, it: italiana, de, ru, uk };

const decodeaza = (s) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = (nume) => {
  const m = html.match(new RegExp(`<meta (?:name|property)="${nume}" content="([^"]*)"`));
  return m ? decodeaza(m[1]) : null;
};
const titlu = decodeaza(html.match(/<title>([^<]*)<\/title>/)[1]);
const main = html.match(/<main>([\s\S]*)<\/main>/)[1];
const textMain = decodeaza(
  main.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " "),
).replace(/\s+/g, " ").trim();
const cuvinte = textMain.split(" ").filter(Boolean);
const cauta = (cale, dict) => cale.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

describe("capul primei pagini de rezervări", () => {
  it("titlul începe cu „Cazare Vaslui” și încape într-un rezultat Google", () => {
    expect(titlu.startsWith("Cazare Vaslui")).toBe(true);
    expect(titlu.length).toBeGreaterThanOrEqual(40);
    expect(titlu.length).toBeLessThanOrEqual(60);
  });

  it("descrierea are 140–160 de semne, numește Vasluiul și îndeamnă la rezervare", () => {
    const d = meta("description");
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toMatch(/Vaslui/);
    expect(d).toMatch(/rezerv/i);
  });

  it("canonical spre ea însăși, indexabilă, fără nofollow pe legături", () => {
    expect(html).toContain(`<link rel="canonical" href="${ORIGINE}/" />`);
    expect(html.match(/<meta name="robots"/g)).toHaveLength(1);
    expect(meta("robots")).toBe("index, follow");
    expect(html).not.toMatch(/rel="[^"]*nofollow/);
  });

  it("Open Graph și Twitter spun același lucru ca titlul și descrierea", () => {
    expect(meta("og:title")).toBe(titlu);
    expect(meta("og:description")).toBe(meta("description"));
    expect(meta("og:url")).toBe(`${ORIGINE}/`);
    expect(meta("og:type")).toBe("website");
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("twitter:title")).toBe(titlu);
    expect(meta("twitter:description")).toBe(meta("description"));
    expect(meta("twitter:image")).toBe(meta("og:image"));
  });

  it("imaginea de partajare e absolută, cu dimensiuni și text alternativ", () => {
    expect(meta("og:image")).toMatch(new RegExp(`^${ORIGINE}/.+\\.(jpg|png)$`));
    expect(meta("og:image:width")).toBe("1600");
    expect(meta("og:image:height")).toBe("900");
    expect(meta("og:image:alt")).toBeTruthy();
  });
});

describe("conținutul primei pagini", () => {
  it("un singur H1, cu „Cazare în Vaslui”", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(decodeaza(html.match(/<h1[^>]*>([^<]*)<\/h1>/)[1])).toContain("Cazare în Vaslui");
    expect(html).not.toContain(">Cazare Tiny houses<");
  });

  it("motorul de rezervare stă deasupra capitolelor de text", () => {
    expect(main.indexOf('id="rezervari"')).toBeLessThan(main.indexOf("<h2"));
  });

  it("are capitolele, întrebările frecvente și 500–900 de cuvinte", () => {
    expect((main.match(/<h2[\s>]/g) || []).length).toBeGreaterThanOrEqual(8);
    const detalii = main.match(/<details>/g) || [];
    expect(detalii.length).toBeGreaterThanOrEqual(6);
    expect((main.match(/<summary/g) || []).length).toBe(detalii.length);
    expect(cuvinte.length).toBeGreaterThanOrEqual(500);
    expect(cuvinte.length).toBeLessThanOrEqual(900);
  });

  it("leagă natural spre lalivada.ro, de 2–6 ori", () => {
    const n = (main.match(/href="https:\/\/lalivada\.ro\//g) || []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(6);
  });

  it("nu folosește clișee de agenție și nu inventează distanțe", () => {
    for (const cliseu of [
      "experiență de neuitat", "oază de liniște", "confort și eleganță",
      "locul ideal", "experiență memorabilă", "evadare perfectă",
    ]) expect(textMain.toLowerCase()).not.toContain(cliseu);
    expect(textMain).not.toMatch(/\d+\s*(km|minute)\b/i);
  });
});

describe("JSON-LD", () => {
  it("descrie o LodgingBusiness cu datele reale ale pensiunii", () => {
    expect(jsonLd["@type"]).toBe("LodgingBusiness");
    expect(jsonLd.url).toBe(`${ORIGINE}/`);
    expect(jsonLd.numberOfRooms).toBe(16);
    expect(jsonLd.address.addressLocality).toBe("Muntenii de Jos");
    expect(jsonLd.address.addressCountry).toBe("RO");
    expect(jsonLd.telephone).toBe("+40722899899");
    expect(jsonLd.checkinTime).toBe("14:00");
    expect(jsonLd.checkoutTime).toBe("11:00");
    expect(jsonLd.description).toBe(meta("description"));
    for (const img of jsonLd.image) expect(img.startsWith(`${ORIGINE}/`)).toBe(true);
  });

  it("nu inventează rating, recenzii, prețuri sau stele", () => {
    for (const cheie of ["aggregateRating", "review", "priceRange", "starRating"]) {
      expect(jsonLd).not.toHaveProperty(cheie);
    }
  });
});

describe("traducerile textului static", () => {
  const chei = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];

  it("fiecare cheie data-i18n există, ca text, în toate cele 7 dicționare", () => {
    expect(chei.length).toBeGreaterThan(30);
    for (const [cod, dict] of Object.entries(DICTIONARE)) {
      for (const cheie of chei) {
        expect(typeof cauta(cheie, dict), `${cod}: ${cheie}`).toBe("string");
      }
    }
  });

  it("textul românesc din HTML e exact cel din ro.js", () => {
    for (const cheie of chei.filter((c) => c.startsWith("landing."))) {
      const re = new RegExp(`<(\\w+)[^>]*data-i18n="${cheie.replace(/\./g, "\\.")}"[^>]*>([\\s\\S]*?)</\\1>`);
      const m = html.match(re);
      expect(m, cheie).toBeTruthy();
      expect(decodeaza(m[2]).replace(/\s+/g, " ").trim(), cheie).toBe(cauta(cheie, ro));
    }
  });

  it("lista paginilor legale din selectorul de limbă e aceeași cu PAGINI", () => {
    const selector = fisier("booking/limba-selector.js");
    const m = selector.match(/const PAGINI_LEGALE = \[([^\]]*)\]/);
    expect(m[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1))).toEqual(PAGINI);
  });
});

describe("sitemap și hreflang", () => {
  it("adresa unei pagini: româna la rădăcină, celelalte în subfolder", () => {
    expect(adresaPagina("anulare", "ro", "ro")).toBe(`${ORIGINE}/anulare/`);
    expect(adresaPagina("anulare", "fr", "ro")).toBe(`${ORIGINE}/anulare/fr/`);
  });

  it("hreflang: cele 7 limbi plus x-default spre română", () => {
    const h = hreflangHtml("anulare", CODURI_LIMBA, LIMBA_IMPLICITA);
    expect(h.match(/<link rel="alternate"/g)).toHaveLength(8);
    expect(h).toContain(`hreflang="ro" href="${ORIGINE}/anulare/"`);
    expect(h).toContain(`hreflang="uk" href="${ORIGINE}/anulare/uk/"`);
    expect(h).toContain(`hreflang="x-default" href="${ORIGINE}/anulare/"`);
  });

  it("sitemap-ul are prima pagină și toate cele 42 de variante ale paginilor legale", () => {
    const s = sitemapXml(PAGINI, CODURI_LIMBA, LIMBA_IMPLICITA);
    const adrese = [...s.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(adrese).toHaveLength(1 + PAGINI.length * CODURI_LIMBA.length);
    expect(adrese[0]).toBe(`${ORIGINE}/`);
    for (const a of adrese) {
      expect(a.endsWith("/")).toBe(true);
      expect(a).not.toMatch(/[?#]/);
    }
    expect(s).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect((s.match(/<xhtml:link /g) || []).length).toBe(PAGINI.length * CODURI_LIMBA.length * 8);
  });

  it("sitemap-ul nu mai stă scris de mână în public-booking", () => {
    expect(existsSync(resolve(RADACINA, "public-booking/sitemap.xml"))).toBe(false);
  });
});
