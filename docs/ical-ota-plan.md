# Sincronizare iCal cu Airbnb și Booking.com — plan de implementare

> **Actualizare (16 septembrie 2026):** a apărut o a șasea variantă,
> Aiosell, cu API documentat și webhook real, posibil sub buget (10 $/lună,
> de confirmat) — vezi [`aiosell-plan.md`](aiosell-plan.md). Dacă prețul se
> confirmă, acela devine planul principal; documentul de față rămâne
> varianta sigură, gratuită, de rezervă.

## De ce asta, și nu un channel manager

Ideea inițială a fost un channel manager „adevărat" (Channex.io), care ar fi
trimis tarife live și ar fi primit rezervările instant, pe toate canalele
deodată. Verificat direct pe paginile lor de prețuri, nu doar din memorie:

| Furnizor | Preț real la 16 camere | De ce nu |
|---|---|---|
| **Channex** | minim 130 $/lună + tarif per proprietate | e infrastructură en-gros pentru firme care vând software altor hoteluri, nu pentru o singură proprietate — chiar ei recomandă „ia un channel manager direct, te costă mai puțin" |
| **Beds24** | ~95-110 €/lună (calculat din calculatorul lor: 8 camere + 3 canale = 57,80 €) | are API real și webhook instant, dar depășește bugetul |
| **Smoobu** | 175,50 €/lună (prepaid anual) | „29 €/lună" din reclamă e prețul pentru **o singură** unitate; are webhook real, dar costă de 6 ori mai mult la 16 camere |
| **MyAllocator / Cloudbeds** | fără preț public de sine stătător | cumpărat de Cloudbeds, intră doar în pachetul complet de PMS, ofertă la cerere |
| **RoomCloud** | fără preț public | confirmă că nu ia comision per rezervare, dar cere abonament — ofertă la cerere |

Tiparul se repetă la toți: taxa reală per cameră la un furnizor cu API și
webhook adevărat e de 5-10 €/cameră/lună. La 16 camere asta înseamnă
90-180 €/lună, oricare ar fi furnizorul. Bugetul stabilit (25-30 €/lună) nu
se potrivește cu nimic din piața asta, la scara actuală.

**Decizie (16 septembrie 2026):** pornim cu sincronizarea gratuită prin
fișiere `.ics`, pe care Airbnb și Booking.com o oferă nativ, fără abonament
și fără certificare. Dacă volumul de rezervări prin OTA justifică ulterior
90-110 €/lună, following-up-ul e Beds24 (cel mai ieftin cu API real găsit) —
arhitectura de mai jos (tabelul de mapare, jurnalul de conflicte, tag-ul
„detalii lipsă") rămâne valabilă și atunci, doar funcția `ical-import` s-ar
înlocui cu apeluri la API-ul lor.

## Ce oferă, ce nu oferă

**Oferă:** o zi rezervată pe Airbnb sau pe Booking.com se blochează automat
în PMS (și invers — o rezervare din PMS se blochează automat pe amândouă,
prin feedul deja existent). Scade mult riscul de suprarezervare, gratuit.

**Nu oferă**, spre deosebire de un channel manager plătit:
- **Fără nume, telefon sau preț al oaspetelui.** Feedurile `.ics` de la
  Airbnb și Booking.com dau doar intervalul ocupat, din motive de
  confidențialitate ale platformelor — nu conțin datele de contact. Recepția
  tot trebuie să deschidă extranetul OTA și să completeze manual rezervarea
  înainte de sosire.
- **Fără tarife sincronizate.** Prețul de pe Airbnb/Booking.com se pune
  manual, în extranetul fiecăruia; nu vine din PMS. (Nu e o pierdere reală —
  decizia anterioară a fost ca prețul să rămână unic pe toate canalele, ceea
  ce oricum ar fi însemnat un tarif static.)
- **Nu e instant.** Airbnb își reîmprospătează feedul cam din oră în oră;
  Booking.com, mai neregulat, uneori și mai rar. Rămâne o fereastră reală de
  risc de suprarezervare, care nu poate fi închisă complet fără un
  channel manager plătit — vezi „Riscuri" mai jos.

## Arhitectura

### Ieșire (PMS → OTA) — deja există, nu se schimbă

[`ical-feed`](../supabase/functions/ical-feed/index.ts) publică deja, per
cameră, un feed `.ics` cu zilele ocupate
(`.../ical-feed/<rooms.ical_token>.ics`). Fiecare OTA îl citește la
intervalul lui. Singurul pas e administrativ: adăugarea URL-ului la
„Sincronizare calendar" în extranetul Airbnb și Booking.com, per cameră.

### Intrare (OTA → PMS) — nou, funcția `ical-import`

O funcție edge nouă, chemată periodic de un job `pg_cron` (același tipar ca
`device-automatizari`, la fiecare 10 minute — vezi
[`20260909194431_automatizari_relee_cron.sql`](../supabase/migrations/20260909194431_automatizari_relee_cron.sql)):

1. Citește rândurile active din tabelul nou `camere_calendare_ota` (o
   adresă `.ics` de import per cameră per OTA).
2. Pentru fiecare, descarcă textul cu `fetch()` simplu — feedurile astea sunt
   adrese publice, fără autentificare.
3. Le parsează cu codul deja scris și testat pentru calendarul sălilor:
   [`imparteInObiecte`, `parseazaICS`, `esteAnulat`](../supabase/functions/caldav/ics.ts).
   Nu se scrie un al doilea parser ICS — funcțiile edge din acest proiect
   pot importa direct fișiere din alt folder de funcție (vezi
   `access-provider/index.ts`, care importă din `src/lib/`), deci
   `ical-import` importă direct din `caldav/ics.ts`.
4. Transformă fiecare eveniment într-o decizie — inserare, actualizare sau
   anulare — printr-o funcție **pură**, testabilă (`src/lib/ical-ota.js`,
   vezi Task 2), nu direct în corpul funcției edge.
5. Aplică deciziile pe `reservations`.

### De ce pull, nu webhook

Un webhook ar însemna ca Airbnb/Booking.com să anunțe PMS-ul instant la o
schimbare — dar niciunul din ei nu oferă asta unei adrese `.ics` gratuite;
webhook-urile sunt exact ce vând channel managerele plătite (Beds24, Smoobu),
verificat mai sus. Cu `.ics`, singurul control pe care îl avem e cât de des
*noi* citim feedul lor — la 10 minute, nu schimbă intervalul lor de
reîmprospătare (vezi „Riscuri"), dar nu costă nimic în plus s-o facem des.

### Idempotență și anulare

Schema are deja, nefolosite până acum, exact coloanele pentru asta:
`reservations.external_source`, `reservations.external_uid` și indexul unic
`res_extern_unic (external_source, external_uid) where external_uid is not null`.
Comentariul din `schema.sql` de lângă acest index spune chiar el:
„Re-importul aceleiași rezervări din OTA nu creează duplicat" — exact
mecanismul de aici.

- **UID nou** (nu există deja o rezervare cu acel `external_source` +
  `external_uid`) → se inserează.
- **UID cunoscut, cu date schimbate** (oaspetele și-a modificat sejurul pe
  OTA) → se actualizează `checkin`/`checkout`, DOAR dacă rezervarea e încă
  `confirmed` și sosirea e în viitor. O rezervare deja `checkedin` sau
  `checkedout` nu se atinge — se loghează și se sare peste, ca un caz pentru
  recepție.
- **UID dispărut din feed** (anulat pe OTA) → rezervarea trece pe
  `cancelled`, cu aceeași gardă (doar dacă e încă `confirmed` și în viitor).
  E același principiu ca la blocajele de eveniment din CalDAV — „anulat prin
  absență", nu o ștergere.

### Conflicte (suprapunere reală)

Constrângerea `fara_suprapunere` de pe `reservations` respinge fizic orice
inserare care s-ar suprapune cu o rezervare activă existentă, indiferent de
sursă — asta există deja și nu se schimbă. Dacă o inserare din import eșuează
din acest motiv, înseamnă o suprarezervare reală (aceeași cameră vândută pe
două canale în fereastra de întârziere): se scrie o intrare în
`activity_log` (vizibilă deja în ecranul Jurnal) și se trimite un email de
alertă prin Resend, la fel ca alerta deja existentă din
`access-provider/index.ts:564` — recepția trebuie să sune oaspetele și să
rezolve manual, nu e ceva ce se poate automatiza sigur.

### Fus orar

Feedurile OTA dau date fără oră (`DTSTART;VALUE=DATE`). Se transformă în
timestamp-uri cu ora de sosire/plecare a hotelului (14:00 / 11:00),
folosind `FUS_HOTEL` și `dinPartiLocale` din
[`src/lib/timp.js`](../src/lib/timp.js) — aceleași funcții introduse la B6
(faza 2) pentru trecerea corectă peste ora de vară/iarnă, nu o conversie
nouă, ad-hoc.

## Modelul de date

### Tabel nou: `camere_calendare_ota`

```sql
create table camere_calendare_ota (
  id                  bigint generated always as identity primary key,
  room_id             text not null references rooms(id) on delete cascade,
  ota                 text not null check (ota in ('airbnb','booking')),
  url_ics             text not null,
  activ               boolean not null default true,
  ultima_sincronizare timestamptz,
  ultima_eroare       text,
  erori_consecutive   int not null default 0,
  creat_la            timestamptz not null default now(),
  unique (room_id, ota)
);
```

O cameră poate avea 0, 1 sau 2 rânduri (una per OTA). Nu e nevoie de un
tabel de „tipuri de cameră" — spre deosebire de Channex/Beds24, care cer
disponibilitate pe tip agregat, `.ics`-ul lucrează la nivel de cameră fizică,
exact ca feedul de ieșire deja existent.

### Ce NU se schimbă

- **`reservations`** — nicio coloană nouă. `external_source`/`external_uid`
  identifică rezervarea; `source` ia direct valorile `booking`/`airbnb`,
  deja prezente în `SOURCES` din
  [`src/lib/constante.js:80`](../src/lib/constante.js); `tags` capătă un tag
  nou, aplicat automat (vezi Task 5).
- **`guests`** — rezervările importate au `guest_id = null` (coloana e deja
  opțională). Recepția completează `occupant_first_name`/`occupant_last_name`/
  `occupant_phone` (coloane deja existente pe `reservations`, gândite pentru
  „ocupantul real, diferit de titularul grupului") după ce verifică
  extranetul OTA.
- **`insigna-sursa.jsx`** — literele „B"/„A" pentru `booking`/`airbnb` există
  deja în componenta de subsol a rezervării.

## Riscuri și limitări

- **Fereastra de întârziere nu dispare.** La 10 minute polling de partea
  noastră, tot rămâne limitat de cât de des își reîmprospătează Airbnb și
  Booking.com **propriul lor** feed de ieșire (cam o oră la Airbnb, variabil
  la Booking.com) — o cameră vândută direct sau pe alt OTA poate rămâne
  vizibilă ca liberă acolo până la următoarea lor actualizare. Asta e limita
  fizică a soluției gratuite, discutată explicit înainte de a alege acest
  drum.
- **Feed gol ≠ feed picat.** Dacă `fetch()` eșuează (URL revocat, eroare de
  rețea, 5xx), NU trebuie tratat ca „niciun eveniment" — altfel toate
  rezervările importate anterior pentru camera aia ar fi anulate din
  greșeală. Se loghează în `ultima_eroare`, se incrementează
  `erori_consecutive`, și se trece la runda următoare. La un prag (propus: 5
  eșecuri consecutive, adică ~50 de minute), se trimite o alertă — un URL
  stricat nu trebuie descoperit peste o săptămână.
- **Ocupanții rămân parțial necunoscuți** până recepția verifică manual
  extranetul OTA — nu există nicio automatizare care poate umple asta din
  `.ics`.
- **Nicio schimbare de tarif nu ajunge pe OTA automat** — rămâne o sarcină
  manuală, de câte ori se schimbă sezonul.

## Task-uri

### Task 1 — migrația `camere_calendare_ota`

Fișier: `supabase/migrations/<timestamp>_camere_calendare_ota.sql`. Creează
tabelul de mai sus, RLS pornit fără politici publice (doar service role
scrie/citește din funcția edge; ecranul din PMS citește prin RPC-uri
`security definer`, aceleași verificări de rol ca restul ecranului Camere).
Verificare: `apply_migration` + o inserare/ștergere manuală prin MCP pentru
confirmarea constrângerilor (`unique(room_id, ota)`, `check(ota in (...))`).

### Task 2 — modulul pur `src/lib/ical-ota.js`

Logica de decizie (ce e nou, ce s-a schimbat, ce a dispărut din feed),
separată de codul care vorbește cu rețeaua sau cu baza — după modelul deja
folosit pentru `src/lib/retragere.js` (validare pură, testată separat de
funcția edge care o consumă).

Semnătura propusă:

```js
// @ts-check
export function decideActiuni(evenimenteFeed, rezervariExistente, acum) { ... }
```

- `evenimenteFeed`: `{ uid, checkin, checkout }[]`, deja parsate din ICS.
- `rezervariExistente`: rezervările curente cu același `(external_source, room_id)`.
- `acum`: injectat, nu `new Date()` direct — ca testele să fie deterministe.
- Întoarce trei liste: `deInserat`, `deActualizat`, `deAnulat` — funcția edge
  doar le execută, nu decide nimic ea însăși.

Teste: `src/ical-ota.test.js` — cazuri pentru fiecare ramură din
„Idempotență și anulare" de mai sus, plus garda „nu atinge o rezervare deja
checked-in/checked-out", plus cazul „feed gol nu înseamnă anulare în masă"
(funcția nu primește niciodată un feed gol ca rezultat al unei erori — asta
se filtrează în funcția edge, înainte de a ajunge aici; testul confirmă că,
dacă i se dă totuși o listă goală de evenimente, funcția anulează tot ce
lipsește — comportamentul corect când feedul chiar e gol legitim).

### Task 3 — funcția edge `ical-import`

Fișier nou: `supabase/functions/ical-import/index.ts`. Chemată doar de cron
(`verify_jwt` implicit, autentificare prin `service_role_key` din Vault, la
fel ca `device-provider`). Pentru fiecare rând activ din
`camere_calendare_ota`:

1. `fetch(url_ics)`; la eșec, scrie `ultima_eroare` + incrementează
   `erori_consecutive`, sare la următorul rând (try/catch per cameră, o
   cameră picată nu oprește restul).
2. Parsează cu `imparteInObiecte`/`parseazaICS` din `../caldav/ics.ts`.
3. Citește rezervările existente cu acel `(external_source, room_id)`.
4. Cheamă `decideActiuni` din `src/lib/ical-ota.js`.
5. Execută inserările/actualizările/anulările. La eroare de suprapunere
   (constrângerea `fara_suprapunere`), scrie în `activity_log` și trimite
   alerta prin Resend (Task 4).
6. Resetează `erori_consecutive = 0` și scrie `ultima_sincronizare = now()`.

Verificare: rulare manuală prin `curl` cu un fișier `.ics` de test (2-3
evenimente, unul care se suprapune intenționat cu o rezervare existentă, ca
să se vadă alerta), la fel cum a fost verificată funcția `retragere` — fără
teste Deno automate, doar pentru logica pură din Task 2.

### Task 4 — jobul `pg_cron`

Fișier: `supabase/migrations/<timestamp>_ical_import_cron.sql`, calchiat
exact după `20260909194431_automatizari_relee_cron.sql` — `cron.schedule`
la `*/10 * * * *`, `net.http_post` către `ical-import`, `Authorization`
din `vault.decrypted_secrets` cu numele `service_role_key` (deja setat, de
la integrarea Shelly — nu mai e nevoie de un pas manual nou).

### Task 5 — alerta de conflict

Reutilizează exact tiparul din `access-provider/index.ts:564`
(`RESEND_API_KEY`, degradează la un simplu `console.error` dacă lipsește
cheia, nu blochează rularea). Destinatar: `office@lalivada.com` (configurabil
din `app_state`, cheia `pms:ical-ota:v1`, ca la Oblio). Subiect explicit:
„Suprarezervare posibilă — cameră X, <data>".

### Task 6 — UI în `camere.jsx`

Lângă câmpul deja existent cu URL-ul de ieșire (`icalUrl`, linia ~418), două
câmpuri noi per cameră: „Import calendar Airbnb" și „Import calendar
Booking.com" (URL-ul primit din extranetul lor), plus un indicator mic —
„sincronizat acum 4 minute" / „eroare: <mesaj>" — citit din
`camere_calendare_ota`. Salvarea trece prin RPC-uri noi
(`seteaza_calendar_ota_camera`, `sterge_calendar_ota_camera`),
`security definer`, cu aceeași verificare de rol ca restul ecranului Camere.

### Task 7 — tag implicit și banner în fișa rezervării

- Adaugă `"Detalii lipsă (OTA)"` ca tag aplicat automat de `ical-import` la
  fiecare inserare (nu neapărat în `DEFAULT_TAGS`, ca sugestie de UI —
  aplicarea automată nu depinde de acea listă).
- În `src/features/rezervari/fisa-rezervare.jsx`, când rezervarea are acest
  tag, un banner scurt: „Rezervare de pe {sourceLabel}. Completează numele
  și telefonul oaspetelui înainte de sosire." — dispare automat dacă
  recepția completează `occupant_first_name`/`occupant_phone` și șterge
  tag-ul (sau rămâne, ca istoric — de discutat la implementare, nu e o
  decizie care schimbă arhitectura).

### Task 8 — documentație pentru Ovidiu

Un paragraf în acest fișier (secțiunea „Configurarea", adăugată după
implementare) cu pașii exacți: unde din contul Airbnb/Booking.com se ia
adresa `.ics` de export, și unde se lipește URL-ul de ieșire al PMS-ului
(`ical-feed`) în extranetul fiecăruia — simetric, ambele adrese, ambele
direcții, pentru fiecare cameră listată.

## Ce nu am verificat

- Formatul exact al feedului `.ics` de export al Booking.com — Airbnb are un
  format stabil, documentat pe larg; Booking.com e cunoscut ca mai
  neregulat (uneori întârzie ore, uneori omite evenimente). Primul test real
  se face abia când Ovidiu conectează o cameră reală pe fiecare platformă.
- Dacă Airbnb/Booking.com pun vreo limită de rată la cererile GET pe adresa
  lor de export — improbabil la un interval de 10 minute pe 16 adrese, dar
  neconfirmat.
