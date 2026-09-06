# Guest app — link per cazare

Document de arhitectură și plan de implementare pentru o pagină proprie
fiecărei rezervări, deschisă de oaspete dintr-un link, activă **doar pe
perioada sejurului**, de unde poate:

1. **deschide ușa** camerei de la distanță;
2. **vedea codul de acces** și valabilitatea lui;
3. **vedea detaliile rezervării**;
4. **vedea meniul de minibar**.

Scris pe baza codului existent la 3 septembrie 2026 — fiecare afirmație
despre ce există deja e însoțită de fișierul și linia unde se vede. Ce
lipsește e marcat explicit ca lipsă, nu presupus rezolvat.

---

## 0. Decizii luate (6 septembrie 2026)

Documentul lăsa deschise trei întrebări. Două au primit răspuns.

**Minibarul: doar meniu.** Se afișează lista cu prețuri, atât. Consumul îl
trece recepția, ca acum. Varianta cu auto-declarare din secțiunea 5.2 nu se
face — nicio scriere pe facturare dintr-un link public.

**Adresa: `https://guest.lalivada.ro/#Ajh6k`.** A trecut prin trei forme
într-o zi — întâi subdomeniu, apoi `lalivada.ro/guest/Ajh6k` cu redirectare
de pe hostingul obișnuit, în final direct pe subdomeniu, fără redirectare.
Ultima variantă scoate din schemă tot ce ținea de repo-ul site-ului. Vezi 3.1,
inclusiv de ce codul stă în fragment și nu în cale.

**Pasul 0 e făcut: toate cele 16 butoane de deschidere merg** (verificat de
Ovidiu, 6 septembrie 2026). Nu există camere fără gateway, deci a treia
întrebare deschisă a rămas fără obiect: deschiderea la distanță intră în
prima versiune, pentru toate camerele, fără coloana `rooms.remote_unlock` și
fără ecrane diferite de la o cameră la alta. Secțiunea 6 rămâne pentru
istoric.

Corecție la textul de mai jos, verificată în cod pe 6 septembrie:
**`unlock` nu mai e rezervat adminilor.** Toate rolurile pot deschide o ușă;
doar într-o cameră **cazată** a rămas restricția de admin
([access-provider/index.ts:177](../supabase/functions/access-provider/index.ts)).
Cum guest app-ul deschide exact o cameră cazată, el e o excepție asumată de
la regula aceea — încă un motiv pentru funcția edge separată din secțiunea 7,
nu pentru o ramură nouă în funcția existentă.

---

## 1. Rezumat

- **Nu e o aplicație nouă.** E un al treilea build Vite în același repo,
  alături de PMS și de motorul de rezervări, pe modelul deja folosit —
  `vite.booking.config.js`, `dist-booking/`, deploy separat pe Vercel.
- **Autentificarea e linkul însuși.** Fără cont, fără parolă: oaspetele
  primește adresa prin același email/WhatsApp prin care primește azi codul.
  Documentul propunea inițial un token de 128 de biți, pe tiparul lui
  `public_bookings.public_token` ([schema.sql:1373](../schema.sql)); s-a
  hotărât un cod de cinci caractere, de dragul unui link scurt. Schimbarea
  nu e cosmetică — mută securitatea din lungimea codului în limitarea de
  rată. Socoteala e făcută pe față în 4.1.
- **Fereastra de valabilitate a linkului nu se ține în JavaScript**, ci
  în funcția de pe server, care refuză tokenul în afara sejurului. Un
  link expirat nu întoarce date pe care interfața să le ascundă — nu le
  întoarce deloc.
- **Deschiderea ușii există deja** în adaptorul TTLock
  (`deschideUsa`, [ttlock.ts:300](../supabase/functions/access-provider/providers/ttlock.ts))
  și e expusă ca acțiune `unlock` în funcția edge — dar azi e rezervată
  **exclusiv adminilor** ([access-provider/index.ts:166](../supabase/functions/access-provider/index.ts)).
  Partea nouă nu e integrarea cu yala, ci **o a doua poartă de intrare**
  în ea, care autorizează pe token de rezervare în loc de JWT de personal.
- **Minibarul nu există în cod** — nicio referință în `schema.sql` sau în
  `src/`. Dar infrastructura de facturare există complet: `products`,
  `folios`, `folio_items` ([schema.sql:502-570](../schema.sql)). Meniul
  de minibar e o **categorie de produse**, nu un tabel nou.
- **Riscul cel mai mare nu e software.** Deschiderea la distanță prin
  TTLock trece prin gateway; fără gateway în raza fiecărei yale, butonul
  din guest app nu are ce apăsa. Vezi secțiunea 6 — se verifică **înainte**
  de a scrie cod.

---

## 2. Ce există deja și se refolosește

| Nevoie | Ce există | Unde |
|---|---|---|
| Deschidere ușă la distanță | `deschideUsa(lockId)` prin `/v3/lock/unlock` | [ttlock.ts:300](../supabase/functions/access-provider/providers/ttlock.ts) |
| Codul de acces + valabilitate | tabelul `access_codes`, un singur cod activ per rezervare (index unic) | [schema.sql:2546](../schema.sql) |
| Calculul ferestrei de valabilitate | `inceputCod` / `expirareCod`, cu fus orar real | [src/lib/acces.js](../src/lib/acces.js) |
| Detaliile rezervării | `reservations` + `guests` + `rooms` | [schema.sql:127](../schema.sql) |
| Produse, preț, TVA | `products`, `vat_rates` | [schema.sql:502](../schema.sql) |
| Consum pus pe notă | `folios` (1:1 cu rezervarea) + `folio_items` | [schema.sql:541](../schema.sql) |
| Acces anonim pe token | `public_token` + RPC `security definer` + `grant … to anon` | [schema.sql:1867](../schema.sql), [schema.sql:2318](../schema.sql) |
| Jurnal de operațiuni pe yale | `access_audit`, interogabil după rezervare și yală | [schema.sql:2604](../schema.sql) |
| Limitare de rată | `booking_attempts` + verificare în RPC | [schema.sql:1192](../schema.sql) |
| Build public separat | `vite.booking.config.js`, `public-booking/` | [vite.booking.config.js](../vite.booking.config.js) |

Concluzia care contează pentru estimare: **din cele patru funcții cerute,
trei sunt în cea mai mare parte citiri din tabele care există deja.**
Munca reală e în poarta de autorizare pe token și în deschiderea ușii.

---

## 3. Ce lipsește

1. **Codul de sejur.** `reservations` n-are coloană de cod public.
   `public_bookings.public_token` există, dar e per *cerere de rezervare*
   (poate acoperi mai multe camere) și e valabil pentru totdeauna — e
   linkul de confirmare/anulare, alt scop.
2. **O poartă de acces anonim la deschiderea ușii.** Azi `unlock` cere
   JWT de personal cu rol `admin`.
3. **Minibarul.** Nicio urmă în cod. Mai mult decât atât, verificat în baza
   reală pe 6 septembrie: `products` are **două rânduri în total** — „Cazare"
   și unul numit chiar „Minibar", fără produse sub el. Structura se poate
   scrie oricând; meniul are nevoie de conținut introdus de om, altfel
   pagina afișează o listă goală.
4. **Buildul propriu-zis** al guest app-ului.

---

## 3.1 Unde stă guest app-ul și ce formă are linkul

Unde stă fiecare lucru, fiindcă nu toate stau în același loc — și de aici a
venit toată discuția despre forma linkului:

| Adresă | Unde | Cum ajunge acolo |
|---|---|---|
| `pms.lalivada.ro` | Vercel | push pe `main` |
| `rezervari.lalivada.ro` | Vercel | push pe `main` |
| `guest.lalivada.ro` | Vercel | push pe `main` |
| `lalivada.ro` | hosting obișnuit, `cloud608.c-f.ro` | FTPS, `node scripts/publica.mjs --live` din `lalivada-site` |

**Linkul e direct pe subdomeniu, fără redirectare** (hotărât 6 septembrie
2026, după ce subdomeniul a fost pus în funcțiune):

```
https://guest.lalivada.ro/#Ajh6k
```

Varianta dinainte trecea prin `lalivada.ro/guest/Ajh6k`, redirectat cu 302 de
pe hostingul obișnuit — `lalivada.ro` e un export static Next
(`output: "export"`), fără server care să rescrie sau să facă proxy, deci o
rescriere transparentă n-ar fi fost posibilă oricum. Renunțarea la redirectare
scoate din schemă tot ce ținea de celălalt repo: regula `.htaccess`,
dependența de `mod_rewrite`, `Disallow: /guest/` în `app/robots.ts` și pasul
manual de publicare prin FTPS. Rămâne o singură aplicație, publicată la push.

### De ce fragment, și nu `guest.lalivada.ro/Ajh6k`

O cale ar arăta mai bine, dar costă mai mult decât pare. Verificat pe
6 septembrie: `guest.lalivada.ro/Ajh6k` întoarce **404** — fișierul nu există,
iar o aplicație de o singură pagină are nevoie de o rescriere către
`index.html` ca să-l servească. Rescrierea aceea se scrie în `vercel.json`,
care se citește din **rădăcina repo-ului** — adică ar fi fost citit și de
proiectul PMS, și de cel de rezervări, transformându-le 404-urile în pagini
de aplicație. Trei aplicații ar fi ajuns să împartă o regulă de rutare de care
doar una are nevoie.

Fragmentul evită tot asta și mai aduce ceva: **nu se trimite niciodată
serverului**, deci codul nu apare în logurile de acces ale Vercel. O cale ar fi
ajuns acolo la fiecare deschidere de pagină.

Ce rămâne adevărat în ambele variante: linkul e mort în afara sejurului (4.2),
deci un cod scurs e, peste câteva zile, un șir fără nicio putere.

### De ce subdomeniu propriu, nu `pms.lalivada.ro/guest/`

Ar fi fost mai simplu să iasă din același build cu PMS-ul, dar ar fi însemnat
**aceeași origine** cu aplicația de recepție. PMS-ul ține sesiunea Supabase a
angajatului în `localStorage`, iar `localStorage` e per origine: o pagină de
oaspete servită de acolo ar sta, tehnic, lângă sesiunile personalului. Nu e o
breșă în sine, dar șterge o graniță pe care nu avem niciun motiv s-o ștergem —
guest app-ul e singura pagină din tot ansamblul pe care o deschid străini.

Proiect Vercel separat înseamnă și origine separată, și e oricum tiparul deja
folosit: `rezervari.lalivada.ro` e tot un al doilea proiect Vercel din același
repo.

### Ce presupune concret

Totul în acest repo, nimic în `lalivada-site`:

- `vite.guest.config.js` + `guest/` + `src/guest/` + `public-guest/`, pe
  tiparul booking-ului;
- `public-guest/robots.txt` cu `Disallow: /`, plus `noindex` în pagină;
- proiect Vercel pe `dist-guest/`, subdomeniu `guest.lalivada.ro`.

Făcut pe 6 septembrie 2026: proiectul `la-livada-guest` și CNAME-ul către
`0239bd290b77e1f2.vercel-dns-017.com`. De atunci se livrează la push, ca
PMS-ul.

---

## 4. Modelul de securitate

Partea cea mai delicată: un link care deschide o ușă.

### 4.1 Codul de cinci caractere

Coloană nouă pe `reservations`, cu un cod scurt aleatoriu din cele 62 de
litere și cifre — forma cerută, `guest.lalivada.ro/#Ajh6k`:

```sql
alter table reservations add column guest_code text unique;
create unique index reservations_guest_code on reservations (guest_code);
```

**Cod per rezervare, nu per oaspete.** Un oaspete care revine peste o lună
primește alt link. Asta e intenționat: linkul e legat de sejur, nu de
persoană, deci nu poate „rămâne bun" după plecare.

#### Cât de tare e, de fapt

Documentul propunea inițial 128 de biți, care nu se enumeră niciodată. Cinci
caractere sunt cu totul altceva și merită socotit pe față, fiindcă în capătul
linkului e o ușă:

| | |
|---|---|
| Spațiul total, 62^5 | 916.132.832 de coduri |
| Coduri valabile în orice clipă | cel mult 16 — atâtea camere sunt, iar linkul merge doar cât ține sejurul (4.2) |
| Șansa unei singure ghiciri | ~1 la 57 de milioane |
| Ghiciri pentru 50% șanse de reușită | ~40 de milioane |

Cifra a doua e cea care salvează schema. Atacatorul nu caută „un cod valid
dintr-un milion emise vreodată", ci unul din cel mult **șaisprezece**, într-un
spațiu de aproape un miliard.

#### Consecința: limitarea de rată nu mai e podoabă, e lacătul

Cu 128 de biți, limitarea de rată era o măsură de bun-simț. Cu cinci
caractere, **ea este securitatea**. Fără ea, cele 40 de milioane de încercări
se fac într-o zi de pe o singură mașină.

Plafonul se pune pe **căutări eșuate**, global, nu doar pe IP — un atac vine
de pe mii de adrese, deci un plafon pe IP se ocolește prin împrăștiere. Un cod
inexistent e aproape numai semnal de atac: oaspeții deschid linkuri care
există, nu le tastează din memorie.

La un plafon global de 200 de căutări eșuate pe oră, cele 40 de milioane de
ghiciri cer aproape **22 de ani**. Asta e ce face cele cinci caractere
acceptabile — nu lungimea lor.

Deci, ca cerință fermă, nu ca recomandare: **guest app-ul nu se livrează fără
plafonul global de căutări eșuate.** Dacă la implementare se dovedește că
plafonul nu se poate face cum trebuie, se mărește codul la opt caractere
(62^8 = 218.000 de miliarde, adică de 238.000 de ori mai mult) — aceeași formă
de link, `guest.lalivada.ro/#Ajh6k2Qw`, doar puțin mai lung.

#### Generarea

Cod aleatoriu, niciodată derivat din id-ul rezervării sau din dată — un cod
ghicibil din context anulează tot calculul de mai sus. Coliziunile sunt rare,
dar nu imposibile la un spațiu de un miliard, deci generarea se reia la
încălcarea indexului unic, nu se presupune că nu se întâmplă.

Alfabetul rămâne toate cele 62 de caractere, cu litere mari și mici, fiindcă
linkul se apasă, nu se dictează. Dacă vreodată trebuie citit la telefon, se
scot caracterele care se confundă (`0`/`O`, `l`/`I`/`1`) — cu prețul a
jumătate din spațiu, deci atunci codul trebuie să crească.

### 4.2 Fereastra de valabilitate

Regula cerută — „doar pe perioada de cazare" — se impune **în funcția de
pe server**, o singură dată, într-un helper folosit de toate funcțiile
guest app-ului:

```sql
create or replace function rezervare_din_cod(p_cod text)
returns reservations language plpgsql stable security definer
set search_path = public as $$
declare v_r reservations;
begin
  select * into v_r from reservations where guest_code = p_cod;
  if not found then
    raise exception 'Link invalid.' using errcode = 'P0002';
  end if;

  -- Fereastra: de la începutul valabilității codului până la expirarea
  -- lui. Reia exact regula de la coduri (src/lib/acces.js) — dacă linkul
  -- ar muri la ora de plecare, iar codul ar mai merge 30 de minute de
  -- grație, oaspetele ar rămâne cu ușa deschisă și fără pagină.
  if v_r.status <> 'checkedin' then
    raise exception 'Linkul e activ doar pe durata sejurului.'
      using errcode = 'P0003';
  end if;

  return v_r;
end; $$;
```

**De ce `status = 'checkedin'` și nu o comparație de date.** Check-in-ul
se poate face cu până la 14 zile înainte de sosire
(`ZILE_CHECKIN_DEVREME`, [src/lib/tranzitii.js](../src/lib/tranzitii.js)),
iar codul de acces are deja o regulă gândită exact pentru asta: la un
check-in devreme, valabilitatea începe abia în ziua sosirii, nu imediat
([src/lib/acces.js](../src/lib/acces.js), comentariul de la `inceputCod`).
Legând linkul de status, guest app-ul moștenește gratuit acea decizie și
nu inventează a doua definiție a lui „e cazat acum". La capătul celălalt,
check-out-ul trece rezervarea pe `checkedout` și linkul moare în aceeași
clipă în care moare și codul.

Consecință de reținut: **dacă recepția uită să facă check-in, linkul nu
merge.** Asta e o trăsătură, nu un bug — aceeași uitare lasă și codul
negenerat. Blocajul de night audit adăugat recent împinge oricum spre
închiderea corectă a zilei.

### 4.3 Ce NU are voie să întoarcă linkul

Guest app-ul citește printr-o funcție care întoarce un `jsonb` construit
explicit, ca `public_booking_by_token` — niciodată `select *`. Nu ies din
server:

- datele altor rezervări sau ale altor camere;
- `lock_id`-ul yalei (oaspetele apasă un buton, nu trimite un id);
- prețuri interne, `booked_price`, note de recepție (`notes`);
- datele personale ale titularului de grup, dacă ocupantul e altcineva.

### 4.4 Limitarea de rată

Deschiderea ușii e o acțiune cu efect fizic. Trei plafoane, pe modelul
`booking_attempts`:

- **global, pe căutări eșuate** — cel mult 200 pe oră, din orice sursă.
  Ăsta e cel care ține codul de cinci caractere în picioare (4.1); fără el,
  restul sunt decor. Depășirea nu e un incident de rutină: înseamnă că cineva
  caută coduri, deci merită și o notificare, nu doar un refuz.
- **pe cod** — cel mult 10 deschideri pe oră. Un oaspete care apasă de zece
  ori într-o oră are altă problemă, pe care o rezolvă recepția.
- **pe IP** — cel mult 30 pe oră, ca un cod scurs să nu poată fi transformat
  într-o unealtă de deschis ușa la nesfârșit.

### 4.5 Audit

Fiecare deschidere din guest app scrie în `access_audit` cu un actor
distinct — `oaspete (rezervarea r-…)`, nu numele unui angajat. Tabelul
există tocmai ca să răspundă la „cine a deschis ușa aia"
([schema.sql:2604](../schema.sql)); dacă deschiderile de oaspete n-ar
ajunge acolo, întrebarea ar rămâne fără răspuns exact în cazurile care
contează.

### 4.6 Indexabilitate

Un link de cazare ajuns în index e un link public către o ușă, deci pagina
se ține în afara motoarelor de căutare, ca PMS-ul.

Stând pe subdomeniu propriu (3.1), are și robots.txt propriu:
`public-guest/robots.txt` cu `Disallow: /`, pe modelul folderului public
separat de la booking ([vite.booking.config.js](../vite.booking.config.js)).
`<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` stă
și în pagină, ca plasă pentru crawlerele care ignoră fișierul.

Pagina n-are nici `og:*`, dinadins: un link trimis pe WhatsApp n-are ce
previzualizare să genereze, deci nu poate arăta cine stă în cameră înainte ca
cineva să-l deschidă. Plus `referrer: no-referrer`, ca fragmentul cu codul să
nu plece mai departe la vreun click.

Verificat pe producție, 6 septembrie: `robots.txt` întoarce `Disallow: /`.

---

## 5. Minibarul

### 5.1 Modelul de date

Fără tabel nou. `products` are deja `category`, `unit`, `vat_rate_id`,
`default_price`, `active`, `sort_order` — tot ce cere un meniu. Minibarul
devine `category = 'minibar'`.

Singurul lucru care lipsește e o coloană pentru afișare publică:

```sql
alter table products
  add column public_description text,
  add column public_visible boolean not null default false;
```

`public_visible` există pentru că nu tot ce e în `products` are ce căuta
sub ochii oaspetelui — grila conține și poziții de uz intern.

### 5.2 Ce face oaspetele cu meniul

Cerința spune „de a vedea meniul de mini bar". Aici se ramifică:

- **Doar afișare (recomandat pentru prima versiune).** Lista, cu preț cu
  TVA inclus. Consumul îl trece recepția, ca acum. Zero risc de a genera
  poziții de facturare dintr-un link public.
- **Auto-declarare.** Oaspetele bifează ce a consumat, iar poziția intră
  în `folio_items` pe folio-ul rezervării. Tentant, dar deschide o
  suprafață de scriere pe facturare dintr-un token public, deci cere
  discuție separată: ce se întâmplă la o declarare greșită, cine o
  anulează, ce se vede pe factură.

Documentul propunea **prima variantă**, iar pe 6 septembrie asta s-a și
hotărât (secțiunea 0): minibarul e doar meniu. A doua variantă nu se face —
nici ca pas ulterior tăcut. Dacă se răzgândește cineva, se redeschide
discuția, cu întrebările de mai sus puse din nou.

---

## 6. Riscul hardware — de verificat înainte de orice cod

`deschideUsa` cheamă `/v3/lock/unlock`, iar comentariul din adaptor spune
limpede: **„prin gateway"**
([ttlock.ts:296](../supabase/functions/access-provider/providers/ttlock.ts)).
O yală TTLock fără gateway în rază nu poate fi deschisă de la distanță —
comunică doar prin Bluetooth, cu telefonul lângă ușă.

Cele 16 yale sunt deja asociate camerelor și funcționale pentru **coduri**
— dar codurile se pot scrie și prin gateway, și prin alte căi, deci
funcționarea codurilor **nu dovedește** că deschiderea la distanță merge.

**Primul pas al implementării, înainte de orice linie de cod:** din PMS,
cu un cont de admin, se apasă deschiderea la distanță pe fiecare din cele
16 camere și se notează care răspund. Funcția există deja în interfață.

Dacă o parte din camere n-au acoperire de gateway, sunt trei ieșiri
oneste, în ordinea preferinței:

1. **Se adaugă gateway-uri** până la acoperire completă. Un G2 acoperă mai
   multe yale dacă sunt în rază.
2. **Butonul se ascunde pe camerele fără gateway**, iar guest app-ul
   arată doar codul. Cere o coloană `rooms.remote_unlock` și o poziție
   asumată: doi oaspeți în camere diferite văd ecrane diferite.
3. **Se renunță la deschiderea de la distanță** în prima versiune, iar
   guest app-ul livrează celelalte trei funcții. Codul rămâne calea de
   intrare.

Nu se scrie interfața pentru un buton despre care nu știm dacă are ce
apăsa.

---

## 7. Arhitectura

```
Browser (guest app)
   │  fetch cu guest_code în corp, niciodată în query string
   ▼
Supabase RPC (security definer)          ← citiri: rezervare, cod, minibar
   │
   └─ Edge Function guest-unlock         ← singura care atinge yala
         │  service_role, secretele TTLOCK_* rămân pe server
         ▼
      access-provider / providers/ttlock.ts  →  TTLock Cloud  →  Gateway  →  Yală
```

**De ce funcție edge separată pentru deschidere, nu o acțiune nouă în
`access-provider`.** Funcția existentă pornește cu o gardă care cere JWT
de personal și rol din `staff`
([access-provider/index.ts:150](../supabase/functions/access-provider/index.ts)).
A o face să accepte și tokenuri de oaspete înseamnă două modele de
autorizare într-un singur fișier de 586 de linii, unde o greșeală
viitoare de ramificare dă unui oaspete acțiunile de admin — inclusiv
`passage-mode-set`, care lasă ușa descuiată la nesfârșit. O funcție
separată nu poate face decât un singur lucru: deschide ușa rezervării al
cărei token l-a primit. Logica de TTLock rămâne partajată, prin import
din același adaptor.

**De ce codul nu circulă prin query string la apeluri.** În adresa paginii
apare oricum, o dată, fiindcă asta s-a cerut (3.1). Ce se poate evita e să
mai apară și în logurile fiecărei cereri de API, la fiecare deschidere de
pagină și la fiecare apăsare de buton. La citiri intră ca parametru de RPC,
în corpul POST; în URL rămâne doar la deschiderea paginii.

---

## 8. Planul de implementare

### Pasul 0 — verificarea gateway-ului (fără cod)

Test manual pe cele 16 camere, din PMS. Rezultatul decide dacă pasul 4
se face, se restrânge sau se amână. Nu se trece mai departe fără el.

### Pasul 1 — codul și poarta de acces ✅ făcut (6 septembrie 2026)

- migrație: `reservations.guest_code`, cu index unic și backfill pentru
  rândurile existente;
- generator de cod aleatoriu din 62 de caractere, cu reluare la coliziune
  (4.1);
- funcția `rezervare_din_cod` (4.2);
- plafonul global de căutări eșuate (4.4) — **în același pas, nu mai
  târziu.** Cu cinci caractere el nu e o îmbunătățire ulterioară, e lacătul
  însuși; o poartă livrată fără el e o poartă deschisă;
- teste în `src/guest-cod.test.js`, pe modelul `src/acces.test.js`: cod
  inexistent → refuz; rezervare `confirmed` → refuz; `checkedin` → acceptă;
  `checkedout` → refuz; `cancelled` → refuz.

Nimic vizibil pentru utilizator încă. Se poate livra separat.

### Pasul 2 — citirile ✅ făcut (6 septembrie 2026)

- `guest_stay_by_cod(p_cod)` → camera, datele, numărul de nopți, numele
  afișat, ocuparea;
- `guest_access_code_by_cod(p_cod)` → codul de acces activ și valabilitatea
  lui. Lipsa unui cod activ **nu** e eroare: codul se generează la check-in
  și poate întârzia, iar pagina trebuie să poată spune „încă nu e gata" în
  loc de „link stricat";
- `guest_minibar()` → produsele cu `category = 'minibar'` și
  `public_visible = true`. Fără cod: e o listă de băuturi cu prețuri, care
  nu spune nimic despre niciun oaspete. Prețurile sunt cu TVA inclus, ca
  peste tot în aplicație (`calcAmounts`), deci nu se mai calculează nimic;
- `products` a primit `public_description` și `public_visible`, implicit
  fals — un produs nou nu apare pe ecranul nimănui până nu se cere anume;
- revocare de la `public` **înaintea** grantului către `anon`: fără ea,
  grantul n-ar schimba nimic, fiindcă `EXECUTE` pentru `PUBLIC` e deja
  acolo, implicit.

Numele afișat urmează regula din 4.3: ocupantul camerei dacă e trecut,
altfel eticheta grupului, iar numele plătitorului **doar** când nu există
nici ocupant, nici grup — adică atunci când plătitorul chiar e ocupantul.
Într-un grup, titularul e o persoană străină de camera aceea.

**Meniul e gol până i se dă conținut.** Verificat pe 6 septembrie:
`guest_minibar()` întoarce `[]`, fiindcă niciun produs nu are
`public_visible = true` — `products` are două rânduri, „Cazare" și unul
numit chiar „Minibar", fără băuturi sub el. Structura e gata; grila se
introduce din PMS.

### Pasul 3 — guest app-ul ✅ făcut (6 septembrie 2026)

Făcut pe 6 septembrie 2026, cu trei abateri de la planul de mai sus, fiecare
cu motivul ei:

- `vite.guest.config.js` + `guest/` + `src/guest/` + `public-guest/`, pe
  tiparul booking-ului. Ieșirea e `dist-guest/`, servit de Vercel — **nu**
  în repo-ul site-ului, cum spunea varianta de dimineață;
- stiluri proprii, cu aceleași jetoane ca `brand.css`, nu `brand.css`
  însuși: pagina se deschide pe date mobile, în fața ușii, iar foaia
  întreagă a site-ului (antet, subsol, galerie) ar fi fost cărată degeaba
  pentru trei carduri. Se vede că e aceeași casă fără să coste atât;
- **trei secțiuni, nu patru.** Ușa lipsește cu totul: funcția edge
  `guest-unlock` vine la pasul 4, iar un buton care nu deschide nimic e mai
  rău decât niciunul, mai ales în fața ușii. Documentul prevedea oricum
  ordinea asta (secțiunea 9);
- cinci stări de refuz, fiecare cu ce are omul de făcut mai departe: sejur
  neînceput, sejur încheiat, rezervare anulată, link nefuncțional, link fără
  cod. Un singur „link invalid" pentru toate ar fi trimis la recepție și
  oaspeții care n-au nicio problemă — doar au deschis linkul cu o zi mai
  devreme;
- codul citit din fragment, cu calea drept rezervă pentru cine scrie adresa
  de mână;
- secțiunea de minibar lipsește de pe ecran cât timp meniul e gol, în loc să
  arate un titlu urmat de nimic.

În repo-ul site-ului nu mai e nimic de făcut: linkul e direct pe subdomeniu,
fără redirectare (3.1). Indexarea e oprită din `public-guest/robots.txt` și
din `noindex` în pagină, amândouă pe subdomeniu.

Livrat pe `guest.lalivada.ro` în aceeași zi. Verificat pe producție cu un cod
real: pagina arată sejurul și codul de acces, `robots.txt` întoarce
`Disallow: /`, iar consola e curată.

### Pasul 4 — deschiderea ușii

- funcția edge `guest-unlock`, deployată `--no-verify-jwt` (ca
  `ical-feed`), fiindcă cererea nu poartă JWT;
- limitare de rată (4.4);
- scriere în `access_audit` cu actor de tip oaspete (4.5);
- în interfață: confirmare înainte de apăsare și stare de așteptare —
  deschiderea prin gateway nu e instantanee, iar un buton care pare mort
  se apasă de cinci ori.

### Pasul 5 — livrarea linkului către oaspete

Se adaugă `{{guest_link}}` în șablonul mesajului de acces, lângă
`{{access_code}}` care există deja
([access-provider/index.ts:96](../supabase/functions/access-provider/index.ts)).
Randarea rămâne pe server, unde e și acum.

### Pasul 6 (ulterior, cu decizie separată)

Auto-declararea consumului de minibar (5.2).

---

## 9. Ordinea livrărilor

Pașii 1 și 2 nu schimbă nimic vizibil și pot fi livrate oricând. Pasul 3
livrează trei din cele patru funcții cerute și e util și singur — un
oaspete care își vede codul, sejurul și minibarul are deja pagina utilă.
Pasul 4 se adaugă peste, când pasul 0 confirmă că are ce deschide.

Asta înseamnă că, dacă gateway-urile se dovedesc a fi problema, proiectul
nu stă blocat: se livrează restul și se așteaptă hardware-ul.
