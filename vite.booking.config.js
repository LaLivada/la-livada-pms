/* Build separat pentru motorul de rezervări.
 *
 * Aplicație independentă de PMS: propriul HTML, propriul bundle, propriul
 * deploy (subdomeniu). Nu importă nimic din pms-app.jsx — un import ar
 * trage în pachetul public cod de recepție care n-are ce căuta acolo.
 *
 * Build:  npm run build:booking   →  dist-booking/
 * Local:  npm run dev:booking
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, relative } from "path";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { CODURI_LIMBA, LIMBA_IMPLICITA } from "./src/booking/i18n/limbi.js";
import { PAGINI, sitemapXml, hreflangHtml } from "./src/booking/seo.js";

const RADACINA = resolve(process.cwd(), "booking");

/* Paginile de text, pe lângă prima pagină — lista stă în src/booking/seo.js,
   de unde o citesc și sitemap-ul, și hreflang-ul (vezi plugin-ul seo() de
   mai jos): o pagină nouă intră peste tot în clipa în care intră acolo. */
export { PAGINI };

/* Fiecare pagină de text are și câte un fișier tradus per limbă
   nerromânească, la booking/<pagina>/<limba>/index.html (vezi
   src/booking/i18n/dictionare/ — aceleași 6 limbi ca motorul de
   rezervare). Limba română rămâne la calea existentă, fără subfolder. */
export const LIMBI_PAGINI = CODURI_LIMBA.filter((c) => c !== LIMBA_IMPLICITA);

/* Antetul și subsolul stau o singură dată, în booking/_antet.html și
   booking/_subsol.html, și intră în fiecare pagină prin marcajele
   <!-- @antet film=true --> și <!-- @subsol -->. Fără asta, șapte pagini
   ar fi purtat șapte copii ale aceluiași meniu, care s-ar fi despărțit
   una de alta la prima corectură. Merge la fel în dev și la build. */
function partiale() {
  return {
    name: "ldv-partiale",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(/<!--\s*@(antet|subsol)([^>]*?)-->/g, (_, nume, atribute) => {
          const film = /film=true/.test(atribute) ? "true" : "false";
          return readFileSync(resolve(RADACINA, "_" + nume + ".html"), "utf8")
            .replace(/^<!--[\s\S]*?-->\n/, "")
            .replace("__FILM__", film);
        });
      },
    },
  };
}

/* Ce ține de motoarele de căutare și n-ar putea sta în HTML-ul scris de
   mână fără să se desincronizeze: legăturile hreflang dintre cele 7 variante
   de limbă ale fiecărei pagini legale (42 de fișiere care s-ar fi despărțit
   la prima corectură) și sitemap-ul, scris la build din aceeași listă de
   pagini și limbi ca intrările din rollupOptions. În dev, /sitemap.xml se
   servește din memorie, ca să poată fi verificat înainte de deploy. */
function seo() {
  let iesire = "";
  return {
    name: "ldv-seo",
    configResolved(config) {
      iesire = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const [pagina] = relative(RADACINA, ctx.filename).split(/[\\/]/);
        if (!PAGINI.includes(pagina)) return html;
        return html.replace(/(<link rel="canonical"[^>]*>)/,
          "$1\n    " + hreflangHtml(pagina, CODURI_LIMBA, LIMBA_IMPLICITA));
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/sitemap.xml") return next();
        res.setHeader("Content-Type", "application/xml");
        res.end(sitemapXml(PAGINI, CODURI_LIMBA, LIMBA_IMPLICITA));
      });
    },
    closeBundle() {
      mkdirSync(iesire, { recursive: true });
      writeFileSync(resolve(iesire, "sitemap.xml"), sitemapXml(PAGINI, CODURI_LIMBA, LIMBA_IMPLICITA));
    },
  };
}

export default defineConfig({
  plugins: [react(), partiale(), seo()],
  root: RADACINA,
  // .env stă în rădăcina proiectului, nu în booking/ — fără asta,
  // VITE_SUPABASE_* nu ajung în bundle și aplicația pornește fără backend.
  envDir: process.cwd(),
  // Propriul folder public, nu cel al PMS-ului: PMS e privat (robots.txt
  // cu Disallow: /, vezi public/robots.txt), iar rezervari.lalivada.ro
  // trebuie indexat — un singur folder comun n-ar putea da fiecărui
  // build robots.txt-ul lui.
  publicDir: resolve(process.cwd(), "public-booking"),
  build: {
    outDir: resolve(process.cwd(), "dist-booking"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries([
        ["index", resolve(RADACINA, "index.html")],
        ...PAGINI.map((p) => [p, resolve(RADACINA, p, "index.html")]),
        ...PAGINI.flatMap((p) => LIMBI_PAGINI.map(
          (l) => [`${p}-${l}`, resolve(RADACINA, p, l, "index.html")])),
      ]),
    },
  },
  /* Cu mai multe pagini, o adresă greșită trebuie să dea 404 în dev, nu
     prima pagină. */
  appType: "mpa",
  server: { port: 5174 },
});
