import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Testele de integrare lovesc baza de date reala si au nevoie de
    // cheile din .env, deci nu pot rula in CI si nici la un `npm test`
    // obisnuit. Se pornesc explicit cu `npm run test:integration`.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
  },
})
