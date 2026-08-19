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
| `public_capacity` | plafoanele fizice, pentru limitele din formular |
| `public_availability` | propuneri de cazare pentru tot grupul |
| `create_public_booking` | creează rezervarea, atomic |
| `public_booking_by_token` | pagina de confirmare |

**Numărul de persoane e al grupului, nu al unei camere.** Serverul împarte
grupul pe câte camere sunt necesare și întoarce, pentru fiecare tip care îl
poate găzdui, o propunere completă; clientul alege una și o trimite înapoi
ca atare. Se poate rezerva până la capacitatea întregii pensiuni — dacă
niciun tip singur nu încape grupul, apare o variantă mixtă.

Regulile de împărțire stau în `allocate_group`: cât mai puține camere,
repartizare echilibrată (4 persoane în două camere de 3 înseamnă 2+2, nu
3+1), și cel puțin un adult în fiecare cameră.

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

## Emailul de confirmare

Trimis de funcția edge `booking-email`, apelată de aplicație **după** ce
rezervarea a fost creată. Un email eșuat nu afectează rezervarea —
clientul are numărul pe ecran și linkul de revenire.

Funcția nu primește niciun conținut de la client: cu tokenul, citește
singură datele din bază. Altfel oricine ar putea trimite mesaje cu text
arbitrar de pe adresa pensiunii. Se trimite **o singură dată** per
rezervare (`email_sent_at`).

### Configurare — fără ea, emailul nu pleacă

Funcția e deployată dar inertă până se setează cheia. Fără ea răspunde
`{"sent": false, "reason": "neconfigurat"}` și scrie un avertisment în
loguri; rezervarea se face normal.

1. Cont pe [resend.com](https://resend.com), domeniu `lalivada.ro`
   verificat (DNS: SPF + DKIM). Fără verificare, mesajele ajung în spam.
2. Secretele, în Dashboard → Edge Functions → Secrets:

```
RESEND_API_KEY      re_...                          (obligatoriu)
BOOKING_EMAIL_FROM  La Livada <rezervari@lalivada.ro>
BOOKING_APP_URL     https://rezervari.lalivada.ro
PROPERTY_PHONE      +40 7xx xxx xxx                 (opțional, apare în email)
```

Alt serviciu decât Resend: se schimbă doar apelul `fetch` din funcție.

## Anularea de către client

Emailul conține un buton de anulare. **Nu anulează la click** — deschide
pagina de confirmare (`?token=…&anulare=1`), unde clientul confirmă.

Asta nu e prudență excesivă: multe clienți de email preîncarcă linkurile
din mesaj ca să le scaneze. Un link care anulează la simplu GET ar șterge
rezervări de unul singur.

Regulile, impuse în `cancel_public_booking`:

- se poate anula **până la ora sosirii**; după, clientul sună;
- nu se șterge nimic — rezervările trec pe `cancelled`, camerele redevin
  libere imediat, iar istoricul rămâne în PMS;
- e **idempotentă**: un link deschis de două ori nu dă eroare.

## Ce nu există încă

- **Plată online.** Rezervările intră direct `confirmed`, plata se face la
  sosire. Arhitectura acceptă adăugarea ulterioară fără rescriere: s-ar
  insera între alocarea camerei și confirmare, cu `status='pending'` până
  la încasare.
- **Notificare către recepție.** Rezervările apar în PMS, dar nimeni nu e
  anunțat activ. Aceeași funcție edge ar putea trimite un al doilea mesaj.
- **Fotografii și descrieri de camere.** Nu există în bază; ar trebui
  adăugate în site sau într-un tabel nou.
