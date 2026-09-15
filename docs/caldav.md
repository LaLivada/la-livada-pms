# Sălile de evenimente și serverul CalDAV

*Etapa 1, 15 septembrie 2026.* PMS-ul găzduiește calendarele sălilor de
evenimente și le servește prin CalDAV, ca aplicația Calendar de pe iPhone
sau Mac să le vadă și să scrie în ele. Înlocuiește calendarul de pe
Synology; evenimentele nu au nicio legătură cu rezervările pe camere
(blocarea camerelor în zilele cu evenimente vine într-o etapă următoare).

## Piese

| Ce | Unde |
|---|---|
| Serverul CalDAV (protocol pur, testat din vitest) | `supabase/functions/caldav/servitor.ts` |
| iCalendar: parsare, momente, rezumat, împărțirea unui export în obiecte | `supabase/functions/caldav/ics.ts` |
| XML-ul cererilor WebDAV | `supabase/functions/caldav/xml.ts` |
| Intrarea Deno: Basic auth, depozitul pe Supabase, importul .ics | `supabase/functions/caldav/index.ts` |
| Tabelele `caldav_calendare`, `caldav_obiecte`, `caldav_conturi` | migrarea `20260915152127_sali_caldav`, apoi `caldav_obiecte_anulat` |
| Ecranul „Evenimente” (admin: calendarul pe ani, serverul și sălile) și panoul din „Contul tău” | `src/features/caldav.jsx`, `src/data/caldav.js`, `src/lib/evenimente-an.js` |
| Teste | `src/caldav-ics.test.js`, `src/caldav-servitor.test.js`, `src/caldav-date.test.js`, `src/evenimente-an.test.js`, `src/evenimente-ecran.test.js` |

Funcția e deployată cu `--no-verify-jwt`: clienții CalDAV trimit
`Authorization: Basic`, nu JWT Supabase. Validarea e în funcție.

## Cum se folosește

1. **Admin, Setări → Evenimente → Serverul & săli**: adaugă câte un calendar pentru
   fiecare sală (nume, culoare). Pentru mutarea de pe Synology: exportă
   fiecare calendar ca `.ics` din Synology Calendar și importă-l în sala
   lui cu butonul de import. Importul împarte fișierul în obiecte per UID
   (o serie recurentă cu excepțiile ei rămâne un singur obiect), copiază
   VTIMEZONE-urile și ignoră VTODO. Re-importul nu creează dubluri.
2. **Fiecare user, Useri și drepturi → Contul tău**: „Generează parola”.
   Parola apare o singură dată; în bază stă doar SHA-256 al ei. Apoi, pe
   iPhone: Configurări → Aplicații → Calendar → Conturi → Adaugă cont →
   Altul → Adaugă cont CalDAV, cu serverul = adresa completă
   `https://<project>.supabase.co/functions/v1/caldav/principals/<email>/`,
   utilizatorul = emailul de login, parola generată. Pe Mac: cont CalDAV
   „Avansat”, cu adresa serverului, calea de mai sus, portul 443 și SSL.
   Numele scurt `pms.lalivada.ro` nu merge pe iPhone (vezi mai jos).
3. Calendarele noi se creează doar din PMS. `MKCALENDAR` nu trece de
   poarta Supabase (răspunde 501), deci telefonul nu poate crea calendare
   sub acest cont; nici nu e nevoie.

## Ecranul Evenimente (15 septembrie 2026)

Setări → Evenimente are două taburi. **Calendar pe ani**: cele 12 luni ale
unui an, cu o bulină colorată pe zi pentru fiecare sală care are ceva
atunci; o zi apăsată își desface lista (titlu, sală, oră sau interval) chiar
sub luna ei; sălile din legendă se ascund/arată cu un clic, iar anul se
schimbă cu săgețile. **Serverul & săli**: adresa serverului, sălile (nume,
culoare) și importul `.ics`. **Evenimentele anulate trăiesc în calendarul gri „Anulate”** (slug
`anulate`, culoare `#6B7280`). „Anulat” se scrie în două feluri, și
amândouă contează: `STATUS:CANCELLED` (îl pune aplicația de contracte) sau
cuvântul ANULAT în titlu (scris de mână în calendarul vechi de pe Synology).
Regula e `esteAnulat()` din `ics.ts`, iar rezultatul stă în coloana
`caldav_obiecte.anulat`.

Mutarea o face singură funcția edge, în `scrieObiect`: orice eveniment
anulat se scrie în calendarul gri, indiferent de sala cerută, iar copia din
sală rămâne ca piatră de mormânt, ca telefonul să o șteargă de acolo și să o
vadă în gri. Merge la fel la import și la un PUT de pe telefon (acolo se
anulează scriind ANULAT în titlu): răspunsul PUT-ului poartă ETag-ul
rândului nou, iar clientul află de mutare la următorul `sync-collection`.
Calendarul gri se creează singur dacă lipsește. Migrările:
`caldav_obiecte_anulat` (coloana, 38 de evenimente din 820 marcate pe 15
septembrie 2026) și `caldav_calendar_anulate` (calendarul gri și mutarea
celor 38).

În ecranul Evenimente, „Anulate” pornește **ascuns** în legendă: anul arată
implicit doar ce ține, iar numărul din dreapta anului numără doar
calendarele arătate. Pe telefon apare ca orice calendar și poate fi debifat
din aplicația Calendar.

Zilele sunt cele de la Vaslui
(`src/lib/timp.js`); DTEND e exclusiv, deci un eveniment de toată ziua
5–7 iunie se termină pe 8 la 00:00 și ocupă trei zile. Seriile recurente
apar doar la prima lor dată, marcate „se repetă” (expandarea RRULE rămâne
pentru mai târziu).

## Zilele cu evenimente nu se rezervă online (15 septembrie 2026)

O nuntă ține toată pensiunea, iar camerele le împarte recepția cu nuntașii,
nu site-ul cu cine nimerește. Funcția `zi_cu_eveniment(checkin, checkout)`
răspunde dacă sejurul cerut atinge o zi cu eveniment, iar două porți o
folosesc: `public_availability` (caută camere doar dacă ziua e liberă, și
altfel explică de ce) și `create_public_booking` (cea care ține —
căutarea se poate ocoli). Recepția nu e atinsă: din PMS se rezervă orice zi.

Regula e generală, nu pe un an anume, iar sursa adevărului sunt chiar
evenimentele: se mută un eveniment, se mută și ziua închisă; se anulează, se
deschide ziua la loc. `DTEND` fiind exclusiv, un eveniment de toată ziua
24→25 iulie închide noaptea de 24, dar nu și sosirea pe 25.

## De ce nu există o adresă scurtă (15 septembrie 2026)

S-au încercat două căi ca pe telefon să se scrie doar `pms.lalivada.ro`,
amândouă picate pe iOS:

- **Proxy prin Vercel** (`/caldav/*` rescris către funcție): mitigarea de
  sistem a Vercel (anti-DDoS, „System Rule” în Firewall → Traffic, separată
  de regulile WAF) provoacă clientul Apple (`accountsd`/`dataaccessd`,
  „uncategorized_bot”) la a treia cerere, cu fereastră de 10 minute pe IP;
  regulile Bypass din WAF n-o opresc, iar planul Hobby nu permite System
  Bypass (limită 0). Ar merge doar cu Vercel Pro (regulă Bypass cu
  `bypassSystem`) sau cu alt proxy fără protecție anti-bot.
- **Redirect `/.well-known/caldav`** (308, pe alt host, către funcție):
  iOS urmează redirectul pentru prima cerere, dar rămâne apoi pe gazda
  inițială și cere acolo căile descoperite (404 la Vercel). Redirectul
  rămâne în `vercel.json` pentru clienții care urmează corect redirecturi
  între gazde (Thunderbird), dar instrucțiunile din aplicație dau adresa
  completă.

Lecții Vercel: `:cale*`/`:cale+` nu prind căile cu bară finală (folosește
`:cale(.*)`); rescrierile externe nu trimit `x-forwarded-host`; în funcția
hostată `host` e `edge-runtime.supabase.com`.

## Protocolul, pe scurt

- `PROPFIND` pe `/`, `/principals/<user>/`, `/calendars/` (adâncime 1
  listează calendarele), `/calendars/<slug>/` (adâncime 1 listează
  obiectele), `/calendars/<slug>/<href>`.
- `REPORT` pe calendar: `calendar-query` (cu `time-range`; seriile
  recurente se întorc mereu), `calendar-multiget`, `sync-collection`
  (token = `https://pms.lalivada.ro/caldav/sync/<calendar>/<ctag>`; token
  străin sau din viitor → 403 `valid-sync-token`, clientul reia de la zero).
- `PUT` cu `If-None-Match: *` / `If-Match`, 201/204 cu `ETag`; UID dublu
  la alt href → 412 `no-uid-conflict`; `DELETE` lasă o piatră de mormânt
  (`sters = true`) cu `sync_seq`-ul ștergerii.
- `PROPPATCH` pe calendar: `displayname`, `calendar-color`,
  `calendar-order` se salvează; restul primesc 403 în propstat.
- Hrefurile din răspunsuri sunt căi absolute publice
  (`/functions/v1/caldav/...`), calculate de `adreseDinCale`: poarta
  Supabase taie `/functions/v1` înainte ca cererea să ajungă în funcție,
  iar cu baza văzută de funcție (`/caldav`) telefonul cerea o cale
  inexistentă și pica la adăugarea contului.
- `getctag` și `sync-token` vin din `caldav_calendare.ctag`, incrementat
  de triggerul `caldav_obiecte_schimbare` la orice scriere; același trigger
  pune `etag = md5(ics)`.

## Ce nu face (încă)

- Nu expune evenimentele în ecranele PMS (etapa 2: ecranul „Evenimente”).
- Nu blochează camerele în zilele cu evenimente (etapa 3).
- Fără invitații/`schedule-inbox`, fără VTODO, fără `.well-known` pe
  domeniul supabase.co (contul se adaugă cu adresa completă a serverului).
