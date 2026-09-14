# La Livadă PMS

Sistemul de administrare al Complexului La Livadă (Vaslui): recepție,
calendar de rezervări, oaspeți, facturare, curățenie, acces electronic la
camere și relee. Trei aplicații într-un singur repo, cu un singur backend
(Supabase: Postgres + RLS, Realtime, funcții edge).

| Aplicație | Adresă | Intrare | Build |
|---|---|---|---|
| **PMS** (recepție, admin, cameristă) | `pms.lalivada.ro` | `index.html` → `src/main.jsx` → `src/App.jsx` | `npm run build` → `dist/` |
| **Site de rezervări** (public) | `rezervari.lalivada.ro` | `booking/index.html` → `booking/main.jsx` → `src/booking/App.jsx` | `npm run build:booking` → `dist-booking/` |
| **Pagina oaspetelui** (link per cazare) | `guest.lalivada.ro` | `guest/index.html` → `guest/main.jsx` → `src/guest/App.jsx` | `npm run build:guest` → `dist-guest/` |

Toate trei sunt găzduite pe Vercel (antetele de securitate stau în
`vercel.json`) și vorbesc cu același proiect Supabase. Fișierele statice ale
fiecăreia: `public/`, `public-booking/`, `public-guest/`.

## Cum e împărțit codul

- `src/lib/` — logică pură, fără React și fără rețea: timp și fus orar,
  prețuri, disponibilitate, rapoarte, conflicte, coada de salvări, căutare…
  Aici stau regulile, și aici sunt cele mai multe teste.
- `src/data/` — cererile către Supabase, cu ieșirea în forma aplicației
  (camelCase). Doar cereri, nu decizii.
- `src/features/` — ecranele PMS-ului (calendar și rezervări, facturare,
  clienți, camere și curățenie, acces, automatizare, setări, jurnal…);
  `src/ui/` — primitivele (dialog, secțiuni pliabile, schelet de încărcare);
  `src/pms-app.jsx` — starea aplicației și legăturile dintre ecrane.
- `src/booking/`, `src/guest/` — cele două aplicații publice. Importă din
  `src/lib/` doar fișiere mici (`retea.js`), ca bundle-urile lor să rămână
  mici.
- `schema.sql` — oglinda întregii scheme (tabele, politici RLS, funcții),
  în ordinea în care a fost construită; `supabase/migrations/` — migrațiile
  aplicate pe proiectul live, câte un fișier, redabile cu `supabase db push`;
  `supabase/functions/` — funcțiile edge (Deno): `booking-create`,
  `booking-email`, `ical-feed`, `access-provider`, `access-webhook`,
  `guest-unlock`, `device-provider`, `anaf-lookup`. Fiecare are, în capul
  fișierului, ce primește și de ce există.
- `scripts/` — unelte de rulat de mână: `backup.mjs` (copie a bazei, fără
  Docker), `export-migratii.mjs` (migrațiile aplicate → `supabase/migrations/`),
  `paritate-raport.mjs` (paritatea JS ↔ SQL a raportului lunar), `wifi-qr.mjs`,
  `og-guest.mjs`, `acces-poze.mjs`, `bench/` (rezervări sintetice și
  măsurători).
- `tests/` — integrare (`tests/integration`, pe proiectul real, cu cheia
  publică), cap-coadă (`tests/e2e`, Playwright), invarianți și paritate de
  preț în SQL (`tests/*.sql`). Testele unitare și de ecran stau lângă cod,
  în `src/*.test.js`.
- `docs/` — arhitectură, audit, planuri și verdicte, cu date. Indexul:
  [`docs/README.md`](docs/README.md).

## Comenzi

Node 24 (vezi `engines`). Instalare: `npm ci`.

| Comandă | Ce face |
|---|---|
| `npm run dev` | PMS-ul, pe `http://localhost:5173` |
| `npm run dev:booking`, `npm run dev:guest` | site-ul, respectiv pagina oaspetelui |
| `npm test` | testele unitare și de ecran (vitest + jsdom) |
| `npm run test:integration` | apeluri reale către proiectul din `.env`, cu cheia publică: ce poate face un vizitator neautentificat |
| `npm run test:e2e` | Playwright pe `E2E_BASE_URL` (implicit `http://localhost:5173`) |
| `npm run lint` | oxlint (`no-undef`, regulile hook-urilor) |
| `npm run build`, `build:booking`, `build:guest` | cele trei bundle-uri |

CI (`.github/workflows/ci.yml`): lint, testele de două ori (fusul mașinii și
`TZ=America/New_York`, ca fusul hotelului să nu depindă de mașină), cele trei
build-uri — la fiecare push și PR pe `main`. `backup.yml` face zilnic, la
02:15 UTC, o copie criptată a bazei; ce trebuie configurat e în
`docs/disaster-recovery.md`, „Backup periodic".

## Variabile de mediu

**Local și la build (Vite, în `.env`, care nu intră în git):**

| Variabilă | Unde | Ce e |
|---|---|---|
| `VITE_SUPABASE_URL` | toate trei | adresa proiectului Supabase |
| `VITE_SUPABASE_ANON_KEY` | toate trei | cheia publicabilă (anon); securitatea e în RLS, nu în cheie |
| `VITE_TURNSTILE_SITE_KEY` | site | cheia publică Cloudflare Turnstile (fără ea, site-ul merge fără captcha) |

**Funcțiile edge** (secrete în Supabase, nu în repo): `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (puse de Supabase);
`RESEND_API_KEY`, `BOOKING_EMAIL_FROM`, `BOOKING_APP_URL`,
`BOOKING_HOLD_MINUTES`, `PROPERTY_PHONE`, `ALLOWED_ORIGINS`,
`TURNSTILE_SECRET_KEY` (rezervări și email); `TTLOCK_CLIENT_ID`,
`TTLOCK_CLIENT_SECRET`, `TTLOCK_USERNAME`, `TTLOCK_PASSWORD_MD5`,
`TTLOCK_API_BASE`, `TTLOCK_WEBHOOK_TOKEN` (yale); `SHELLY_AUTH_KEY`,
`SHELLY_SERVER_URI` (relee).

**Backup** (GitHub Actions): secretul `DATABASE_URL`, plus două fișiere în
repo: `scripts/prod-ca-2021.crt` (certificatul CA al bazei) și
`scripts/cheie-publica-backup.txt` (cheia publică age; cea privată nu intră
niciodată în repo). Pașii exacți: `docs/disaster-recovery.md`.

## Convenții care nu se văd din cod

- Comentariile lungi sunt intenționate: explică *de ce*, nu *ce*. Sunt cel
  mai bun lucru din proiect pentru cine vine după; păstrează-le.
- Fusul hotelului e `Europe/Bucharest` peste tot (`src/lib/timp.js`). Nu
  calcula zile sau ore din ceasul mașinii.
- Scrierile trimit doar rândurile schimbate, cu ștampila `updated_at`; o
  modificare concurentă se rezolvă în aplicație (`src/lib/conflict.js`),
  nu prin suprascriere.
- O migrație înseamnă un fișier nou în `supabase/migrations/` **și** aceeași
  bucată adăugată la capătul lui `schema.sql`.
- Cheile și secretele nu intră niciodată în repo, nici în teste.
