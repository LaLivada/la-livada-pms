# Integrare Shelly în PMS

Document de arhitectură pentru controlul releelor Shelly (pornire/oprire +
citire status) direct din PMS, fără Home Assistant, Node-RED, MQTT sau
gateway local suplimentar.

Cerința de bază, de la care pornește tot ce urmează: **din PMS apăs
ON/OFF și un Shelly dintr-o cameră se pornește/oprește.** Orice
complexitate adăugată mai jos e justificată explicit — nimic „enterprise"
de dragul lui enterprise.

Verificat direct în documentația oficială Shelly la 20 august 2026, nu
presupus din memorie — sursele sunt linkuite la fiecare afirmație. Acolo
unde documentația oficială e ambiguă sau contradictorie, e semnalat
explicit, nu ascuns sub o afirmație sigură pe ea.

---

## Ce s-a construit efectiv (9 septembrie 2026)

Documentul de mai jos rămâne planul, dar trei premise ale lui s-au
schimbat între timp. Ce e mai jos are prioritate:

1. **Dispozitivul montat e un Shelly Pro 4PM, adică Gen2**, nu un Shelly
   2.5 (Gen1). Ambiguitatea Gen1-vs-v2 pe care planul o trata ca risc
   principal (secțiunea 7) **nu se mai aplică**: pentru Gen2, API-ul v2 e
   documentat fără echivoc. Ramura v1 nu s-a scris; `devices.device_gen`
   există în schemă ca să poată fi adăugată fără migrare dacă apare vreun
   Gen1.

2. **Un canal poate servi DOUĂ camere.** Camerele sunt legate câte două la
   o cameră tehnică, cu un Pro 4PM acolo. Planul presupunea un dispozitiv
   per cameră (`devices.room_id`); montajul real cere multi-la-multi, deci
   există `device_rooms`. Consecința care contează pentru interfață: cine
   oprește boilerul unei camere îl oprește și vecinului, și asta se vede
   pe ecran permanent, nu doar la apăsare.

   Repartiția ieșirilor, identică pe toate cele 7 camere tehnice:

   | Ieșire (pe releu) | `channel` (în API) | Comandă | Pentru |
   |---|---|---|---|
   | 1 | 0 | iluminat exterior | ambele camere |
   | 2 | 1 | boiler | ambele camere |
   | 3 | 2 | prize | prima cameră |
   | 4 | 3 | prize | a doua cameră |

   Perechile: CT1 1013+1011 · CT2 1009+1007 · CT3 1005+1003 ·
   CT4 1014+1012 · CT5 1010+1008 · CT6 1006+1004 · CT7 1002+1001.
   Lofturile 1101 și 1102 n-au releu.

   **Atenție la numerotare:** aplicația Shelly numerotează ieșirile 1–4,
   API-ul v2 le adresează 0–3. Baza stochează numărul din API. O greșeală
   cu unu oprește boilerul în loc de iluminatul exterior.

3. **Multi-tenant nu există.** Planul presupunea un tabel `hotels` și
   `staff.hotel_id`; niciunul nu e în bază. Credențialele Shelly sunt
   deci per-instalare, în Edge Function Secrets, nu per-hotel în tabel.

Fișiere: `supabase/functions/device-provider/` (funcția + providerul),
`src/data/dispozitive.js` (montajul + accesul la date),
`src/features/automatizare.jsx` (ecranul), `src/shelly.test.js` (teste).

---

## 1. Executive Summary

- **API recomandat: Shelly Cloud Control API** (nu Integrator API, nu
  Fleet Manager, nu MQTT, nu VPN local) — vezi secțiunea 2 pentru motive.
- **Arhitectura recomandată e exact Varianta A**, cea desenată de tine:
  `React → PMS Backend → Shelly Cloud API → Shelly`. Niciun secret Shelly
  nu ajunge vreodată în browser.
- **Shelly 2.5 (Gen1) poate fi controlat prin Shelly Cloud** — dar
  documentația oficială e **ambiguă** dacă noul API v2.0-beta îl acoperă
  direct sau dacă rămâne nevoie de vechiul API v1 (deprecat, dar încă
  funcțional) pentru dispozitivele Gen1. Secțiunea 7 detaliază exact ce
  spune documentația și ce arhitectură de cod izolează acest risc.
- **Model de date generic** (`devices`, nu `shelly_devices`), cu un
  device pe rând per canal — susține de la început mai multe dispozitive
  și canale per cameră, mai multe familii Shelly, și chiar alți furnizori
  în afară de Shelly (exact cum `access_codes` din PMS deja abstractizează
  TTLock printr-un câmp `provider`).
- **Status: cache în baza PMS-ului, actualizat printr-un job periodic
  cu apeluri grupate** (până la 10 dispozitive/apel), nu polling live la
  fiecare deschidere de ecran. La 16–50 camere asta înseamnă 1-2 apeluri
  la Shelly Cloud la fiecare reîmprospătare, mult sub limita de 1
  cerere/secundă.
- **Credențialele Shelly (`auth_key` + `server_uri`) stau exclusiv
  server-side**, o pereche per hotel (nu una globală), într-un tabel
  criptat — nu în variabile de mediu, cum e ok pentru un singur hotel la
  TTLock, dar nu scalează la multi-tenant.

---

## 2. Ce API Shelly trebuie folosit

Shelly oferă mai multe mecanisme de control, cu scopuri diferite.
Comparate direct din [documentația oficială](https://shelly-api-docs.shelly.cloud/) și din
[Shelly Knowledge Base](https://kb.shelly.cloud/knowledge-base/kbuca-understanding-the-differences-between-shelly):

| Mecanism | Ce este | Pentru cine |
|---|---|---|
| **Cloud Control API** | Control al propriilor dispozitive, dintr-un singur cont Shelly Cloud | „Control your own devices within a single Shelly account" — **nu** pentru control al dispozitivelor mai multor clienți diferiți |
| **Integrator API** | Cloud-to-cloud, control al dispozitivelor din **conturile altor useri**, prin consimțământ explicit (OAuth) | Platforme B2B unde fiecare client final are propriul cont Shelly și acordă acces integratorului |
| **Shelly Fleet Manager (SFM)** | Platformă separată de administrare a flotei de dispozitive, cu sau fără cont Shelly Cloud | Operatori/instalatori — dar **doar dispozitive Gen2+** |
| **API local (LAN)** | HTTP (Gen1) / JSON-RPC (Gen2+) direct pe rețeaua locală | Control fără cloud, dar cere acces de rețea la dispozitiv |
| **MQTT** | Broker MQTT (al tău sau al altcuiva), dispozitivul publică/ascultă topicuri | Integrări de tip Home Assistant/Node-RED — exact ce vrei să eviți |

### De ce Cloud Control API, nu Integrator API

Shelly însuși recomandă Integrator API pentru „a smart-home or
energy-management platform that lets independent end customers connect
their own Shelly devices" — adică exact modelul unde fiecare hotel are
deja un cont Shelly al lui, pe care ți-l conectează prin consimțământ
([sursă](https://kb.shelly.cloud/knowledge-base/kbuca-understanding-the-differences-between-shelly)).
Pe hârtie, ăsta pare cazul tău multi-tenant (secțiunea 11).

În practică, Integrator API are trei costuri reale, verificate din
[pagina oficială de aplicare](https://support.shelly.cloud/en/support/solutions/articles/103000295194-appy-for-integrator-api):

1. **Nu e self-service.** Se aplică printr-un formular, cu „maximum
   details about the company, use cases and also the scale", iar Shelly
   „reserves the right to decline requests". Nu există termen de
   aprobare documentat.
2. **„Licenses for personal/non-commercial use are not provided."**
   Trebuie o justificare de business.
3. Adaugă un flux OAuth de consimțământ pe care trebuie să-l construiești
   în PMS (fiecare hotel „se loghează cu contul lui Shelly Cloud și
   acordă acces") — complexitate reală, pentru un beneficiu pe care nu-l
   ai încă (nu există hoteluri terțe cu conturi Shelly preexistente pe
   care să le conectezi; tu configurezi dispozitivele hotelului direct).

**Recomandare: Cloud Control API, cu o pereche `auth_key`/`server_uri`
per hotel**, generată de tine (sau de administratorul hotelului) din
aplicația Shelly Cloud și introdusă în PMS ca setare de hotel — la fel
cum ai făcut deja cu contul TTHotel Integration pentru yale. Izolarea
între hoteluri vine din faptul că fiecare hotel are propria cheie, nu
dintr-un mecanism OAuth. Dacă modelul de business se schimbă — devii un
SaaS unde hoteluri independente își aduc propriul cont Shelly deja
existent — atunci Integrator API devine soluția corectă, iar arhitectura
de mai jos (provider izolat în cod, un `auth_key` per hotel în bază, nu
în variabile de mediu) migrează spre el fără să rescrii restul PMS-ului.

### De ce nu Fleet Manager

„SFM works only with Gen2+ devices" — exclude direct Shelly 2.5, care e
Gen1 ([sursă](https://kb.shelly.cloud/knowledge-base/kbuca-understanding-the-differences-between-shelly)). Nu se pune problema.

### De ce nu API local / VPN (Varianta C)

Detaliat în secțiunea 3, dar pe scurt: cere fie expunerea rețelei locale
a hotelului către internet (risc de securitate), fie un tunel VPN care
necesită un echipament sau un router capabil la fața locului — exact
„gateway-ul local suplimentar" pe care ai zis explicit că nu-l vrei.

### De ce nu MQTT (Varianta B)

Shelly 2.5 are „basic MQTT support since version 1.3.0" — tehnic
posibil ([sursă](https://shelly-api-docs.shelly.cloud/gen1/)) — dar tot
ai nevoie de un broker MQTT accesibil din internet (găzduit de tine sau
de un terț), plus dispozitivele trebuie configurate să se conecteze la
el. Nu adaugă nimic față de Cloud Control API pentru cazul tău (ON/OFF +
status), doar o piesă de infrastructură în plus de operat. Ai spus
explicit „NU vreau MQTT dacă nu este absolut necesar" — nu este.

---

## 3. Compararea variantelor

| Criteriu | A: Shelly Cloud API | B: MQTT | C: VPN/rețea locală | D: Integrator API |
|---|---|---|---|---|
| **Avantaje** | Zero infrastructură nouă; API HTTP simplu; credențiale ușor de rotit | Latency mică; push nativ de status | Latency minimă; funcționează și fără Shelly Cloud | Izolare „oficială" multi-tenant prin OAuth |
| **Dezavantaje** | Depinde de disponibilitatea Shelly Cloud | Trebuie găzduit/operat un broker; complexitate de rețea la fiecare dispozitiv | Cere echipament/rută de rețea la fiecare hotel — exact gateway-ul pe care nu-l vrei | Aprobare Shelly obligatorie; flux OAuth de construit; nepotrivit până nu ai hoteluri cu cont propriu |
| **Securitate** | Un singur secret per hotel, server-side | Broker = suprafață de atac în plus, credențiale MQTT per dispozitiv | Rețeaua hotelului expusă către cloud, direct sau prin tunel | Cea mai bună izolare teoretică (consimțământ per dispozitiv) |
| **Complexitate** | Mică — un provider HTTP, ca la TTLock | Medie-mare — broker + gestionare conexiuni | Mare — VPN/tunel per locație, NAT, firewall | Mare — OAuth, aprobare, onboarding per hotel |
| **Costuri** | Gratuit (cont Shelly Cloud standard) | Cost de găzduire broker (sau serviciu MQTT plătit) | Cost echipament/VPN per locație | Necunoscut — nedocumentat public, posibil per-licență |
| **Scalabilitate (camere)** | Foarte bună — vezi secțiunea 12 | Bună, dar crește operațional cu fiecare locație | Slabă — fiecare locație nouă = infrastructură nouă | Bună, dar bariera de intrare (aprobare) nu ține de numărul de camere |
| **Dependențe** | Shelly Cloud | Broker MQTT + Shelly Cloud sau firmware local | Router/VPN capabil la fiecare hotel | Shelly Cloud + aprobare Shelly + flux OAuth |
| **Disponibilitate** | Cât e disponibil Shelly Cloud (nu SLA public găsit) | Cât e disponibil broker-ul tău (îl controlezi) | Cât e disponibilă rețeaua locală + tunelul | Cât e disponibil Shelly Cloud |
| **Latency** | ~100–300ms tipic pentru un apel HTTPS cloud-to-cloud | Mică, dacă broker-ul e aproape | Mică, dacă tunelul e stabil | Similar cu A |
| **Verificare status** | `GET .../v2/devices/api/get`, sau eveniment WebSocket | Subscriere la topicul de status | Cerere HTTP locală directă | Similar cu A, prin cont delegat |
| **Shelly offline (fără internet la hotel)** | Comanda eșuează cu eroare clară (`DEVICE_OFFLINE`) | La fel — dispozitivul nu se poate conecta la broker | Comanda eșuează (nicio rută către dispozitiv) | La fel ca A |
| **Shelly Cloud indisponibil** | PMS nu poate trimite comenzi deloc — trebuie tratat explicit în UI | Neafectat, dacă broker-ul nu depinde de Shelly Cloud | Neafectat | Afectat la fel ca A |
| **Potrivit pt. sute/mii de camere** | Da, cu batching (secțiunea 12) | Da, dar operațional mai greu de întreținut la scară | Nu, fără un gateway per locație | Da, tehnic — dar bariera de aprobare nu dispare cu scara |

---

## 4. Arhitectura recomandată

```
React PMS
   │  HTTPS, doar către PMS Backend (niciodată direct la Shelly)
   ▼
PMS Backend (Supabase Edge Function, ca și access-provider existent)
   │  HTTPS, auth_key din bază/secret, per hotel
   ▼
Shelly Cloud API (Cloud Control API v2, cu fallback v1 pt. Gen1)
   │  Internet
   ▼
Shelly 2.5 / Shelly Plus / Shelly Pro (la hotel)
```

Exact Varianta A cerută. Diferența principală față de propunerea ta e că
`auth_key`-ul nu e o singură valoare globală, ci una per hotel (secțiunea
11) — restul e identic.

Acest tipar e deja folosit în PMS pentru TTLock
(`supabase/functions/access-provider/`): un endpoint unic, autentificare
pe JWT + rol de staff, un modul `providers/*.ts` care izolează
specificul furnizorului. Integrarea Shelly urmează exact același tipar,
ca un nou provider — nu o arhitectură separată.

---

## 5. Modelul de date

Propunerea ta (`ShellyDevice` cu `room_id`, `shelly_device_id`,
`channel`...) e aproape corectă structural, dar are un nume prea
specific. Dacă tabelul se numește `shelly_devices`, orice al doilea
furnizor de dispozitive (alt brand de relee, senzori, etc.) forțează fie
un tabel paralel, fie o migrare. Soluția: un tabel generic `devices`,
cu un câmp `provider` — exact cum `rooms.access_provider` /
`rooms.access_lock_id` deja abstractizează TTLock în acest PMS.

O diferență importantă față de tiparul yalelor: la yale e o relație 1:1
(o cameră are o singură ușă). La Shelly, cerința ta explicită e mai
multe dispozitive și mai multe canale per cameră — deci nu poate sta pe
coloane în `rooms`, are nevoie de un tabel propriu, cu un rând per
**canal**, nu per dispozitiv fizic (Shelly 2.5 are 2 relee independente,
care pot controla lucruri diferite chiar în aceeași cameră).

```sql
create table devices (
  id                 text primary key,           -- 'dv-xxxxxxxxxxxx'
  hotel_id           text not null references hotels(id),
  room_id            text references rooms(id),  -- nullable: un device poate fi neasociat temporar
  provider           text not null default 'shelly',   -- 'shelly' | alt furnizor viitor
  provider_device_id text not null,               -- id-ul Shelly, ex. 'b48a0a1cd978'
  device_gen         text not null,               -- 'gen1' | 'gen2' | 'gen3' — determină ce endpoint Shelly se folosește
  device_model       text,                        -- 'shelly-2.5', 'shelly-plus-2pm', informativ, pt. UI
  kind               text not null default 'switch', -- 'switch' | 'cover' | 'light' | 'sensor' — pt. extindere viitoare
  channel            int not null default 0,       -- releul/canalul (0, 1, ...)
  name               text not null,                -- "Boiler", "Priză balcon" — etichetă vizibilă în PMS
  enabled            boolean not null default true, -- dezactivare fără ștergere
  last_status         jsonb,                        -- cache: {"on": true, "online": true, ...}
  last_seen_at        timestamptz,                  -- ultima citire confirmată de la Shelly
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (hotel_id, provider, provider_device_id, channel)
);

create index devices_room_id_idx on devices(room_id);
create index devices_hotel_id_idx on devices(hotel_id);
```

```sql
-- Credențialele Shelly, per hotel — niciodată în variabile de mediu
-- globale, spre deosebire de TTLock (un singur hotel azi).
create table hotel_shelly_accounts (
  hotel_id     text primary key references hotels(id),
  server_uri   text not null,          -- ex. 'shelly-103-eu.shelly.cloud'
  auth_key     text not null,          -- criptat la nivel de coloană (Supabase Vault / pgsodium)
  created_at   timestamptz not null default now(),
  rotated_at   timestamptz
);
```

```sql
-- Jurnal de comenzi — cine, ce, când, rezultat. Extensie a tiparului
-- deja existent (access_audit).
create table device_commands (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text not null,             -- "Ovidiu (admin)"
  hotel_id    text not null,
  device_id   text not null references devices(id),
  action      text not null,             -- 'on' | 'off' | 'refresh'
  result      text not null,             -- 'ok' | 'error'
  detail      text
);
```

De ce acest model susține cerințele tale de viitor:

- **Mai multe dispozitive/canale per cameră** — `room_id` nu e unic,
  poți avea oricâte rânduri `devices` cu același `room_id`.
- **Shelly 2.5, Plus, Pro, alte modele viitoare** — `device_gen` separă
  logica de API (secțiunea 7); `device_model` e doar etichetă.
- **Alți furnizori în afară de Shelly** — `provider` + `provider_device_id`
  urmează exact tiparul deja validat de `access_codes.provider`.
- **Alte tipuri de dispozitive** (cover, light, senzor) — `kind` separă
  ce tip de comenzi sunt valide, fără să schimbe schema.

---

## 6. API-ul PMS

Endpointuri RESTful, orientate pe resursa `device`, nu pe `room` — un
`deviceId` e deja unic global, iar includerea `roomId` în path pentru
acțiuni ar fi redundantă. `roomId` rămâne util doar pentru listare.

```
GET   /api/rooms/:roomId/devices              -- listă dispozitive dintr-o cameră
GET   /api/devices/:deviceId                  -- detalii + status cache
POST  /api/devices/:deviceId/on               -- pornește canalul
POST  /api/devices/:deviceId/off              -- oprește canalul
POST  /api/devices/:deviceId/refresh          -- forțează o citire live de la Shelly (rate-limitat)
```

De ce nu `POST /api/rooms/:roomId/devices/:deviceId/on`: dacă un device
e mutat între camere (rearanjare fizică), URL-ul de comandă nu ar trebui
să depindă de acea asociere — clientul (React) oricum are `deviceId`
din răspunsul la `GET .../devices`. Nesting-ul sub `room` rămâne acolo
unde chiar exprimă o relație de listare, nu de identificare.

Corp de răspuns, uniform pe toate endpointurile:

```json
{
  "ok": true,
  "device": {
    "id": "dv-1a2b3c4d5e6f",
    "roomId": "r1014",
    "name": "Boiler",
    "channel": 0,
    "status": { "on": true, "online": true },
    "lastSeenAt": "2026-08-20T18:32:11Z"
  }
}
```

La eroare:

```json
{
  "ok": false,
  "reason": "device-offline",
  "error": "Yala/releul nu răspunde. Verifică alimentarea și conexiunea la internet."
}
```

`reason` e un cod stabil pentru UI (branching în React), `error` e
mesajul afișabil — exact tiparul deja folosit de `access-provider`.

---

## 7. Integrarea cu Shelly Cloud

Sursă principală: [Cloud Control API — Getting Started](https://shelly-api-docs.shelly.cloud/cloud-control-api/) și
[Communication v2.0-beta](https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/).

### Autentificare

- Cheia se generează manual, per cont Shelly Cloud, din aplicație:
  **User Settings → Authorization cloud key**. Documentația e explicită:
  *„Whoever has this key can control your Shelly devices"* — și *„the
  key will change if you change your password."*
- Fiecare cont e legat de un server fizic din infrastructura Shelly
  (`server_uri`, ex. `shelly-103-eu.shelly.cloud`), vizibil pe aceeași
  pagină unde se generează cheia. Nu există un singur domeniu universal —
  trebuie citit din contul respectiv, nu presupus.
- Nu există (documentat) un flux OAuth „client credentials" pentru
  server-to-server fără intervenție umană — cheia se generează o
  singură dată, manual, în aplicație, per hotel, la onboarding.

### Citire status

```
POST https://<server_uri>/v2/devices/api/get?auth_key=<AUTH_KEY>
```

```json
{
  "ids": ["b48a0a1cd978"],
  "select": ["status"]
}
```

Răspuns (structură confirmată din documentație):

```json
[
  {
    "id": "b48a0a1cd978",
    "type": "relay",
    "code": "SNPL-00112EU",
    "gen": "G2",
    "online": 1,
    "status": { "...": "variază după tipul dispozitivului" }
  }
]
```

`ids` acceptă **1–10 dispozitive per apel** — important pentru batching
(secțiunea 12).

### Comandă ON/OFF

```
POST https://<server_uri>/v2/devices/api/set/switch?auth_key=<AUTH_KEY>
```

```json
{ "id": "b48a0a1cd978", "channel": 0, "on": true }
```

Succes: `HTTP 200`. Eroare:

```json
{ "error": "DEVICE_OFFLINE", "data": { "messages": [] } }
```

Coduri de eroare documentate: `DEVICE_OFFLINE`, `DEVICE_INVALID_CHANNEL`,
`DEVICE_FAILED_COMMAND`.

### ⚠️ Ambiguitate documentată: Shelly 2.5 (Gen1) pe API-ul v2

Aici documentația oficială nu e clară, și nu inventez o certitudine
care nu există:

- API-ul v2.0-beta descrie endpoint-ul de switch ca fiind *„for all
  types and generations of relays and plugs"* — formulare care sugerează
  că acoperă și Gen1.
- În același timp, pagina „Communication (deprecated)" — API-ul **v1**,
  cu endpointuri separate `POST /device/relay/control` și
  `POST /device/status` — e documentată explicit ca fiind API-ul pentru
  controlul releelor, fără nicio mențiune că ar fi înlocuită complet de
  v2 pentru Gen1. Shelly recomandă migrarea la v2, dar nu confirmă
  răspicat că Gen1 e acoperit 1:1.
- Nu există în documentație un exemplu de răspuns v2 cu `"gen": "G1"`
  pentru un Shelly 2.5 real, ca să confirme dincolo de orice dubiu.

**Recomandare practică:** nu presupune, testează. Arhitectura de mai jos
(secțiunea 15) izolează exact acest risc într-un singur modul —
`providers/shelly.ts` — cu două căi posibile:

1. **Calea sigură, verificată din documentație:** pentru
   `device_gen = 'gen1'`, folosește API-ul v1 (`/device/relay/control`,
   `/device/status`) — deprecat, dar documentat ca funcțional azi, cu
   format de request/response clar.
2. **Calea de test:** înainte de a pune Shelly 2.5-uri reale în
   producție, trimite o comandă v2 către un dispozitiv Gen1 de test. Dacă
   funcționează identic (confirmi `"gen": "G1"` în răspuns și comanda
   chiar comută releul), consolidează totul pe v2 și elimini ramura v1.

Pentru Gen2+ (Shelly Plus, Pro), v2 e clar documentat și fără ambiguități.

### Rate limits, timeout, retry

- **1 cerere/secundă**, documentat explicit atât pentru API-ul vechi cât
  și pentru v2.0-beta.
- Timeout și politică de retry **nu sunt documentate public** de Shelly.
  Recomandare practică: timeout de 5-8 secunde per apel (comenzile
  cloud-to-cloud tipic răspund în sute de milisecunde quando dispozitivul
  e online; peste câteva secunde, presupune eșec), fără retry automat pe
  comenzi ON/OFF (vezi idempotență mai jos) — dar cu retry pe citirea de
  status (idempotentă prin natura ei).

### Idempotență

Nu e documentat explicit de Shelly, dar comportamentul relevant pentru
un releu e evident din natura comenzii: `on: true` e o comandă de NIVEL
(„adu dispozitivul în starea ON"), nu un toggle — trimisă de două ori,
a doua oară e un no-op sigur, nu o eroare și nu o comutare dublă. Riscul
real nu e la dispozitiv, e în jurnalul PMS: dublu-click pe buton nu
trebuie să scrie două rânduri în `device_commands` ca două acțiuni
distincte — se rezolvă simplu, în frontend, dezactivând butonul cât
comanda e în curs (exact tiparul `busyId` deja folosit în PMS la
check-in/check-out).

---

## 8. Flow ON/OFF

```
1. React: utilizatorul apasă "ON" pe un device dintr-o cameră.
2. React → PMS Backend: POST /api/devices/:deviceId/on
   (JWT-ul userului în Authorization header)
3. PMS Backend:
   a. Validează JWT, citește staff.role + staff.hotel_id.
   b. Citește device-ul din bază; verifică device.hotel_id == staff.hotel_id.
      Dacă nu — 403, fără niciun apel către Shelly.
   c. Citește auth_key + server_uri pentru hotel_id din hotel_shelly_accounts.
   d. Alege provider-ul (v1 sau v2, după device.device_gen).
   e. POST către Shelly Cloud: set/switch { id, channel, on: true }.
   f. La succes: actualizează devices.last_status, devices.last_seen_at.
   g. Scrie în device_commands (audit).
4. PMS Backend → React: { ok: true, device: {...} } sau { ok: false, reason, error }.
5. React: actualizează UI DUPĂ confirmarea din pasul 4 — nu optimist
   (secțiunea 14 explică de ce).
```

Flow-ul OFF e identic, cu `on: false`.

---

## 9. Flow de status

Două moduri, pentru scopuri diferite:

**Citire rapidă (cache)** — `GET /api/devices/:deviceId`: citește direct
din `devices.last_status`, fără niciun apel către Shelly. E ce vede
utilizatorul instant la deschiderea ecranului camerei.

**Reîmprospătare live** — `POST /api/devices/:deviceId/refresh`: apelează
Shelly Cloud (`/v2/devices/api/get`) pentru acel device, actualizează
cache-ul, întoarce rezultatul proaspăt. Rate-limitat per device (ex. nu
mai des de o dată la 5 secunde) ca să nu poată fi folosit pentru a ocoli
limita Shelly prin spam de la mai mulți useri simultan.

**Actualizare de fundal (toate dispozitivele unui hotel)** — un job
programat (Supabase cron / edge function scheduler), la fiecare 30-60 de
secunde: citește toate device-urile active ale hotelului, le grupează
în loturi de câte 10 (limita per apel `/v2/devices/api/get`), face un
apel per lot, actualizează cache-ul. Pentru 16-50 camere (assuming 1-2
device-uri/cameră), asta înseamnă 2-10 apeluri Shelly la 30-60 de
secunde — cu mult sub 1 cerere/secundă.

Asta e răspunsul la „nu vreau polling inutil": UI-ul nu face niciodată
polling direct către Shelly; face polling (rapid, local) către PMS
Backend, care la rândul lui reîmprospătează cache-ul cu un ritm mult mai
rar și în loturi.

### Alternativa push: WebSocket real-time events

Shelly Cloud oferă evenimente în timp real prin WebSocket, autentificat
OAuth: `wss://<server>:6113/shelly/wss/hk_sock?t=<ACCESS_TOKEN>`, cu
mesaje `Shelly:StatusOnChange` la fiecare schimbare de stare
([sursă](https://shelly-api-docs.shelly.cloud/cloud-control-api/real-time-events/)).
E mecanismul „corect" pentru actualizări instant, fără nicio latență de
polling.

**Nu e recomandat acum, deliberat:** o conexiune WebSocket trebuie
menținută DESCHISĂ continuu, ceea ce nu se potrivește cu un Edge
Function (proces scurt, per-cerere, cum e `access-provider` azi) — ar
cere un proces separat, mereu pornit (un mic worker dedicat, nu o
funcție serverless). La 16-50 camere, jobul periodic de mai sus e mult
mai simplu de operat și suficient de rapid (status vechi de maximum
30-60 de secunde). Devine relevant abia dacă apare o cerință reală de
„instant" (ex. automatizări care reacționează la schimbarea stării) sau
la o scară mult mai mare, unde polling-ul în loturi ar începe să
consume prea mult din limita de 1 cerere/secundă.

---

## 10. Securitate

- **Credențiale Shelly, exclusiv server-side.** `auth_key` nu ajunge
  niciodată în React — nici măcar indirect (nu se pasează prin query
  string către frontend, nu apare în niciun response JSON către client).
- **Stocare:** `hotel_shelly_accounts.auth_key`, coloană criptată
  (Supabase Vault sau `pgsodium`), nu variabilă de mediu — spre deosebire
  de TTLock azi (un singur hotel, deci un singur set de secrete în Edge
  Function Secrets e suficient); la multi-tenant, secretele trebuie să
  poată fi adăugate/rotite per hotel, fără redeploy.
- **Rotație:** cheia Shelly se regenerează manual din aplicația Shelly
  Cloud (secțiunea 7) — PMS-ul trebuie doar să permită actualizarea
  valorii stocate pentru un hotel, fără downtime pentru celelalte.
- **Autentificare/autorizare useri PMS:** neschimbat față de tiparul
  existent — JWT Supabase + rol din `staff`. Fiecare cerere către
  `/api/devices/*` verifică explicit `device.hotel_id == staff.hotel_id`
  înainte de orice apel către Shelly (secțiunea 11).
- **Audit log:** `device_commands`, per comandă — actor, device, acțiune,
  rezultat, timestamp. Nu loghează niciodată `auth_key`.
- **Rate limiting pe API-ul PMS** (nu doar pe cel al Shelly): limitează
  comenzi per user/minut (ex. 20/min) — protejează împotriva unui script
  greșit sau a unui user care ține apăsat butonul, independent de limita
  Shelly.
- **Prevenirea accesului cross-hotel:** niciodată nu se are încredere
  într-un `hotelId` trimis de client — se derivă exclusiv din
  `staff.hotel_id`, citit din baza de date pe baza JWT-ului, exact ca
  verificarea de rol din `access-provider` azi.
- **Replay/abuz:** comenzile ON/OFF sunt idempotente la nivel de
  dispozitiv (secțiunea 7); protecția reală e rate limiting + audit, nu
  nonce-uri sau semnături — complexitate nejustificată pentru „pornește
  un releu".
- **Logging fără secrete:** mesajele de eroare din `device_commands.detail`
  trec prin aceeași regulă ca `mesajEroare` din PMS — text pentru
  recepție, niciodată `auth_key` sau răspunsul brut HTTP care ar putea
  conține query string-ul cu cheia.

---

## 11. Multi-tenancy

```
Hotel
 └── Rooms
      └── Devices (Shelly, viitor: alți furnizori)
 └── hotel_shelly_accounts (1 cont Shelly Cloud per hotel)
```

- **Un cont Shelly Cloud per hotel**, nu unul singur global și nu
  Integrator API (secțiunea 2). Fiecare hotel are propriul `auth_key`;
  izolarea e structurală — PMS Backend nu poate accidental trimite o
  comandă către dispozitivele hotelului B folosind cheia hotelului A,
  pentru că `device_id`-urile Shelly aparțin unor conturi Shelly diferite
  și necunoscute reciproc.
- **De ce nu un singur cont Shelly pentru toate hotelurile:** ar
  funcționa tehnic (toate device-urile într-un singur cont, separate
  doar prin `room_id`/`hotel_id` în baza PMS), dar orice bug de filtrare
  în cod ar putea lăsa un hotel să vadă/controleze dispozitivele altuia —
  riscul stă complet în codul PMS, fără nicio plasă de siguranță la
  nivel de furnizor. Cu un cont per hotel, o eroare de filtrare în PMS
  tot eșuează sigur (cheia hotelului A pur și simplu nu poate controla
  dispozitive care nu sunt în contul A).
- **Interogări:** orice query pe `devices` trece prin `hotel_id`, derivat
  din userul autentificat, niciodată din parametrii cererii.

---

## 12. Scalabilitate

**16 camere** (1-2 device-uri/cameră ≈ 16-32 device-uri): un singur apel
`/v2/devices/api/get` grupat (limita e 10 id-uri/apel) înseamnă 2-4
apeluri per reîmprospătare de fundal. Comenzile ON/OFF individuale sunt
oricum sub 1/secundă în utilizare normală de recepție.

**50 camere** (≈ 50-100 device-uri): 5-10 apeluri per reîmprospătare de
fundal. Tot confortabil sub limita de 1 cerere/secundă dacă apelurile
sunt spațiate (ex. un apel la fiecare 1-2 secunde în cadrul jobului,
ciclu complet în 10-20 de secunde, apoi pauză până la următorul ciclu de
30-60s).

**Sute/mii de camere (proiecție):** aici jobul de fundal ar trebui
regândit — fie mai multe conturi Shelly per hotel mare (limita de 10
id-uri/apel + 1/secundă înseamnă ~36.000 device-uri/oră teoretic per
cont, deci scala asta ar fi atinsă mult mai devreme de alte limite), fie
migrarea la evenimente WebSocket (secțiunea 9) pentru a elimina complet
polling-ul de fundal. Nu e o problemă de arhitectură — e o problemă de
„la ce prag trece meritul de la polling la push", iar la 16-50 camere
răspunsul clar e polling în loturi.

---

## 13. Error handling

| Situație | Comportament |
|---|---|
| Shelly offline (fără curent/internet la dispozitiv) | Shelly Cloud răspunde `DEVICE_OFFLINE`; PMS arată "Dispozitivul e offline" și dezactivează butoanele ON/OFF până la următoarea reîmprospătare cu succes |
| Internet căzut la hotel (toate dispozitivele) | Toate device-urile hotelului apar `offline` la următoarea reîmprospătare; PMS poate arăta un avertisment la nivel de hotel, nu doar per cameră |
| Shelly Cloud indisponibil | Apelurile PMS→Shelly eșuează (timeout/5xx); PMS arată „Serviciul Shelly nu răspunde momentan" — diferit explicit de „dispozitiv offline", ca recepția să nu creadă că e o problemă locală |
| PMS Backend indisponibil | React arată eroarea standard de rețea a aplicației — neschimbat față de restul PMS-ului |
| Timeout | Tratat ca eșec (nu se presupune succes); nu se reîncearcă automat comanda ON/OFF (idempotență, dar fără garanție că a ajuns) — se arată eroare, userul poate apăsa din nou |
| Rate limit Shelly (>1 req/s) | Jobul de fundal respectă limita prin design (loturi + pauze); dacă totuși apare, comanda eșuează cu eroare clară, nu se face retry agresiv care ar agrava limita |
| Token/auth_key expirat sau revocat | Shelly răspunde eroare de autentificare; PMS marchează hotelul cu „Integrare Shelly neconfigurată/expirată" (mesaj vizibil doar adminului), fără să afecteze alte hoteluri |
| Device ID invalid | Eroare de configurare — apare doar dacă cineva a introdus greșit `provider_device_id`; PMS arată eroarea la nivel de setări cameră, nu la butonul ON/OFF |
| Channel invalid | `DEVICE_INVALID_CHANNEL` de la Shelly — semn clar de configurare greșită în `devices.channel` |
| Command failed | `DEVICE_FAILED_COMMAND` — dispozitivul online, dar comanda n-a reușit (ex. releu blocat); UI arată eroarea, nu succes fals |
| Răspuns întârziat | După timeout, PMS nu presupune nici succes nici eșec cu certitudine — arată „Nu s-a putut confirma" și lasă următoarea reîmprospătare de status să corecteze UI-ul |

---

## 14. UX în React

```
Camera 1014

Boiler                              Priză balcon
[ ON ] [ OFF ]                      [ ON ] [ OFF ]
● Online · Pornit                   ● Online · Oprit
Ultima actualizare: 21:34:12        Ultima actualizare: 21:34:12
```

Dispozitiv offline:

```
Boiler
[ ON ] [ OFF ]     ← dezactivate, cu tooltip "Dispozitiv offline"
● Offline
Ultima actualizare: acum 4 minute
```

**În timpul unei comenzi:** butonul apăsat arată „Se trimite…" și se
dezactivează (ca la check-in/check-out azi) — fără să schimbe starea
afișată optimist. Motiv: dacă schimbi vizual starea înainte de
confirmare și comanda eșuează (offline, rate limit, timeout), UI-ul
minte recepția pentru câteva secunde, exact în momentul în care ar putea
conta (oaspete lângă tastatură). Se schimbă abia după `{ ok: true }` din
răspuns.

**După comandă:**
- Succes: starea se actualizează instant din răspuns, plus un toast
  scurt ("Boiler pornit").
- Eșec: eroare vizibilă lângă buton (`error` din răspunsul PMS), starea
  rămâne cea dinainte (nu se schimbă orbește la eșec).

---

## 15. Implementare backend

Structura urmează exact tiparul `access-provider` deja existent —
un provider izolat per furnizor, un handler HTTP unic.

```
supabase/functions/device-provider/
  index.ts
  providers/
    shelly-gen1.ts   -- API v1 (deprecat, dar documentat și funcțional)
    shelly-gen2.ts   -- API v2.0-beta
```

```ts
// providers/shelly-gen2.ts
// Gen2+ (și, dacă testul din secțiunea 7 confirmă, potențial Gen1 —
// de văzut empiric înainte de a elimina shelly-gen1.ts).

export interface StareDispozitiv { on: boolean; online: boolean; }

export async function seteazaComutator(
  serverUri: string, authKey: string,
  deviceId: string, canal: number, pornit: boolean,
): Promise<void> {
  const r = await fetch(`https://${serverUri}/v2/devices/api/set/switch?auth_key=${authKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: deviceId, channel: canal, on: pornit }),
  });
  if (!r.ok) {
    const date = await r.json().catch(() => null);
    throw new Error(date?.error || `Shelly a răspuns HTTP ${r.status}.`);
  }
}

export async function citesteStare(
  serverUri: string, authKey: string, deviceIds: string[],
): Promise<Record<string, StareDispozitiv>> {
  // deviceIds: maximum 10 per apel — apelantul (index.ts) face gruparea.
  const r = await fetch(`https://${serverUri}/v2/devices/api/get?auth_key=${authKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: deviceIds, select: ["status"] }),
  });
  if (!r.ok) throw new Error(`Shelly a răspuns HTTP ${r.status}.`);
  const lista = await r.json();
  const rezultat: Record<string, StareDispozitiv> = {};
  for (const d of lista) {
    rezultat[d.id] = { on: Boolean(d.status?.switch0?.output ?? d.status?.on), online: d.online === 1 };
  }
  return rezultat;
}
```

```ts
// providers/shelly-gen1.ts
// Cale sigură pentru Shelly 2.5 — API v1, deprecat dar documentat.

export async function seteazaReleu(
  serverUri: string, authKey: string,
  deviceId: string, canal: number, pornit: boolean,
): Promise<void> {
  const corp = new URLSearchParams({
    id: deviceId, channel: String(canal),
    turn: pornit ? "on" : "off", auth_key: authKey,
  });
  const r = await fetch(`https://${serverUri}/device/relay/control`, {
    method: "POST", body: corp,
  });
  if (!r.ok) throw new Error(`Shelly a răspuns HTTP ${r.status}.`);
}

export async function citesteStareReleu(
  serverUri: string, authKey: string, deviceId: string,
): Promise<{ on: boolean; online: boolean }> {
  const corp = new URLSearchParams({ id: deviceId, auth_key: authKey });
  const r = await fetch(`https://${serverUri}/device/status`, { method: "POST", body: corp });
  if (!r.ok) throw new Error(`Shelly a răspuns HTTP ${r.status}.`);
  const date = await r.json();
  return { on: Boolean(date?.on), online: Boolean(date?.online) };
}
```

```ts
// index.ts (schiță — autentificare/autorizare omise, identice cu access-provider)

Deno.serve(async (req) => {
  // ... verificare JWT, staff.role, staff.hotel_id — ca în access-provider ...

  const { deviceId, action } = await req.json(); // action: "on" | "off" | "refresh"

  const { data: device } = await admin.from("devices")
    .select("*").eq("id", deviceId).maybeSingle();
  if (!device) return raspuns({ ok: false, error: "Dispozitivul nu a fost găsit." }, 404);
  if (device.hotel_id !== staff.hotel_id)
    return raspuns({ ok: false, error: "Nu ai acces la acest dispozitiv." }, 403);

  const { data: cont } = await admin.from("hotel_shelly_accounts")
    .select("*").eq("hotel_id", device.hotel_id).maybeSingle();
  if (!cont) return raspuns({ ok: false, reason: "neconfigurat",
    error: "Integrarea Shelly nu e configurată pentru acest hotel." }, 503);

  const provider = device.device_gen === "gen1" ? shellyGen1 : shellyGen2;

  try {
    if (action === "on" || action === "off") {
      await provider.seteazaComutator(cont.server_uri, cont.auth_key, device.provider_device_id, device.channel, action === "on");
      await admin.from("devices").update({
        last_status: { on: action === "on", online: true },
        last_seen_at: new Date().toISOString(),
      }).eq("id", device.id);
    }
    await jurnal(admin, { actor, hotel_id: device.hotel_id, device_id: device.id, action, result: "ok" });
    return raspuns({ ok: true, device: { ...device, status: /* actualizat */ null } });
  } catch (e) {
    await jurnal(admin, { actor, hotel_id: device.hotel_id, device_id: device.id, action, result: "error", detail: String(e.message).slice(0, 300) });
    return raspuns({ ok: false, error: String(e.message) }, 502);
  }
});
```

**Error handling:** fiecare eroare de la Shelly ajunge tradusă (aceeași
funcție `mesajEroare` deja existentă în PMS poate primi coduri noi:
`DEVICE_OFFLINE`, `DEVICE_INVALID_CHANNEL`, `DEVICE_FAILED_COMMAND`).

**Logging:** `device_commands`, fără `auth_key` niciodată în `detail`.

**Securitate:** identică cu tiparul `access-provider` — JWT obligatoriu,
verificare rol, verificare `hotel_id`, credențiale Shelly citite din
bază (nu din cod), niciun secret întors către client.

---

## 16. Plan de implementare în pași

1. **Schema de bază** — tabelele `devices`, `hotel_shelly_accounts`,
   `device_commands` (secțiunea 5).
2. **Un cont Shelly Cloud de test**, un Shelly 2.5 real conectat la el —
   generează `auth_key`, notează `server_uri`.
3. **Testul de ambiguitate (secțiunea 7):** încearcă `/v2/devices/api/set/switch`
   pe Shelly 2.5-ul de test. Dacă merge, `providers/shelly-gen1.ts`
   devine opțional — poți implementa direct pe v2 pentru tot. Dacă nu,
   confirmă că API-ul v1 funcționează ca documentat.
4. **`device-provider` (Edge Function)** — `providers/shelly-gen2.ts`
   (+ `shelly-gen1.ts` dacă pasul 3 arată că e necesar), `index.ts` cu
   `on`/`off`/`refresh`, autentificare identică cu `access-provider`.
5. **Ecran de asociere în Setări → Camere** — un tab nou, „Dispozitive",
   unde admin-ul adaugă un `devices` (provider_device_id, canal, nume) —
   ca tab-ul „Yală" deja existent la camere.
6. **UI de control în cameră** (secțiunea 14) — buton ON/OFF + status,
   citire din cache.
7. **Job de fundal** pentru reîmprospătare status în loturi (secțiunea 9)
   — Supabase scheduled function, la 30-60s.
8. **Audit vizibil** — extensie a ecranului de jurnal existent, cu
   comenzile de dispozitive.
9. **Test real, la fața locului** — pornire/oprire pe un Shelly 2.5 din
   PMS, cu internetul hotelului, nu doar din mediul de dezvoltare.
10. **(Opțional, ulterior)** — dacă apare nevoia reală de scară mare sau
    de latență minimă, evaluează migrarea reîmprospătării de status la
    WebSocket real-time events (secțiunea 9), și/sau Integrator API dacă
    modelul de business devine multi-tenant cu conturi Shelly aduse de
    hoteluri (secțiunea 2).

---

## 17. Riscuri și limitări

- **Ambiguitatea Gen1/v2** (secțiunea 7) e riscul tehnic principal —
  singurul mod de a-l elimina complet e testul empiric din pasul 3 de
  mai sus. Arhitectura izolează riscul într-un singur fișier, deci
  costul unei presupuneri greșite e mic (schimbi `providers/shelly-gen1.ts`,
  nu restul sistemului).
- **Fără SLA public** pentru Shelly Cloud — nicio pagină oficială găsită
  nu documentează un target de disponibilitate. Failure handling-ul
  (secțiunea 13) presupune că Shelly Cloud POATE fi indisponibil și
  tratează asta explicit, nu ca excepție rară.
- **Rate limit fix, 1 cerere/secundă**, indiferent de câte hoteluri/camere
  ai pe un singur cont — motivul pentru care recomandarea e un cont
  Shelly Cloud per hotel, nu unul global (secțiunea 11); altfel limita
  se împarte între toate hotelurile deodată.
- **API v2 e „beta"** — documentația explicită folosește termenul
  „v2.0-beta", ceea ce înseamnă că forma exactă a răspunsurilor se poate
  schimba. Codul din secțiunea 15 izolează apelurile într-un provider
  dedicat, tocmai ca o schimbare de API să însemne o modificare
  localizată, nu o rescriere.
- **Timeout/retry nedocumentate oficial** — valorile din secțiunea 7
  (5-8s, fără retry pe comenzi) sunt o recomandare practică, nu o cifră
  din documentația Shelly.

---

## 18. Recomandarea finală

**Cloud Control API (v2, cu fallback v1 doar dacă testul empiric arată
că Shelly 2.5 chiar are nevoie de el), cu Varianta A ca arhitectură, un
cont Shelly Cloud per hotel, și status prin cache + job periodic în
loturi.**

Motivul, pe scurt: satisface exact cerința de bază ("apăs ON/OFF, releul
răspunde") cu cea mai mică suprafață nouă de infrastructură — niciun
broker, niciun VPN, niciun gateway local, nicio aprobare de business în
avans (spre deosebire de Integrator API). Modelul de date și API-ul PMS
sunt suficient de generice ca să nu limiteze extinderea la Shelly Plus/
Pro, la mai multe canale per cameră, sau chiar la alți furnizori — fără
să adauge nimic din complexitatea aia ÎNAINTE să fie nevoie de ea. E
exact tiparul deja validat în acest PMS pentru TTLock, aplicat la un al
doilea furnizor.

---

## Surse

- [Cloud Control API — Getting Started](https://shelly-api-docs.shelly.cloud/cloud-control-api/)
- [Communication v2.0-beta](https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/)
- [Communication (deprecated, v1)](https://shelly-api-docs.shelly.cloud/cloud-control-api/communication/)
- [Real Time Events (WebSocket)](https://shelly-api-docs.shelly.cloud/cloud-control-api/real-time-events/)
- [Shelly Cloud API — ce este](https://support.shelly.cloud/en/support/solutions/articles/103000222504-what-is-shelly-cloud-api-)
- [Cloud Control API vs. Integrator API vs. Fleet Manager](https://kb.shelly.cloud/knowledge-base/kbuca-understanding-the-differences-between-shelly)
- [Aplicare pentru Integrator API](https://support.shelly.cloud/en/support/solutions/articles/103000295194-appy-for-integrator-api)
- [Shelly Family Overview — Gen1 (inclusiv Shelly 2.5)](https://shelly-api-docs.shelly.cloud/gen1/)
- [Gen1 Compatibility (Gen2+, doar API local)](https://shelly-api-docs.shelly.cloud/gen2/General/gen1Compatibility/)
