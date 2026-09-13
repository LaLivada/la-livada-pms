# Faza 2 — consistență și robustețe

Continuarea planului din `docs/audit-2026-09.md` (§4, Faza 2). Aici stau
**designul** ales pentru fiecare punct și **starea** implementării. Ordinea
de execuție diferă de cea din audit: întâi lucrurile mici, fără migrări
grele (fus orar, erori în jurnal), apoi miezul fazei (`room_status` +
Realtime), apoi restul.

| # | Punct din audit | Stare |
|---|---|---|
| 4 | B6 — fusul orar unificat | **făcut**, 14 septembrie 2026 (§1) |
| 6 | D7 — erorile din producție în jurnal | **făcut**, 14 septembrie 2026 (§2) |
| 1 | A6 — `room_status` ca tabel + Realtime | de făcut |
| 2 | B3 — Realtime pe `reservations` în fereastră | de făcut |
| 5 | B7 — facturare atomică | de făcut |
| 3 | A4 — `activity_log` cu `room_id`/`reservation_id` + arhivare | de făcut |
| 7 | B5 — integrare + e2e în CI pe baza din migrații | cere al doilea proiect Supabase (la proprietar) |

---

## 1. Fusul orar unificat (B6)

### 1.1 Ce era greșit

„Azi", „ziua sosirii", „miezul nopții" se calculau cu `setHours(0, 0, 0, 0)`
— în fusul **browserului**. Cât timp toate tabletele sunt la Vaslui nu se
vede. Se vede când proprietarul deschide aplicația din alt fus: din Tokyo,
night audit-ul găsea „plecări restante" de la ora 18 (acolo e deja mâine);
din New York, coloanele calendarului erau decalate cu o zi față de
rezervări, iar weekendul se colora pe ziua greșită.

Aceeași problemă, pe partea de SQL: `stay_total` număra nopțile cu
`p_checkin::date`, adică pe zilele **UTC** ale sesiunii (Supabase rulează
Postgres pe UTC). O sosire la 01:00 ora României cădea în ziua UTC de
dinainte și se taxa o noapte în plus față de PMS. Raportul lunar și
disponibilitatea publică foloseau deja `at time zone 'Europe/Bucharest'`.

### 1.2 Regula

Rezervările țin **momente** (`timestamptz`, ISO cu `Z`). Orice trecere de la
moment la zi / oră de perete și înapoi se face într-un singur loc,
[src/lib/timp.js](../src/lib/timp.js), în fusul hotelului (`FUS_HOTEL =
"Europe/Bucharest"`), prin `Intl.DateTimeFormat` — baza IANA e completă în
orice browser modern, în Node și în Deno, și trece corect peste schimbarea
orei fără nicio ajustare manuală. Nicio librărie nouă.

| Funcție | Ce face |
|---|---|
| `ziLocala(d)` | miezul nopții de la Vaslui al zilei în care cade `d` — înlocuitorul lui `startOfDay` |
| `dataLocala(d)` / `textLocal(d)` | `AAAA-LL-ZZ` / `AAAA-LL-ZZTHH:MM`, valorile pentru `<input type="date">` și `datetime-local` |
| `momentLocal(text)` | inversul: un șir **fără fus** (din formular) e ora hotelului; un șir cu `Z`/`+03:00`, un `Date` sau un număr trec neatinse |
| `adaugaZile(d, n)` | aceeași oră de perete, `n` zile mai târziu — nu `+ n × 86400000`, care peste schimbarea orei mută 14:00 la 15:00 |
| `zileIntre(a, b)` | zile calendaristice între zilele celor două momente |
| `esteAceeasiZi`, `esteWeekend`, `ziuaSaptamanii` | după ziua de la Vaslui |
| `inceputDeLuna`, `sfarsitDeLuna`, `zileInLuna` | lunile, la miezul nopții de la Vaslui |
| `laOraLocala`, `decalajFus`, `partiLocale`, `dinPartiLocale` | mutate din `acces.js` (rămân re-exportate de acolo pentru `access-provider`) |

Toate funcțiile acceptă și un șir fără fus și îl citesc ca oră a hotelului,
deci `nightsBetween("2026-09-14T14:00", "2026-09-16T11:00")` dă 2 pe orice
mașină.

### 1.3 Ce s-a schimbat

- **`src/lib`**: `availability.js` (`startOfDay` a dispărut; `nightsBetween`,
  `occupancyForStay`, `validateStay` pe zilele hotelului), `tranzitii.js`
  (`isSameDay`, `canCheckIn`, `canNoShow`, night audit), `rapoarte.js`,
  `pricing.js` (`inSeason` citește luna-ziua la Vaslui; buclele pe nopți cu
  `adaugaZile`), `rezervari-online.js` (`candAVenit`), `format.js` (toate
  formatoarele `Intl` au `timeZone: FUS_HOTEL`; `toDateInput` și
  `toLocalInputValue` scriu ora hotelului).
- **Ecrane**: calendarul (zilele, saltul la dată, mutarea prin tragere,
  barele, weekendul), Azi, fereastra rezervării (valorile implicite 14:00 /
  11:00, `momentLocal` pe tot ce vine din câmpuri), grupuri, housekeeping,
  facturare (data chitanței, luna exportului), raportul zilnic.
- **SQL** (migrarea `fus_hotel_in_pret`): `stay_total`,
  `occupancy_for_stay`, `online_night_adjustment_pct` numără pe zilele de la
  Vaslui. Semnături și drepturi neschimbate; prețurile la orele obișnuite
  (14:00 → 11:00) ies identic — diferența apare doar pentru sosiri/plecări
  între 00:00 și 03:00 ora României, unde SQL-ul taxa o noapte în plus.

### 1.4 Verificare

- `src/timp.test.js` — 30 de teste cu așteptări scrise în UTC (miezuri de
  noapte vara/iarna, ambele zile de schimbare a orei, `adaugaZile` peste
  ele, dus-întors formular ↔ moment).
- CI rulează toată suita de două ori: în fusul mașinii (UTC pe ubuntu) și
  cu `TZ=America/New_York`. Înainte de schimbare suita trecea în orice fus
  fiindcă testele erau *consecvente cu fusul mașinii*, nu corecte — acum
  spun același lucru oriunde.
- Local, pe Windows, Node ignoră un `TZ` diferit de `UTC` (Node 24, ICU cu
  fusul sistemului); verificarea de acasă e `TZ=UTC npx vitest run`. Primul
  push a picat în CI din cauza asta: cinci teste își construiau „acum" în
  fusul mașinii — acum îl construiesc în ora hotelului.
- În bază, după migrare: un sejur 14 sept 01:00 → 16 sept 11:00 (ora
  României) costă 2 nopți, la fel ca unul de la 14:00.

### 1.5 Ce NU s-a schimbat

- Fereastra de încărcare (`src/data/nucleu.js`, `fereastraImplicita`)
  rămâne pe miezul nopții local: marginile ei sunt aproximative prin
  construcție (−30 / +400 de zile), nu contează în ce fus cad.
- Site-ul de rezervări (`src/booking/zile.js`) lucrează cu date
  calendaristice alese de vizitator; conversia la momente o face
  `booking-create`, pe server. Nu e atins.
- `access-provider` (funcția edge) importă `src/lib/acces.js`, care acum
  importă `timp.js`. Versiunea deployată (48) are propria copie, mai veche —
  la următorul deploy trebuie inclus și `src/lib/timp.js`.

---

## 2. Erorile din producție în jurnal (D7)

### 2.1 Ce era greșit

O eroare pe tableta recepției se vedea doar în consola browserului, adică
nicăieri: nimeni nu deschide consola pe o tabletă, iar până se uită cineva,
pagina a fost reîncărcată. Auditul propunea `window.onerror` +
`unhandledrejection` care scriu în `activity_log`, sau Sentry. Am ales
tabelul existent: fără serviciu nou, fără cheie nouă, și rândul apare exact
în ecranul Jurnal pe care recepția îl are deja.

### 2.2 Cum funcționează

[src/lib/erori-productie.js](../src/lib/erori-productie.js), instalat în
`src/main.jsx` înainte de prima randare:

- **ce se scrie**: acțiunea fixă „Eroare în aplicație" și un detaliu de
  forma `[script] TypeError: x is undefined · index-Ab12.js:3:9 · ecran
  calendar · Chrome 128 · Android` — tipul (script / promisiune / randare),
  mesajul cu codul Supabase/Postgres, fișierul cu linia, componenta React
  (din `ErrorBoundary`), secțiunea PMS-ului în care era omul, browserul pe
  scurt. Tăiat la 1000 de caractere, limita coloanei.
- **dedupe și plafon**: aceeași eroare o dată la 10 minute; cel mult 30 pe
  sesiune, ca o buclă de erori să nu umple jurnalul.
- **zgomot ignorat**: `ResizeObserver loop`, „Script error." (script
  străin fără detalii), modulul lipsă după un deploy — pe ăsta
  `ErrorBoundary` îl rezolvă singur cu o reîncărcare.
- **fără toast și fără a doua eroare**: scrierea e `scrieInJurnalTacut`
  din `lib/audit.js` — dacă tocmai baza a picat, eșuează în tăcere. Rândul
  apare oricum imediat în lista locală a ecranului Jurnal.
- **cine scrie**: oricine e în `staff`, camerista inclusiv — aceeași
  politică RLS ca la orice rând din jurnal; semnătura (cine, când) o pune
  trigger-ul, nu browserul. Neautentificat, nimic nu se scrie.
- **în ecran**: rândurile de eroare au titlul roșu și detaliul lăsat să se
  rupă pe rânduri (`.list-row-eroare`).

### 2.3 Verificare

- `src/erori-productie.test.js` — descrierea erorilor, locul din stack sau
  din `ErrorEvent`, agentul scurt, dedupe/plafon, instalarea pe o
  fereastră falsă, raportarea din `ErrorBoundary`.
- Site-ul de rezervări și aplicația de oaspete nu au captură: rulează ca
  `anon`, care nu poate scrie în `activity_log`. Rămâne pentru când vor
  avea un canal propriu.
