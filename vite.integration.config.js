/* Config separata pentru testele de integrare (`npm run test:integration`).
 *
 * Doua diferente fata de configul principal:
 *  - include DOAR tests/integration (cele unitare ruleaza cu `npm test`);
 *  - incarca .env, ca testele sa aiba URL-ul si cheia publica ale
 *    proiectului. Cheia e cea publicabila (anon) — aceeasi pe care o are
 *    oricine deschide aplicatia in browser — tocmai fiindca scopul e sa
 *    verificam ce poate face un vizitator neautentificat cu ea.
 */
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    test: {
      environment: 'node',
      include: ['tests/integration/**/*.test.js'],
      // Apeluri reale prin retea: pragul implicit de 5s e prea strans.
      testTimeout: 30000,
      env: {
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
      },
    },
  }
})
