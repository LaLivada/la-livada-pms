/* Configurare Playwright pentru testele end-to-end.
 *
 * Folosim Chrome-ul deja instalat pe sistem (channel: "chrome") in loc sa
 * descarcam browserele proprii Playwright — cateva sute de MB pe care nu
 * are rost sa le tinem pentru un proiect de dimensiunea asta.
 * Daca lipseste, `npx playwright install chromium` rezolva.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Fluxul complet trece prin multe scrieri in baza; pragul implicit de
  // 30s e prea strans pentru un test care creeaza rezervare + factura.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Fara paralelism: testele lucreaza pe aceeasi baza de date si s-ar
  // incurca intre ele (aceeasi camera, aceleasi serii de numerotare).
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    // Urme si capturi doar cand ceva pica — altfel se aduna degeaba.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  // Porneste serverul de dezvoltare daca nu ruleaza deja.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
