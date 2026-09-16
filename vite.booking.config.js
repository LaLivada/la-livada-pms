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
import { resolve } from "path";
import { readFileSync } from "fs";

const RADACINA = resolve(process.cwd(), "booking");

/* Paginile de text, pe lângă prima pagină. Fiecare e HTML propriu, cu
   adresa lui — un procesator de plăți sau ANPC trebuie să le poată
   deschide direct, nu ca stare a aplicației React. */
export const PAGINI = ["termeni", "livrare", "anulare", "retragere", "confidentialitate", "cookies"];

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

export default defineConfig({
  plugins: [react(), partiale()],
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
      ]),
    },
  },
  /* Cu mai multe pagini, o adresă greșită trebuie să dea 404 în dev, nu
     prima pagină. */
  appType: "mpa",
  server: { port: 5174 },
});
