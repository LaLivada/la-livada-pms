/* Build separat pentru pagina oaspetelui.
 *
 * Al treilea build din acelasi repo, pe tiparul lui vite.booking.config.js:
 * propriul HTML, propriul bundle, propriul deploy. Nu importa nimic din
 * pms-app.jsx — un import ar trage in pachetul public cod de receptie.
 *
 * Build:  npm run build:guest   ->  dist-guest/
 * Local:  npm run dev:guest
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(process.cwd(), "guest"),
  // .env sta in radacina proiectului, nu in guest/ — fara asta,
  // VITE_SUPABASE_* nu ajung in bundle si pagina porneste fara backend.
  envDir: process.cwd(),
  // Folder public propriu. La booking motivul era invers (acela TREBUIE
  // indexat, PMS-ul nu); aici e ca la PMS: un link de cazare ajuns intr-un
  // index de cautare e un link public catre o usa.
  publicDir: resolve(process.cwd(), "public-guest"),
  build: {
    outDir: resolve(process.cwd(), "dist-guest"),
    emptyOutDir: true,
  },
  server: { port: 5175 },
});
