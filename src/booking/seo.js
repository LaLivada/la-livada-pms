/* Adresele publice ale sitului de rezervări, într-un singur loc — de aici
   ies sitemap-ul (scris la build, vezi vite.booking.config.js) și legăturile
   hreflang dintre variantele de limbă ale paginilor legale. Fără nicio
   dependență de Vite sau de DOM, ca să poată fi testat singur
   (src/booking-seo.test.js).

   Sitemap-ul stătea scris de mână în public-booking/sitemap.xml, cu 7
   adrese: cele 36 de variante traduse ale paginilor legale (6 pagini × 6
   limbi) nu apăreau nicăieri, iar hreflang lipsea cu totul — Google vedea
   42 de pagini fără nicio legătură între ele, fiecare concurând cu
   celelalte. */

export const ORIGINE = "https://rezervari.lalivada.ro";

/* Paginile de text, pe lângă prima pagină. Fiecare e HTML propriu, cu
   adresa lui — un procesator de plăți sau ANPC trebuie să le poată
   deschide direct, nu ca stare a aplicației React. Aceeași listă ca
   PAGINI_LEGALE din booking/limba-selector.js (testul le compară). */
export const PAGINI = ["termeni", "livrare", "anulare", "retragere", "confidentialitate", "cookies"];

/* Adresa absolută a unei pagini legale într-o limbă: româna la rădăcină
   (/anulare/), celelalte în subfolder (/anulare/en/) — exact structura
   fișierelor din booking/<pagina>/<limba>/index.html. */
export function adresaPagina(pagina, limba, limbaImplicita) {
  return limba === limbaImplicita
    ? `${ORIGINE}/${pagina}/`
    : `${ORIGINE}/${pagina}/${limba}/`;
}

/* Cele 7 <link rel="alternate" hreflang> ale unei pagini legale, plus
   x-default spre română — intră în <head>, lângă canonical. Fiecare
   variantă poartă lista întreagă, inclusiv pe ea însăși: Google ignoră
   legăturile hreflang care nu sunt reciproce. */
export function hreflangHtml(pagina, limbi, limbaImplicita) {
  const linii = limbi.map((l) =>
    `<link rel="alternate" hreflang="${l}" href="${adresaPagina(pagina, l, limbaImplicita)}" />`);
  linii.push(`<link rel="alternate" hreflang="x-default" href="${adresaPagina(pagina, limbaImplicita, limbaImplicita)}" />`);
  return linii.join("\n    ");
}

/* Sitemap-ul întreg. Prima pagină e toată aplicația: pașii (căutare,
   alegerea camerei, datele clientului) sunt stări ale aceleiași pagini, nu
   adrese separate. Fără `lastmod`: o dată scrisă de mână care nu se mai
   schimbă e mai rea decât lipsa ei — Google o folosește doar cât timp se
   dovedește corectă. */
export function sitemapXml(pagini, limbi, limbaImplicita) {
  const url = (loc, changefreq, priority, alternate = "") =>
    `  <url>\n    <loc>${loc}</loc>\n${alternate}    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  const intrari = [url(`${ORIGINE}/`, "weekly", "1.0")];
  for (const pagina of pagini) {
    const alternate = [
      ...limbi.map((l) =>
        `    <xhtml:link rel="alternate" hreflang="${l}" href="${adresaPagina(pagina, l, limbaImplicita)}" />\n`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${adresaPagina(pagina, limbaImplicita, limbaImplicita)}" />\n`,
    ].join("");
    for (const limba of limbi) {
      intrari.push(url(adresaPagina(pagina, limba, limbaImplicita), "yearly", "0.3", alternate));
    }
  }
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    + "<!-- Generat la build din src/booking/seo.js - nu se editeaza de mana. -->\n"
    + "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\""
    + " xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n"
    + `${intrari.join("\n")}\n</urlset>\n`;
}
