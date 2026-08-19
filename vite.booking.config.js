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

export default defineConfig({
  plugins: [react()],
  root: resolve(process.cwd(), "booking"),
  // .env stă în rădăcina proiectului, nu în booking/ — fără asta,
  // VITE_SUPABASE_* nu ajung în bundle și aplicația pornește fără backend.
  envDir: process.cwd(),
  publicDir: resolve(process.cwd(), "public"),
  build: {
    outDir: resolve(process.cwd(), "dist-booking"),
    emptyOutDir: true,
  },
  server: { port: 5174 },
});
