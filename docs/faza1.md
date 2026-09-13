# Faza 1 — încărcare pe fereastră de timp

Continuarea planului din `docs/audit-2026-09.md` (§4, Faza 1). Aici stau
**măsurătorile** care au dimensionat fereastra, **designul** ales și
**starea** implementării. Toate cifrele sunt din 13 septembrie 2026, pe
scripturile din `scripts/bench/` — reproductibile.

---

## 1. Măsurători cu 100.000 de rezervări

Două seturi sintetice, deterministe: unul în Node (`scripts/bench/sintetic.mjs`,
16 camere reale, sejururi consecutive de 1–3 nopți, ~20 % anulate/no-show,
40.000 de oaspeți) și unul în Postgres (`scripts/bench/baza.sql`, aceeași
regulă, într-o schemă `bench` a proiectului live — neexpusă prin API, fără
trigger-e și fără RLS, ștearsă după). Nu sunt realiste comercial (100.000 de
sejururi pe 16 camere înseamnă ~43 de ani la ocupare 100 %); contează
**numărul de rânduri**, nu plauzibilitatea.

### 1.1 Browser — funcțiile reale din `src/lib` și `src/data`

`node --expose-gc scripts/bench/frontend.mjs`. Cel mai bun timp din trei
rulări, pe un laptop; pe tableta recepției, de 3–5× mai mult.

| Ce | Tot (100.000) | Fereastră (11.819) | Notă |
|---|---:|---:|---|
| JSON descărcat la pornire (rezervări) | 48,5 MB | 5,7 MB | fără gzip; oaspeții (40.000) încă 10,3 MB |
| memorie heap: rândurile brute + traduse | 68,8 MB | 8,1 MB | fără React și fără DOM |
| traducere `camelRes` la încărcare | 7,4 ms | <1 ms | |
| **diff `syncTable` la o salvare** (o rezervare schimbată) | **199 ms** | 22 ms | `JSON.stringify` pe fiecare rând, la fiecare salvare |
| night audit (tick la 60 s) | 9,7 ms | 6,7 ms | |
| calendar: bucket pe cameră | 29 ms | 4,1 ms | |
| rapoarte: `statisticiLuna` + protocol | 84 ms | 10 ms | |
| preț la creare: `occupancyForStay` pe 3 nopți | 132 ms | 18 ms | o dată la fiecare previzualizare de preț |
| **backfill `bookedPrice`: 200 rânduri „site” fără snapshot** | **19,1 s** | 2,6 s | O(n × nopți) pe rând; **~95 s la 1.000 de rânduri importate** |
| clienți: sejururile a 30 de oaspeți din listă | 56 ms | 3,2 ms | se reface la fiecare tastă din căutare |
| card „De pe site" | 59 ms | 6,3 ms | |
| ecranul Azi: sosiri/plecări | 51 ms | 5,7 ms | |

Coloana „Fereastră" e supradimensionată: setul sintetic are rezervări
confirmate până în 2033, iar „deschise" înseamnă toate. Cu rezervări reale
(nimeni nu rezervă la 6 ani distanță), fereastra realistă pe 16 camere e de
**~2.800 de rânduri** (măsurat în Postgres, mai jos) — împarte coloana la ~4:
diff-ul la salvare ~5 ms, rapoartele ~2,5 ms, JSON-ul ~1,4 MB.

### 1.2 Postgres — 100.000 de rânduri, indexurile din faza 0

`bench.timp()` = cel mai bun din trei `EXPLAIN ANALYZE`, doar timpul de
execuție pe server (fără rețea, fără serializare PostgREST).

| Interogare | ms | rânduri |
|---|---:|---:|
| tot tabelul (arhitectura de azi) | 14,8 | 100.000 |
| fereastra: deschise + închise în [−30, +400] zile | 8,4 | 11.996 |
| **fereastra realistă**: deschise cu sosirea în ≤ 400 zile + închise în [−30, +400] | **6,5** | **2.781** |
| doar deschise | 3,3 | 11.281 |
| night audit: `checkedin` cu plecarea depășită | 0,0 | 0 |
| calendar: 21 de zile, toate camerele | 7,2 | 113 |
| istoric oaspete: ultimele 20 de sejururi | 0,0 | 3 |
| sumar (sejururi, nopți, încasat) pentru 30 de oaspeți | 0,3 | 25 |
| căutare oaspeți `ilike` nume/telefon, **fără** index | 131,6 | 30 |
| căutare oaspeți **cu `pg_trgm`** (GIN pe nume și telefon) | **9,0** | 30 |
| `cauta_oaspeti` (nume + oraș + telefon, 3 indexuri GIN, `order by lower`): 4.000 de potriviri / puține | 17 / 0,6 | 20 |
| `cauta_oaspeti` cu `order by last_name` (planul parcurgea indexul de ordine, filtrând): un miss | 106 | 0 |
| lista de clienți, pagina 1.000 (`offset 30.000` din 40.000) — cu / fără `guests_ordine_nume` | 12,9 / 197,7 | 30 |
| `count(*)` exact pe 40.000 de oaspeți | 9 | 1 |
| raport lună: nopți și venit pe zi (sept 2026) | 9,8 | 30 |
| card „De pe site": ultimele 5 | 0,0 | 5 |
| paginare `order by id limit 1000 offset 0` pe fereastră | 29,9 | 1.000 |
| paginare `offset 2000` | 81,6 | 1.000 |
| oaspeți distincți cu sejur în fereastră | — | 2.688 |

Planul ferestrei: `BitmapOr` pe `reservations_status` + `reservations_checkout`
(indexurile din faza 0), 451 de blocuri citite. Fără ele ar fi fost o
scanare completă — tot sub 20 ms la 100.000, dar nu la 1.000.000.

### 1.3 Concluzii

1. **Baza nu e problema**, nici la 100.000: nicio interogare peste 15 ms
   pe server. Problema e **transferul și browserul**: 48 MB de JSON și 69 MB
   de heap la fiecare deschidere, 200 ms de diff la fiecare salvare, 19 s de
   backfill pentru 200 de rânduri (un import de istoric fără `booked_price`
   ar bloca tabul minute întregi).
2. **Fereastra de ~2.800 de rânduri** aduce totul sub 10 ms și la 1,4 MB.
   Cifra e stabilă în timp — depinde de camere și de orizontul de rezervare,
   nu de câți ani de istoric s-au adunat.
3. Căutarea de oaspeți are nevoie de **`pg_trgm`** (131 → 9 ms); fără el, la
   40.000 de oaspeți, fiecare tastă costă o scanare completă. Două capcane
   găsite la implementare: sub **3 caractere** indexul nu ajută („%ab%" n-are
   nicio trigramă întreagă — 100 ms, toată tabela), iar cu `order by
   last_name` planificatorul prefera indexul de ordine și filtra rând cu
   rând (106 ms pe un miss) — de aceea funcția ordonează pe `lower()`, o
   expresie fără index, ca să fie obligată să ia întâi potrivirile.
4. Paginarea prin `offset` degradează liniar **fără** un index în ordinea
   cerută (82 ms la `offset 2.000` pe rezervări, 198 ms la `offset 30.000` pe
   oaspeți); cu `guests_ordine_nume` saltul la pagina 1.000 costă 13 ms, deci
   lista de clienți rămâne pe offset — ecranul sare la o pagină anume, ceea
   ce keyset-ul nu poate.

---

## 2. Designul

### 2.1 Ce se încarcă la pornire

```
rezervări:  (checkout ≥ azi − 30 zile AND checkin ≤ azi + 400 zile)     -- fereastra, orice status
         OR (status ∈ {pending, confirmed, protocol, checkedin} AND checkout < azi − 30 zile)
                                                                      -- „restante": ce trebuie să vadă night audit-ul
grupuri:    cele referite de rezervările încărcate
oaspeți:    cei referiți de rezervări și de grupuri (≈ 2.700 la 100.000 de rezervări)
```

Rezervările deschise cu sosirea peste 400 de zile **nu** se încarcă la
pornire — vin când calendarul ajunge acolo (2.2). Night audit-ul, sosirile
de azi, cardul „De pe site", accesul, fișele — toate lucrează pe ce e în
fereastră, și tot ce le trebuie e acolo prin construcție.

Citirea e **o singură cerere** (`pms_fereastra`, SECURITY INVOKER, un rând
JSON cu rezervările, grupurile și oaspeții lor), deci plafonul PostgREST de
1.000 de rânduri n-o atinge, indiferent cât crește fereastra — și pe 4G nu
costă trei dus-întors înlănțuite.

### 2.2 Calendarul cere ce nu are

`asiguraPerioada(de, pana)`: când `days` iese din intervalul încărcat,
PMS-ul cere rezervările din intervalul lipsă (orice status) plus grupurile și
oaspeții lor, le **adaugă** la starea locală (rândurile deja prezente rămân
cele locale) și lărgește intervalul. Săptămâna se desenează imediat cu ce
există; rândurile noi apar când sosesc.

### 2.3 Ștergerile devin explicite — condiția de siguranță

`syncTable` deducea ștergerile din diferența `before` − `after`. Cu o stare
locală **parțială** asta devine o armă: o pagină de calendar abia încărcată
care lipsește din `next`-ul construit de un ecran cu o închidere veche ar fi
fost **ștearsă din bază**. De aceea:

- `syncTable` doar inserează/actualizează; nu mai șterge nimic.
- Ștergerile sunt apeluri explicite: `stergeRezervari(ids)`,
  `stergeGrupuri(ids)`, `stergeBlocaje(ids)`, `stergeOaspete(id)` — fiecare
  scrie în bază **și** scoate rândurile din starea locală.
- Cele șase locuri care ștergeau prin `filter` (grupuri, camere, blocaje,
  clienți) trec pe apelurile explicite.

### 2.4 Oaspeții la cerere

`core.guests` e **cache-ul oaspeților cunoscuți** (cei din fereastră + cei
găsiți prin căutare sau creați în sesiune), nu lista completă. Tot ce
înseamnă „toți" vine de pe server, din `src/data/oaspeti.js`:

- Căutarea din formularul de rezervare: cache-ul răspunde la fiecare tastă;
  de la **3 caractere**, după 250 ms de pauză, `cauta_oaspeti` (nume, oraș,
  telefon pe cifre; `pg_trgm`, primele 20) — rezultatele intră în cache, de
  unde filtrul local le arată ca pe restul. Cât timp serverul n-a răspuns,
  „niciun client" nu se afirmă (ar oferi „Adaugă client nou" pentru cineva
  care există). Sub 3 caractere serverul nu e întrebat (§1.3, pct. 3).
- Lista de clienți: paginată pe server (30/pagină, `range` + index de ordine
  `guests_ordine_nume`; cu text, primele 100 de potriviri paginate local, cu
  „100+" când s-a atins plafonul), cu sumarul (sejururi, nopți, încasat) din
  vederea `oaspeti_statistici` pentru id-urile paginii — nu din
  `reservations.filter` în browser, care vede doar fereastra. Numărul de pe
  tab e `count` exact, din aceeași cerere; cel de pe ecranul Azi, o cerere
  `head` la deschidere.
- Istoricul unui oaspete: `istoricOaspete(id, pagina)`, 15/pagină, sumarul din
  aceeași vedere.
- Ștergerea verifică întâi pe server (`legaturiOaspete`: rezervări în orice
  status, grupuri cu el client principal), apoi `stergeOaspete`; baza refuză
  oricum (`guest_id` e ON DELETE RESTRICT).
- Scrierea: `salveazaOaspete(oaspete)` — un rând, upsert, apoi în cache.
  `updateCore` **ignoră** `guests` (cu avertisment în consolă): un ecran
  pornit de la o versiune veche a cache-ului ar fi rescris rânduri depășite.
- `oaspeti_statistici` are aceeași definiție ca fostul calcul din browser
  (`isLive`, `isStatsEligible`, `nightsBetween`, `reservationTotal`), cu o
  excepție asumată: un rând fără snapshot de preț contează 0, nu recalculul
  din tarifele curente — backfill-ul de la pornire îl completează oricum.
- Testat prin randare (`src/clienti-ecran.test.js`), cu stratul de date
  înlocuit: ecranul nu se poate deschide fără autentificare.

### 2.5 Rapoartele în SQL

`raport_luna(p_an, p_luna)` (SECURITY INVOKER) întoarce agregatele brute —
nopți, venit, pe zi, pe tip, pe sursă, protocol — pe care `statisticiDinSql`
(`src/lib/rapoarte.js`) le traduce în exact structura pe care o producea
`statisticiLuna` + `statisticiProtocol` (extrase din ecran fără schimbare de
comportament și testate); procentele, ADR/RevPAR, maxOcc și etichetele
surselor rămân în JS, o singură definiție. Funcția JS rămâne **referința**.
Zilele se taie în `Europe/Bucharest`, ca în SQL-ul existent.

Nu mai era doar performanță: cu fereastra din 2.1 browserul are 30 de zile
în urmă, iar „luna trecută" începe cu până la 61 — raportul ei ar fi ieșit
trunchiat. Ecranul cere luna prin RPC și ține cifrele lunii de dinainte,
estompate, cât timp răspunsul e pe drum.

Paritatea, verificată pe 13 sept 2026 cu `scripts/paritate-raport.mjs`
(JS, `TZ=Europe/Bucharest`) față de `select raport_luna(...)` rulat ca
recepționer:

- datele reale (140 de rezervări, aug–oct 2026): identice, cifră cu cifră —
  nopți, venit, pe zi, pe tip, pe sursă;
- o lună de fixture (nov 2026, într-o tranzacție anulată) cu sejur peste
  granița lunii, anulat, no-show, protocol și preț suprascris cu 0: identice
  după ce fixture-ului JS i s-au dat prețurile pe care baza le-a pus la
  inserare — trigger-ul de snapshot rescrie `booked_price` din tarife
  (300/noapte), iar funcția citește ce e în bază, exact ca ecranul de
  dinainte. O cameră inexistentă (cazul „zzz" din testul JS) nu poate exista
  în bază (FK), deci nu are echivalent SQL.

### 2.7 Migrațiile în repo (B2 din audit)

Istoricul real al bazei stătea doar în `supabase_migrations.schema_migrations`
(110 migrații aplicate); repo-ul avea doar `schema.sql`, oglinda întreținută
de mână. Din 13 sept 2026 stau și în `supabase/migrations/<version>_<name>.sql`
— convenția CLI-ului, deci `supabase db push` le poate reda pe un proiect nou
(cel pentru testul cap-coadă cu 100.000 de rânduri). Primul export s-a făcut
byte cu byte, verificat cu `md5` fișier ↔ bază; următoarele se fac cu
`scripts/export-migratii.mjs` (cere `DATABASE_URL`, doar SELECT).

### 2.6 Ce NU se schimbă în faza 1

- `syncTable` rămâne pentru rezervări (diff pe ≤ 3.000 de rânduri ≈ 5 ms) și
  pentru tabelele de configurare. Salvarea per rând (A2 din audit) nu mai e
  necesară odată cu fereastra — se amână.
- Realtime — faza 2.
- Housekeeping ca tabel — faza 2.

---

## 3. Stare

| Pas | Stare |
|---|---|
| Măsurători (§1) | făcut, 13 sept 2026 |
| `statisticiLuna` extrasă în `lib/rapoarte.js` + teste (10) | făcut |
| Ștergeri explicite, `syncTable` fără deducție | făcut, 13 sept 2026 |
| Fereastra la pornire (`pms_fereastra`, o singură cerere) | făcut, 13 sept 2026 — 202 ms / 2,5 MB pe 100.000 de rânduri (bench) |
| `asiguraPerioada` în calendar | făcut, 13 sept 2026 |
| Oaspeți la cerere (cache, căutare, listă, istoric) | făcut, 13 sept 2026 — `cauta_oaspeti`, `oaspeti_statistici`, `src/data/oaspeti.js`, test de randare |
| `raport_luna` în SQL + paritate | făcut, 13 sept 2026 — identic cu JS pe aug–oct 2026 și pe luna de fixture |
| Migrațiile în repo (B2) | făcut, 13 sept 2026 — 110 fișiere în `supabase/migrations/`, md5 verificat cu baza |
| Test cap-coadă pe un proiect cu 100.000 de rânduri | — (cere un al doilea proiect Supabase, creat de proprietar) |
