# Motorul de rezervări directe

Aplicația prin care un vizitator caută disponibilitate și face o rezervare
care ajunge direct în PMS.

## Ce e important de știut înainte de a-l modifica

**PMS-ul e singura autoritate.** Disponibilitatea și prețul afișate aici
sunt informative. Nimic nu se decide în browser:

- prețul nu se trimite niciodată către server — e calculat în PostgreSQL,
  de un trigger, la inserare. Chiar dacă cineva modifică cererea din
  DevTools, prețul stocat rămâne cel corect;
- camera fizică e aleasă de server. Aplicația trimite doar tipul dorit;
- disponibilitatea se verifică **din nou**, atomic, în momentul creării.
  Dacă între căutare și confirmare camera s-a ocupat, serverul refuză cu
  codul `P0002`, iar aplicația arată un mesaj clar și reîmprospătează
  rezultatele — nu o „eroare de server".

**Suprarezervarea e imposibilă** — nu datorită acestui cod, ci a trei
straturi din bază: un lock consultativ care serializează rezervările, o
constrângere GiST de excludere care refuză fizic suprapunerile, și
verificarea din interiorul tranzacției.

**Idempotența** stă pe o cheie `uuid` generată o singură dată per intenție
de rezervare (nu per click). Dublu-click sau retry după timeout întorc
aceeași rezervare, nu una nouă.

## Structură

```
booking/index.html          pagina, punctul de intrare
booking/main.jsx            montarea în DOM
src/booking/App.jsx         mașina de stări și interfața
src/booking/api.js          cele trei apeluri către PostgreSQL
src/booking/styles.js       stiluri neutre, moștenesc fonturile paginii
src/booking/nomenclatoare.js  județe și țări
```

Nu importă **nimic** din `pms-app.jsx`: sunt două bundle-uri separate, iar
un import ar trage cod de recepție în pachetul public.

## Cele trei apeluri

| Funcție | Rol |
|---|---|
| `public_availability` | tipuri de cameră libere, cu preț |
| `create_public_booking` | creează rezervarea, atomic, până la 5 camere |
| `public_booking_by_token` | pagina de confirmare |

Aplicația nu are acces la niciun tabel. Cheia folosită e cea publicabilă
(anon) — nu e un secret: singurul acces pe care îl dă sunt exact aceste
trei funcții.

## Dezvoltare

```bash
npm run dev:booking
```

Pornește pe `http://localhost:5174`, folosind același `.env` ca PMS-ul —
deci **baza de producție**. Căutarea e read-only și inofensivă, dar
**nu trimite o rezervare de probă**: ar apărea real în calendar.

Pentru testarea fluxului complet e nevoie de un proiect Supabase separat
(vezi `tests/e2e/README.md`).

## Deploy

```bash
npm run build:booking     # → dist-booking/
```

Un proiect Vercel separat, în același repo:

| Setare | Valoare |
|---|---|
| Build Command | `npm run build:booking` |
| Output Directory | `dist-booking` |
| Environment | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Domeniu recomandat: `rezervari.lalivada.ro`.

Nu e nevoie de configurare CORS: API-ul REST al Supabase acceptă orice
origine (spre deosebire de funcția `anaf-lookup`, unde lista e restrânsă).

## Folosire ca componentă

Când site-ul principal devine React, aplicația se poate importa direct,
fără build separat:

```jsx
import MotorRezervari from "./src/booking/App.jsx";

<MotorRezervari valoriInitiale={{ adulti: 2 }} />
```

Fără `valoriInitiale`, citește perioada din adresă
(`?checkin=…&checkout=…&adults=…&children=…`), ca să poată fi lansată
dintr-un formular scurt aflat pe altă pagină.

Pagina de confirmare se deschide cu `?token=…` — tokenul are 128 de biți,
deci adresa nu poate fi ghicită, iar id-urile interne nu apar niciodată în
URL.

## Ce nu există încă

- **Email de confirmare.** Nu există infrastructură de trimitere. Clientul
  vede numărul pe ecran și primește un link de revenire. Când se adaugă,
  trimiterea trebuie să se facă **după** COMMIT, iar un email eșuat nu
  trebuie să anuleze rezervarea.
- **Plată online.** Rezervările intră direct `confirmed`, plata se face la
  sosire. Arhitectura acceptă adăugarea ulterioară fără rescriere: s-ar
  insera între alocarea camerei și confirmare, cu `status='pending'` până
  la încasare.
- **Anulare de către client.** Deliberat. Dacă se cere, se face prin
  funcție dedicată care trece rezervarea pe `cancelled` — niciodată
  `DELETE`.
- **Fotografii și descrieri de camere.** Nu există în bază; ar trebui
  adăugate în site sau într-un tabel nou.
