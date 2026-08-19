import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Doua categorii de teste nu au ce cauta la un `npm test` obisnuit:
    //  - integrare: lovesc baza reala, au nevoie de cheile din .env
    //    (`npm run test:integration`);
    //  - e2e: ruleaza pe Playwright, nu pe Vitest, si au nevoie de un
    //    browser si de o baza de test (`npm run test:e2e`).
    // Fara excluderea de mai jos, Vitest ar incerca sa execute si
    // fisierele .spec.js ale Playwright-ului si ar pica.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**', 'tests/e2e/**'],
  },
})
