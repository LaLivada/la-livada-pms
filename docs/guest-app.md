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

### Pasul 4 — deschiderea ușii ✅ făcut (6 septembrie 2026)

Livrat împreună cu redesenarea paginii, cerută în aceeași zi.

**Poarta, în bază** — `guest_poate_deschide(p_cod, p_ip)`, peste
`guest_poarta`, plus tabelul `guest_unlock_attempts`:

- 10 deschideri pe oră per rezervare, 30 pe oră per adresă IP;
- **contorizarea se face înainte de a atinge yala.** O deschidere care
  eșuează la furnizor tot a costat o încercare; dacă s-ar număra doar
  reușitele, cine dă de un TTLock căzut ar putea apăsa la nesfârșit;
- camera fără yala asociată primește motivul separat `fara-yala`, nu un
  refuz: e configurare lipsă, nu o încercare de ocolire;
- funcția e revocată de la `public, anon, authenticated`. O cheamă doar
  funcția edge, cu cheia de serviciu.

**Funcția edge** — `supabase/functions/guest-unlock`, deployată
`--no-verify-jwt`, funcție separată de `access-provider`. Motivul stă scris
în capul fișierului: `access-provider` pornește cu o gardă care cere JWT de
personal, iar ca să accepte și coduri de oaspete ar fi trebuit să țină două
modele de autorizare în același fișier de ~600 de linii, unde o ramificație
greșită de mâine dă unui oaspete acțiunile de admin — inclusiv
`passage-mode-set`, care lasă ușa descuiată la nesfârșit. Adaptoarele TTLock
**nu** sunt copiate, ci importate din `access-provider/providers/`.

IP-ul se ia din `x-forwarded-for`, nu din corpul cererii: altfel plafonul pe
IP s-ar ocoli trimițând altă valoare la fiecare apăsare. În `access_audit`
se scrie cu `actor = "oaspete (<reservationId>)"`. Înapoi la pagină pleacă
doar `{ok:true}` — nici `lockId`, nici `roomId`.

**În interfață**, o abatere de la planul de mai sus: **fără confirmare
înainte de apăsare.** Un pas în plus între om și ușă costă exact acolo unde
pagina se folosește — în fața ușii, cu o mână ocupată — iar apăsarea nu e
distructivă: deschide o ușă la care oaspetele are oricum drept. Ce s-a
păstrat e restul: stare de așteptare („Se deschide…"), butonul blocat șase
secunde după reușită (yala are nevoie de o clipă, iar cine nu aude clicul
apasă din nou și-și consumă plafonul degeaba) și mesajul serverului afișat
ca atare, nu înlocuit cu un „ceva n-a mers" generic.

**Verificat** pe funcția deployată, pe cele patru căi de refuz — cod
inventat, sejur neînceput, sejur încheiat, cerere fără cod — toate `403` cu
motivul și mesajul corecte. Calea de succes **nu** e testată de mine și nu
va fi: poarta cere `status = 'checkedin'`, deci fiecare reușită deschide o
cameră cu oaspeți în ea. În pagină, ambele ramuri (reușită și refuz) sunt
verificate cu `fetch` interceptat în browser, fără ca vreo cerere să
plece — s-a confirmat adresa, metoda, codul în corp (nu în URL) și textul
afișat.

### Pasul 4b — designul paginii ✅ făcut (6 septembrie 2026)

Cerut pe baza unei machete de referință, cu culorile și fonturile de pe
lalivada.ro:

- **jetoanele sunt cele reale**, copiate din `booking/brand.css`: ivory
  `#f5f1e8` pe fundal, charcoal `#22221f` pentru cardul principal, champagne
  `#c8b18a` pentru butonul de ușă, Manrope pentru interfață și Instrument
  Serif pentru nume;
- **salut după ceasul telefonului** („Bună dimineața / ziua / seara"), nu
  după al serverului: oaspetele și casa sunt în același fus;
- **emblema** din macheta de referință e favicon-ul (`/brand/favicon.png`);
- **cardul închis** ține tot ce se citește în fața ușii: camera, codul mare
  și monospațiat, valabilitatea și butonul de deschidere;
- **patru butoane** — Bun venit, Important, Minibar, Atracții — care deschid
  câte un panou, unul singur o dată. Patru panouri desfăcute simultan ar
  împinge codul sub linia ecranului, adică fix lucrul după care s-a intrat
  în pagină. Două pe rând, nu patru: pe un telefon de 320px patru coloane
  lasă sub 65px de etichetă, iar „Bun venit" s-ar rupe în două rânduri;
- **culorile cardului închis sunt scrise ca valori, nu ca jetoane.** Cardul
  e închis în ambele teme — asta e decizia de design — iar `--ivory` și
  `--charcoal` se inversează în blocul pentru tema întunecată. Luat din
  jetoane, textul devenea aproape negru pe fond negru când telefonul e pe
  temă întunecată. Prins la verificare, nu la scriere.

**Conținutul redacțional stă în `src/guest/continut.js`**, separat de
interfață, ca să poată fi schimbat fără să deschizi un fișier de React.
Ce depinde de rezervare — ora de plecare, valabilitatea codului — **nu** e
acolo: vine din bază, pentru fiecare sejur în parte. Scris de mână ar fi
fost corect până la prima excepție și greșit după.

**Ce lipsește din conținut și nu inventez:** „Important" are doar punctele
care se pot deduce din datele proprietății (plecarea, valabilitatea codului,
ce faci dacă ușa nu se deschide). Fumatul, animalele de companie, ora de
liniște și accesul în zonele comune se adaugă când sunt confirmate.
Minibarul e gol cât timp niciun produs nu e marcat `public_visible` în PMS.
Butoanele rămân, dar panourile spun cinstit de ce n-au ce arăta — un panou
gol ar părea o eroare de încărcare.

### Pasul 4c — vremea, atracțiile și restul cererilor de design ✅ făcut (6 septembrie 2026)

**Butonul de ușă s-a desprins de codul de acces.** Era legat de el, iar asta
însemna că exact în cazul în care generarea codului eșuează la yală
oaspetele rămânea și fără cifre, și fără buton — cele două lucruri care
l-ar fi băgat în cameră. Acum butonul e mereu acolo; textul de deasupra
spune, când nu există cod, că se poate intra oricum de aici.

**Diezul după cod.** Se afișează `9541#`, cu diezul ceva mai stins: face
parte din ce se tastează pe yală, dar nu din secret. Lăsat pe seama
memoriei, e taxa pe care o plătește cineva care stă în fața ușii pe
întuneric.

**Emblema** umple acum tot cercul (imaginea are propriul inel auriu, deci
chenarul containerului a dispărut ca să nu dubleze conturul) și e link către
lalivada.ro.

**Vremea** (`src/guest/vreme.js`) — Open-Meteo, pentru coordonatele
complexului: gratuit, fără cheie, cu CORS deschis, deci merge dintr-o pagină
statică fără server la mijloc. Un widget gata făcut, lipit ca `<iframe>`, ar
fi adus reclame, urmărire și un al doilea design în mijlocul paginii.
Serviciul află doar că cineva a cerut vremea pentru coordonatele noastre;
codul sejurului stă în fragment și nu pleacă nicăieri. Dacă cererea eșuează,
blocul nu se afișează deloc — vremea e podoabă, nu motivul pentru care s-a
deschis pagina.

**Clipirea la deschidere** — cinci pulsuri de o jumătate de secundă pe
buton. `opacity` revine explicit la 1 în starea „deschis", altfel regula de
`:disabled` (butonul e blocat șase secunde după reușită) l-ar fi stins fix
când trebuie să se vadă. Sub `prefers-reduced-motion` rămâne același semnal,
staționar.

**Atracțiile** (`ATRACTII` în `src/guest/continut.js`), zece obiective,
paginate câte cinci, ordonate după distanță:

- **selecția** e din liste independente despre județ (Știrile ProTV,
  bunadimineata.ro, Travelminit), nu o alegere proprie;
- **distanțele sunt pe șosea**, calculate cu OSRM de la coordonatele
  complexului (46.6225, 27.7552 — punctul numit „La Livadă" în
  OpenStreetMap), nu în linie dreaptă. Diferența e mare și e exact cea care
  contează pentru cineva care conduce;
- **pozele** stau local în `public-guest/atractii/` (720×450), nu legate
  direct de la sursă: pagina nu trimite IP-ul oaspetelui la un server străin
  doar pentru o poză, iar o imagine ștearsă mâine nu lasă un pătrat gol aici;
- **șase sunt de pe Wikimedia Commons**, cu licență liberă. Autorul și
  licența se afișează, fiindcă asta cer CC BY și CC BY-SA — nu e politețe, e
  condiția de folosire;
- **patru vin de la pensiune** (muzeul județean Vaslui, grădina zoologică
  Bârlad, Dino Parc, statuia de la Băcăoani). Pentru niciunul nu există vreo
  fotografie liberă: căutat pe Commons după nume, prin categoriile orașelor
  și prin **geosearch pe coordonatele fiecărui obiectiv**, care găsește orice
  poză geoetichetată indiferent cum se numește fișierul. Intrările astea n-au
  `credit`, iar legenda din `App.jsx` e de aceea pusă sub o condiție — fără
  ea, `a.credit.autor` aruncă și cade tot panoul, nu doar legenda;
- **cât au stat fără poză, au stat fără** — nu s-a pus imaginea altui loc. O
  fotografie a centrului unui oraș sub numele unui muzeu e o minciună mică pe
  care oaspetele o descoperă la fața locului;
- **poza statuii a fost înlocuită** cu una de după reabilitare. Cea de pe
  Wikimedia (CC BY 3.0) arăta treptele crăpate, dinainte de renovare —
  corectă ca licență, dar nu mai semăna cu ce găsește omul acolo;
- **paginarea nu e doar așezare în pagină**: pozele se încarcă leneș, deci
  cine nu trece la pagina a doua nu descarcă niciodată ultimele cinci
  imagini. Pe date mobile, în curte, asta se simte;
- **descrierea conacului de la Solești spune că e în ruină.** Cine face 21
  de km așteptându-se la un conac restaurat se întoarce supărat; ce merită
  drumul e parcul, biserica și mormântul Elenei Cuza.

### Regresie introdusă și reparată — 6 septembrie 2026

**Timp de o zi, nicio rezervare nu s-a mai putut crea din PMS.** Merită
scris, fiindcă e o capcană care se poate repeta.

Migrația `guest_app_revoca_functia_de_trigger` a revocat `EXECUTE` pe
`guest_code_nou` de la toată lumea — corect ca intenție, funcția n-are ce
căuta în API. Dar ea e chemată din `pune_guest_code`, trigger-ul `BEFORE
INSERT` de pe `reservations`, iar acela nu era `SECURITY DEFINER`. Apelul
rula deci cu drepturile celui care inserează: recepționerul logat în PMS.
Orice `INSERT` pica cu `42501, permission denied for function
guest_code_nou`, afișat în interfață drept „Nu ai dreptul să faci această
modificare".

**De ce n-a prins nicio verificare.** Două motive care se adună:

1. Postgres verifică `EXECUTE` pe funcția de trigger doar la `CREATE
   TRIGGER`, nu la fiecare declanșare. Deci trigger-ul pornea normal, și
   abia apelul dinăuntru era refuzat — adică exact locul la care nu te
   uiți când citești o listă de revocări.
2. **Toate verificările mele de atunci s-au făcut cu cheia de serviciu**,
   care ocolește și RLS, și drepturile pe funcții. Calea pe care umblă un
   om logat n-a fost exercitată niciodată. Lecția, pentru orice revocare
   de aici înainte: proba trebuie făcută cu rolul `authenticated` și un
   `request.jwt.claims` pus de mână, într-o tranzacție anulată.

Reparat prin `repara_triggerul_de_guest_code`: trigger-ul devine `SECURITY
DEFINER` (cu `set search_path`, obligatoriu acum), iar revocările rămân
neatinse. Verificat pe rolurile reale — admin, recepționer și un grup de
trei camere trec; un utilizator din afara `staff` e în continuare respins.
Căutat și restul clasei de greșeli — nicio altă funcție care rulează cu
drepturile clientului nu cheamă înăuntru ceva revocat.

**Al doilea bug, scos la iveală de primul.** Ecranul arăta simultan eroarea
și „Rezervare creată · 1001", pentru o rezervare care nu exista: funcțiile
`update*` din `pms-app.jsx` prindeau eroarea, o afișau și se terminau la
fel ca la succes, iar apelantul mergea liniștit mai departe la toast și la
închiderea ferestrei. Acum întorc `true`/`false`, iar salvarea rezervării
(singulară și de grup) se oprește când scrierea n-a reușit. Celelalte 60 de
locuri care le apelează ignoră valoarea, ca înainte — schimbarea nu le
atinge.

### Pasul 4d — antetul, navigarea și fereastra de acces ✅ făcut (6 septembrie 2026)

- **Sigla** rotundă (favicon-ul) e înlocuită cu marca de pe lalivada.ro,
  `livada-text.svg` — chiar fișierul folosit de rezervari.lalivada.ro, cu o
  singură schimbare: aurul `#CEA446` al site-ului devine `#c8b18a`, culoarea
  butonului de deschidere. Pe pagina asta cele două stau la două degete unul
  de altul, iar două aururi apropiate dar diferite se citesc ca o greșeală de
  tipar, nu ca o intenție.
- **Localitatea și temperatura** au coborât sub siglă, pe un singur rând.
  Eticheta spune „Vaslui", nu „Muntenii de Jos": complexul e la 3 km de oraș,
  iar oaspetele care se uită la temperatură știe unde e Vasluiul. Coordonatele
  rămân ale complexului — vremea și distanțele se calculează din ele.
- **„Cum ajungi"**, sub butoane: Google Maps / Waze, plus „Acces către
  camere". **Text cu link, nu butoane** — pe lângă că așa s-a cerut, rezolvă
  și o problemă măsurată: aceleași trei etichete ca butoane cereau 399px, iar
  pe un telefon de 390px rămân 316px în card. Ca text, se rup firesc pe
  rânduri.
- **Pictogramele sunt mărcile oficiale**, luate din proiectul site-ului
  (`lalivada-site/public/assets/logo-google-maps.webp`, `logo-waze.webp`), nu
  desenate de noi și nerecolorate — ambele companii cer să nu li se modifice
  sigla, iar una recolorată nici nu s-ar mai recunoaște dintr-o privire, adică
  tot rostul ei aici. Sigla Waze vine ca pătrat opac cu alb în colțuri
  (cyanul începe la 8px dintr-o latură de 48, adică 17%), deci se taie cu
  `border-radius: 20%` — altfel colțurile se văd ca patru pete albe pe cardul
  închis din tema de noapte.
- **Adresele de navigare sunt cele de pe site**, literă cu literă: căutare
  după adresă, nu după coordonate. Am început cu coordonatele, ca fiind mai
  precise, și m-am întors — căutarea cade pe fișa firmei din Google, unde
  reperul e cel întreținut de ei; corectat acolo, se corectează în amândouă
  locurile. `www.waze.com`, nu `waze.com`, care întoarce 301.
- **Fereastra „Acces către camere"** e scrisă de mână, nu adusă dintr-o
  bibliotecă: are de făcut patru lucruri — Escape, clic pe fundal, blocarea
  derulării în spate și întoarcerea focusului la elementul care a
  deschis-o — iar pentru atât n-are rost încă un pachet într-un bundle
  deschis pe date mobile. Toate patru verificate în browser, plus faptul că
  un clic înăuntru **nu** o închide.
  **Conținutul lipsește** (`ACCES_CAMERE` în `continut.js`): pozele și pașii
  vin de la proprietar. Până atunci fereastra spune cinstit că îndrumarea nu
  e pusă și dă numărul recepției — un traseu inventat prin curtea altcuiva
  ar trimite oaspeții aiurea, noaptea, cu bagajele în mână.

**A patra oară cu aceeași capcană**: un backtick scris într-un comentariu CSS
din `styles.js` închide template literal-ul, iar eroarea care apare nu spune
asta — e un 500 pe modul sau un mesaj despre un punct și virgulă lipsă, la
sute de linii distanță. Fișierul nu era importat de niciun test (se încarcă
doar în `main.jsx`, la rulare), deci nimic din suită nu-l atingea. Acum
`src/guest-stiluri.test.js` îl importă: dacă șirul e rupt, suita devine
roșie, în loc să afle utilizatorul dintr-o pagină albă. Testul verifică și că
acoladele sunt în echilibru și că `.g-hero` nu-și ia culorile din jetoane —
regresia de temă întunecată de la 4b, prinsă de data asta automat.

### Regula numelui afișat — corectată 6 septembrie 2026

`guest_stay_by_cod` alegea numele printr-o cascadă: ocupantul camerei, apoi
eticheta grupului, apoi clientul. Acum sunt **două cazuri explicite**:

- **fără grup** → numele de pe rezervare (clientul) e și al ocupantului;
  câmpurile de ocupant rămân doar ca rezervă, pentru o rezervare fără client;
- **cu grup** → ocupantul camerei, iar dacă lipsește, eticheta grupului.
  Niciodată titularul: într-un grup el e o persoană străină de camera aia.

**De ce contează.** Câmpurile `occupant_*` se editează **doar din ecranul de
grup**. Pe o rezervare fără grup nu se văd nicăieri în aplicație, deci nu se
pot corecta. Cu vechea ordine, un nume rămas acolo — de pe o rezervare
scoasă cândva dintr-un grup — stătea lipit pentru totdeauna pe ecranul
oaspetelui, iar schimbarea clientului în PMS nu avea niciun efect. Exact
asta s-a văzut pe rezervarea de test, unde câmpurile fuseseră completate
prin SQL.

**Verificat înainte de aplicare** pe toate rezervările din bază: niciuna
nu-și schimbă numele afișat, deci schimbarea închide cazul, nu repară un
ecran greșit de azi. **Verificat după**, pe cele patru combinații, cu
tranzacții anulate: fără grup + ocupant vechi → clientul; fără grup și fără
client → ocupantul; în grup + ocupant → ocupantul; în grup fără ocupant →
eticheta grupului.

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

---

## 10. Fereastra de timp a butonului

Butonul de deschidere merge **din momentul sosirii până la plecare**, plus
minutele de grație din setări (`pms:access:v1.graceMinutes`, implicit 30).

**De ce nu e de ajuns statusul.** `checkedin` se pune de la recepție și
rămâne așa până apasă cineva check-out. Fără o verificare de oră, un oaspete
cazat cu două zile înainte de sosire ar fi putut deschide ușa din prima
clipă, iar unul care a plecat ar fi putut deschide-o și a doua zi — camera
era deja a altcuiva. Ora decide, nu statusul.

**De ce fereastra vine din rezervare, nu din `access_codes`.** Butonul e
deliberat desprins de codul de acces (vezi 4): codul poate lipsi, poate
întârzia, poate eșua la yală. Dacă fereastra butonului ar fi citită din
codul de acces, butonul ar dispărea exact în situațiile în care e singura
ieșire a oaspetelui.

Regula stă în `guest_poate_deschide`, înaintea plafoanelor — o încercare
prea devreme nu consumă din cele zece pe oră. Motivele noi sunt
`prea-devreme` (răspunsul spune și **de când**: „Ușa se deschide de la ora
sosirii — luni, 10 ianuarie la 14:00") și `prea-tarziu`.

Verificat cu tranzacții anulate pe cele cinci cazuri — în sejur `ok`;
sosire în 2028 `prea-devreme`; plecat din 2020 și încă `checkedin`
`prea-tarziu`; la 10 minute după plecare `ok`; la 40 de minute
`prea-tarziu` — și o dată în producție, mutând temporar sosirea rezervării
de test în 2028.

## 11. Adăugarea pe ecranul principal

În „Bun venit", sub punctul *Salvează pagina pe telefon*, stă butonul
**Adaugă iconul pe ecran** (`src/guest/instalare.js` + componenta
`Instaleaza` din `App.jsx`).

**Cele două sisteme nu se comportă la fel, și nu se poate ascunde asta.**
Android/Chrome anunță prin `beforeinstallprompt` că pagina se poate instala;
evenimentul, oprit din drum cu `preventDefault` și ținut deoparte, poate fi
redeschis mai târziu dintr-un buton — deci acolo o apăsare duce direct în
dialogul sistemului. iOS nu are niciun echivalent: Safari nu dă paginii
niciun mijloc de a-și pune singură iconul. Acolo butonul deschide pașii,
scriși cu numele exacte de pe ecran (*Partajare* → *Adaugă la ecranul
principal*), plus nota că în browserul din WhatsApp opțiunea nu apare.

**Ascultătorul stă la încărcarea modulului, nu în componentă.** Evenimentul
vine la câteva sute de milisecunde după deschiderea paginii, cu mult înainte
ca oaspetele să apese pe „Bun venit". Pus în componentă, ar fi ratat de
fiecare dată și butonul ar cădea inutil pe instrucțiuni.

**Manifestul se scrie la rulare, nu ca fișier în `public-guest/`.** Motivul e
`start_url`: iconul instalat deschide adresa scrisă acolo, iar ea trebuie să
păstreze codul sejurului. Un manifest static ar trimite la
`guest.lalivada.ro` fără fragment, adică în ecranul de link invalid — un icon
care nu duce nicăieri e mai rău decât lipsa lui. Se folosește un `blob:`, nu
un `data:`, fiindcă blobul moștenește originea documentului și trece
verificarea Chrome că `start_url` e pe același domeniu; adresele iconițelor
sunt absolute, fiindcă baza de rezolvare e adresa manifestului, nu a paginii.

Iconițele cerute de Chrome: `brand/icon-192.png` (nouă, tăiată din
`favicon.png`) și `favicon.png` la 512. Pe iOS numele de sub icon vine din
`<meta name="apple-mobile-web-app-title">` — fără el, iOS ia `<title>` și
taie „Sejurul tău — Complex La Livada" la primele litere.

**Dacă ceva din lanțul de instalare nu ține** — manifest respins, pagină
deschisă într-un browser încorporat, iOS — Chrome pur și simplu nu trimite
`beforeinstallprompt`, iar butonul cade pe instrucțiuni. Nu se strică nimic;
se pierde doar apăsarea unică. De aceea instrucțiunile sunt partea care
trebuie să fie bună, nu dialogul nativ.

Butonul dispare când pagina e deja deschisă din icon (`display-mode:
standalone` pe Android, `navigator.standalone` pe iOS) — n-are ce oferi.

Ramura de iPhone e testată în `src/guest-instalare.test.js`, nu în browser:
user-agentul nu poate fi falsificat din afara paginii, orice încercare rămâne
în „isolated world"-ul uneltei în timp ce aplicația citește navigatorul
adevărat.

## 12. Wi-Fi

Primul punct din „Bun venit" — deasupra salvării paginii, fiindcă e primul
lucru căutat la intrarea în cameră, iar salvarea are sens abia după ce
telefonul are internet. Rețeaua e în `WIFI` din `continut.js`, deschisă, fără
parolă. **Nu trebuie să apară vreodată un câmp de parolă acolo**: bundle-ul e
public, deci o parolă scrisă în el e o parolă publică.

**Ce nu se poate.** O pagină web nu poate conecta telefonul la o rețea. Nu e
o lipsă de API pe care s-o ocolim — e o graniță de securitate a sistemului,
la fel pe iOS și pe Android, și nu are cum să cadă. Orice buton care ar
pretinde altceva ar minți.

**Ce se poate.** Codul QR standard `WIFI:S:<rețea>;T:nopass;P:;;`, pe care
camera ambelor sisteme îl recunoaște și îl oferă drept „conectează-te la
rețea". Scanarea o face camera sistemului, nu pagina — deci un telefon nu-și
poate citi propriul ecran. Codul e pentru **al doilea telefon din cameră**,
care îl scanează de pe ecranul primului; scenariul e obișnuit la un cuplu sau
o familie. Pentru telefonul care ține pagina rămân pașii de dedesubt, scriși
cu numele exacte de pe ecran, diferite pe iOS și pe Android.

**QR-ul e fișier static**, `public-guest/wifi-qr.svg`, 1,6 kB. Numele rețelei
e constantă; un generator adus în bundle ar fi însemnat zeci de kiloocteți
pentru o imagine care nu se schimbă niciodată. Se regenerează cu
`scripts/wifi-qr.mjs`, care își verifică singur rezultatul: rasterizează
SVG-ul și îl decodează înapoi, fiindcă un QR greșit e mai rău decât niciunul
— omul îl scanează, nu se întâmplă nimic și conchide că rețeaua e căzută.

Legătura dintre nume și imagine e ținută de `src/guest-wifi.test.js`: numele
rețelei e scris și acolo, deci schimbarea lui pică testul, care spune ce
comandă să rulezi. Fără sârma asta, o redenumire ar lăsa un QR care trimite
liniștit către o rețea inexistentă.

**Două capcane întâlnite la scrierea testului**, amândouă tăcute:

- `new URL("../fișier", import.meta.url)` **nu** dă o cale în acest proiect:
  Vite recunoaște tiparul ca referință la un asset, îl rezolvă la build și îl
  înlocuiește cu conținutul fișierului ca `data:`. Calea se face din
  `process.cwd()`.
- Sub jsdom, `URL` global e implementarea lui jsdom, pe care `fs` n-o
  recunoaște ca URL de fișier — o transformă în șir și caută o cale
  inexistentă.
