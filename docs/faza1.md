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
   40.000 de oaspeți, fiecare tastă costă o scanare completă.
4. Paginarea prin `offset` e acceptabilă pentru ≤ 5 pagini; se folosește
   totuși **keyset** (`id > ultimul`) — costă la fel de puțin de scris și nu
   degradează.

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

Citirea se face **paginat** (`citesteTot`: `order by id`, `id > ultimul`,
1.000 de rânduri pe pagină), deci plafonul PostgREST de 1.000 nu mai poate
tăia nimic în tăcere, indiferent cât crește fereastra.

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

`core.guests` devine **cache-ul oaspeților cunoscuți** (cei din fereastră +
cei găsiți prin căutare sau creați în sesiune), nu lista completă.

- Căutarea din formularul de rezervare și din Clienți: server-side
  (`ilike` pe nume + telefon, index `pg_trgm`, primele 20), cu debounce.
  Rezultatele intră în cache la selecție.
- Lista de clienți: paginată pe server (30/pagină, keyset), cu sumarul
  (sejururi, nopți, încasat) din vederea `oaspeti_statistici` pentru id-urile
  paginii — nu din `reservations.filter` în browser.
- Istoricul unui oaspete: `istoricOaspete(id)`, paginat pe server.
- Scrierea: `salveazaOaspete(oaspete)` — un rând, upsert; `updateCore` nu mai
  sincronizează `guests` prin diff.

### 2.5 Rapoartele în SQL

`raport_luna(p_an, p_luna)` întoarce exact structura pe care o produce
`statisticiLuna` + `statisticiProtocol` (`src/lib/rapoarte.js`, extrase din
ecran fără schimbare de comportament și testate). Funcția JS rămâne
**referința**: paritatea SQL ↔ JS se verifică pe datele reale înainte ca
ecranul să treacă pe RPC. Zilele se taie în `Europe/Bucharest`, ca în SQL-ul
existent.

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
| Oaspeți la cerere (cache, căutare, listă, istoric) | — |
| `raport_luna` în SQL + paritate | — |
| Migrațiile în repo (B2) | — |
| Test cap-coadă pe un proiect cu 100.000 de rânduri | — (cere un al doilea proiect Supabase, creat de proprietar) |
