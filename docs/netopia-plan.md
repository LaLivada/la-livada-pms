# Plata cu cardul pe rezervari.lalivada.ro prin NETOPIA — plan de implementare

Continuă [`rezervari-legal.md`](rezervari-legal.md), care a pregătit terenul
legal (politica de anulare, widget-ul NETOPIA din footer) pentru exact acest
moment. Cerința: la pasul final al rezervării, trei metode de plată — cash la
sosire, transfer bancar, card — cu **cardul ca opțiune principală și
vizibilă**, celelalte două dedesubt cu litere mici, ca să încurajeze plata cu
cardul.

## Ce s-a decis (pe scurt)

- **Suma încasată cu cardul**: integrală, la momentul rezervării — nu doar
  prima noapte. Politica de anulare deja publicată (prima noapte se reține)
  devine, pentru card, o rambursare de "total minus prima noapte".
- **Rambursarea la anulare**: **manuală**. API-ul de refund al NETOPIA pentru
  cardul online nu e încă lansat (vezi mai jos) — sistemul calculează suma și
  o arată, Ovidiu apasă refund din contul NETOPIA.
- **Cash și transfer bancar**: neschimbate — rămân confirmate imediat, ca azi.
  Doar cardul introduce o așteptare (până la plată).
- **Formularul de card**: pagina găzduită de NETOPIA (versiunea 1 a API-ului),
  cu **redirect complet** — nu fereastră suprapusă (motiv tehnic mai jos).
  Butonul „Plătește cu cardul" rămâne mare și principal pe pagina noastră;
  doar la apăsare oaspetele pleacă pe pagina lor, cât introduce cardul, apoi
  se întoarce automat.

## De ce v1 și nu v2, și de ce nu fereastră suprapusă

Verificat direct (nu din memorie) pe portalul NETOPIA
(`doc.netopia-payments.com`) și pe specificația lor OpenAPI live
(`secure.sandbox.netopia-payments.com/spec`), pe 17 septembrie 2026:

- **API v2** (`/payment/card/start`) e recomandat de NETOPIA ca „ultima
  versiune", dar cere ca cererea către ei să conțină **cardul brut**
  (`account`, `expMonth`, `expYear`, `secretCode`) în corpul JSON trimis de pe
  serverul nostru. Fără un widget de tokenizare client-side documentat public,
  asta ar însemna ca serverul nostru (funcția edge) să primească și să
  transmită cardul — conformitate PCI-DSS grea (SAQ D), nepotrivită pentru o
  proprietate mică. N-am găsit un asemenea widget în documentația publică; nu
  construim pe o presupunere.
- **API v1** (cel „vechi", spre înlocuire — dar fără dată fixă, complet
  funcțional azi) are exact modelul opus: „user needs to be redirected to
  NETOPIA's payment page through a form on the merchant side" — cardul se
  introduce pe pagina *lor*, niciodată pe a noastră. E varianta sigură din
  prima zi, fără widget de așteptat.
- **Fereastra suprapusă (iframe) peste pagina noastră** nu funcționează fără
  acordul explicit al NETOPIA: pagina lor găzduită
  (`secure.mobilpay.ro`) trimite
  `Content-Security-Policy: frame-ancestors 'self' secure.mobilpay.ro
  book.danair.ro` — adică doar domenii acceptate explicit de ei pot s-o
  afișeze într-un iframe, iar `rezervari.lalivada.ro` nu e pe listă. Mediul de
  sandbox NU are acest header, deci o fereastră suprapusă ar părea că merge la
  testare și s-ar strica exact în producție. De aceea: **redirect complet**,
  nu iframe — funcționează garantat, fără nicio cerere către NETOPIA.
- Rambursarea automată (`/operation/credit`, `/operation/void`,
  `/operation/capture`) e marcată explicit în specificația lor OpenAPI drept
  „will be available at a future date" — nu există azi un API de refund
  pentru cardul online (doar pentru plata la POS fizic,
  `/payment/cardpresent/refund`, care nu ni se aplică). De-asta rambursarea
  rămâne manuală, nu o presupunere de arhitectură — un fapt verificat.

## Fluxul

### Plecare (PMS → NETOPIA)

1. Oaspetele alege „Plătește cu cardul" în pasul final și apasă butonul
   principal. Frontend-ul cheamă o funcție edge nouă, **`netopia-start`**, cu
   aceleași date ca azi la `booking-create` (checkin/checkout/rooms/guest/
   notes/idempotencyKey/turnstileToken) plus `metodaPlata: 'card'`.
2. `netopia-start` face ce face azi `booking-create` — creează rezervarea prin
   `create_public_booking` cu hold (30 min, `MINUTE_HOLD` existent) — dar
   **nu** cheamă `confirm_public_booking` imediat (asta e diferența față de
   cash/transfer, unde confirmarea vine automat după trimiterea emailului).
   Rezervarea rămâne `pending` până vine IPN-ul de plată.
3. Construiește cererea XML v1 (`order type="card"`), o criptează RSA cu
   certificatul public NETOPIA (pas manual, vezi „Secrete" mai jos), și
   întoarce browserului `env_key`/`data`/`cipher` plus URL-ul de plată
   (`secure.mobilpay.ro` live / `sandboxsecure.mobilpay.ro` sandbox).
4. Browserul trimite automat un formular POST către NETOPIA cu acele câmpuri
   — o redirecționare completă, fără JavaScript intermediar de reținut cardul.

### Întoarcere (NETOPIA → oaspete)

- `url.return` duce oaspetele înapoi pe `/confirmare/{token}` — pagina și
  starea `incarca-confirmare` există deja în `App.jsx`; singura schimbare e că
  poate ajunge acolo *înainte* ca IPN-ul să fi fost procesat (sunt două căi
  asincrone separate). Ecranul trebuie să accepte și starea „încă în
  așteptare, reîncearcă în câteva secunde" — reface polling-ul scurt deja
  folosit acolo, nu un mecanism nou.

### Sosire (NETOPIA → PMS, IPN)

- Funcție edge nouă, **`netopia-ipn`**, primește POST-ul asincron pe
  `url.confirm` — `application/x-www-form-urlencoded`, câmpuri `env_key`,
  `data`, `cipher`, opțional `iv`. **Scrie payload-ul brut** într-un tabel nou
  de audit, `netopia_ipn_log`, înainte de orice procesare — la fel ca
  `access-webhook`/`aiosell_webhook_log`: o notificare de plată reală nu se
  pierde niciodată, chiar dacă restul logicii aruncă o eroare neprevăzută.
- Decriptează cu cheia privată a comerciantului (secret, vezi mai jos),
  citește `action` (`paid`/`confirmed`/`canceled`/...) și `error code`.
- La succes (`error code = 0`, acțiune de plată confirmată): cheamă
  `confirm_public_booking`, scrie `metoda_plata='card'`,
  `plata_status='platit'`, `netopia_ntp_id`, `suma_platita` pe
  `public_bookings`, trimite emailul de confirmare (reutilizează
  `booking-email`, ca azi).
- La eșec/refuz: `plata_status='esuat'`, rezervarea rămâne `pending` — camera
  se eliberează singură la expirarea hold-ului (`expira_rezervari_
  neconfirmate`, neschimbată), exact ca un abandon azi.
- Răspunde mereu cu XML-ul de confirmare cerut de NETOPIA
  (`<crc>...</crc>`), indiferent de rezultatul intern — la fel ca
  `access-webhook`, ca să nu declanșeze reîncercări nedorite din partea lor
  pentru o eroare doar a noastră.

### Anularea (neschimbată ca interfață, doar afișează suma de rambursat)

- `cancel_public_booking` rămâne exact cum e azi — apelabilă direct de `anon`,
  fără funcție edge. Singura adăugire: dacă `plata_status='platit'`, răspunsul
  include suma de rambursat (`total_amount` minus prețul primei nopți,
  calculat cu `nightly_rate` ca la orice altă cameră).
- Emailul de anulare (`booking-email`, cazul deja existent) capătă o variantă
  pentru rezervările plătite cu cardul: „Vei primi înapoi X lei pe cardul
  folosit — se face manual, în câteva zile lucrătoare", plus un email intern
  către adresa de rezervări cu `netopia_ntp_id`-ul, ca Ovidiu să găsească
  tranzacția în contul NETOPIA fără să caute.

## Modelul de date

- **`public_bookings`**, coloane noi:
  `metoda_plata text check (metoda_plata in ('cash','transfer','card'))`,
  `plata_status text check (plata_status in ('asteapta','platit','esuat'))`
  (`null` pentru cash/transfer — nu se aplică），
  `netopia_ntp_id text`, `suma_platita numeric`.
- **Tabel nou, `netopia_ipn_log`**: payload brut (`text`, criptat cum a venit
  — nu decriptat, ca să nu ținem cardul/datele sensibile decriptate mai mult
  decât o cerere), rezultat (`ok`/`eroare`), rezervarea atinsă — modelat după
  `access_audit`.
- Nimic nou pe `reservations`/`guests`.

## Secretele și pașii manuali ai lui Ovidiu

La fel ca la Oblio/Shelly/TTLock/Aiosell — pași o singură dată, făcuți de
Ovidiu, niciodată în cod:

1. Din contul NETOPIA (admin → Puncte de vânzare → Setări tehnice), generează
   sau încarcă un certificat RSA pentru comerciant. NETOPIA dă certificatul
   *lor* public (pentru criptarea cererii); comerciantul dă un certificat
   propriu sau primește unul de la ei (pentru ca NETOPIA să cripteze IPN-ul,
   iar noi să-l decriptăm cu cheia privată).
2. Secrete Edge Function noi: `NETOPIA_SIGNATURE` (posSignature, format
   XXXX-XXXX-XXXX-XXXX), `NETOPIA_PUBLIC_CERT` (certificatul public NETOPIA,
   pentru criptarea cererii de plată), `NETOPIA_PRIVATE_KEY` (cheia privată a
   comerciantului, pentru decriptarea IPN-ului).
3. Comutatorul de mediu e `NETOPIA_LIVE`, și **numai** valoarea exactă
   `true` (litere mici) trimite plata la `secure.mobilpay.ro`; orice
   altceva — nesetat, `True`, `1`, `TRUE` — o lasă la
   `sandboxsecure.mobilpay.ro`. Vezi `netopia-start/index.ts`.
   *(Până pe 21 septembrie 2026 scria aici `NETOPIA_SANDBOX=true`, o
   variabilă pe care codul n-a citit-o niciodată. Cine a urmat pasul ăsta a
   rămas pe sandbox fără să vadă de ce.)*
4. Cele trei secrete formează un SET: `NETOPIA_SIGNATURE`,
   `NETOPIA_PUBLIC_CERT` și `NETOPIA_PRIVATE_KEY` trebuie să vină de la
   ACELAȘI punct de vânzare și din ACELAȘI mediu. Schimbat doar
   certificatul, cheia privată veche rămâne: plata trece, dar confirmarea
   (IPN-ul) nu se mai poate descifra, iar rezervarea rămâne „așteaptă" deși
   clientul a fost debitat.
5. Testare întâi în sandbox, cu cardurile de test din documentația lor,
   înainte de a trece pe live.

## Task-uri

1. **Migrația**: coloanele noi pe `public_bookings`, tabelul
   `netopia_ipn_log`, secretele (puse manual de Ovidiu).
2. **Modulul pur `src/lib/netopia.js`**: construiește XML-ul cererii de plată
   din datele rezervării, criptează/decriptează RSA, interpretează
   `action`/`error code` din IPN, calculează suma de rambursat la anulare —
   separat de rețea și de bază, testat în `src/netopia.test.js`, după modelul
   `src/lib/retragere.js`.
3. **Funcția edge `netopia-start`**: varianta lui `booking-create` pentru
   ramura cardului — creează rezervarea cu hold, nu confirmă, întoarce
   formularul de redirect către NETOPIA.
4. **Funcția edge `netopia-ipn`**: scrie auditul, decriptează, confirmă sau
   marchează eșecul, trimite emailul.
5. **UI**: selector de metodă de plată în `src/booking/App.jsx`, la pasul
   final — card ca buton principal, cash/transfer dedesubt cu text mic;
   `src/booking/api.js` capătă `porneStePlataCard()` alături de
   `creeazaRezervare()` existent.
6. **Anularea**: `cancel_public_booking` întoarce suma de rambursat;
   `booking-email` capătă varianta de text pentru anulare cu card plătit, plus
   emailul intern cu `netopia_ntp_id`.
7. **Testare cap-coadă în sandbox NETOPIA**, cu cardurile lor de test —
   plată reușită, plată refuzată, 3-D Secure dacă se aplică la v1 — înainte de
   a trece pe live.

## Ce nu am verificat / rămâne de decis

- **Certificatele RSA exacte** — cum se generează/schimbă între noi și
  NETOPIA e descris general în doc, dar pașii concreți din admin console
  trebuie parcurși de Ovidiu direct, nu doar citiți.
- **3-D Secure pe v1** — documentația v1 citită nu detaliază explicit fluxul
  3DS (spre deosebire de v2, unde e documentat clar cu `customerAction`/
  `verify-auth`). De verificat în sandbox dacă/cum apare la cardurile de test.
- **Dacă NETOPIA lansează între timp `/operation/credit`** pentru cardul
  online (azi „viitor"), rambursarea poate deveni automată ulterior — fără să
  schimbe restul arhitecturii, doar înlocuiește pasul manual din
  `cancel_public_booking`.
- **Un eventual widget de tokenizare v2** — dacă apare/e confirmat ulterior de
  suportul NETOPIA, ar permite trecerea la v2 cu fereastră suprapusă reală;
  nu blochează lansarea cu v1.
