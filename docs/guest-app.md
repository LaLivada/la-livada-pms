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

**Adresa: `lalivada.ro/guest/`.** Nu subdomeniu. Vezi secțiunea 3.1, adăugată
pentru asta: alegerea schimbă modul de livrare, fiindcă `lalivada.ro` nu e pe
Vercel, ca celelalte două aplicații.

Rămâne deschisă a treia: ce se face cu camerele fără gateway. Nu se poate
răspunde înainte de pasul 0.

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
- **Autentificarea e linkul însuși**, cu un token de 128 de biți pe
  rezervare, exact tiparul de la `public_bookings.public_token`
  ([schema.sql:1373](../schema.sql)). Fără cont, fără parolă: oaspetele
  primește adresa prin același email/WhatsApp prin care primește azi
  codul.
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

1. **Tokenul de sejur.** `reservations` n-are coloană de token public.
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

## 3.1 Unde stă `lalivada.ro/guest/`

Adresa cerută schimbă livrarea, fiindcă cele trei site-uri nu stau în același
loc:

| Adresă | Unde | Cum ajunge acolo |
|---|---|---|
| `pms.lalivada.ro` | Vercel | push pe `main` |
| `rezervari.lalivada.ro` | Vercel | push pe `main` |
| `lalivada.ro` | hosting obișnuit, `cloud608.c-f.ro` | FTPS, `node scripts/publica.mjs --live` din `lalivada-site` |

`lalivada.ro` e un export static Next (`output: "export"`, `next.config.ts`),
urcat ca fișiere. **Nu există server care să rescrie sau să facă proxy**, deci
`lalivada.ro/guest/` nu poate fi o rescriere către un deploy Vercel separat.
Guest app-ul trebuie să ajungă fizic pe hostingul acela.

Vestea bună: tiparul există deja acolo. `public/statistici/index.php` e servit
la `lalivada.ro/statistici/` și e scos din indexare cu `Disallow: /statistici/`
în `app/robots.ts`. Guest app-ul urmează exact aceeași cale, ca
`public/guest/`.

Ce presupune concret:

- buildul Vite al guest app-ului scrie în `lalivada-site/public/guest/`;
- Next copiază `public/` în `out/` la build, iar scriptul de publicare urcă
  doar fișierele schimbate;
- în `app/robots.ts` se adaugă `Disallow: /guest/`, lângă `/statistici/`.
  Asta înlocuiește nevoia de `public-guest/robots.txt` din secțiunea 4.6:
  pe un domeniu servit de un singur host, robots.txt e unul singur, al
  domeniului;
- `trailingSlash: true` e deja pus, deci `/guest/` servește `/guest/index.html`
  fără nicio regulă de server.

**Costul, spus limpede:** guest app-ul locuiește în repo-ul PMS, dar se
publică din repo-ul site-ului. O schimbare cere două comenzi în două locuri,
iar cine uită a doua comandă crede că a livrat. E prețul adresei cerute; un
subdomeniu pe Vercel s-ar fi publicat singur la push.

**Tokenul trece în fragment, nu în query string.** Adresa devine
`lalivada.ro/guest/#TOKEN`, nu `?t=TOKEN`. Fragmentul nu e trimis niciodată
serverului, deci tokenul nu ajunge în logurile de acces ale unui hosting
partajat, pe care nu-l administrăm noi. Secțiunea 7 cerea deja ca tokenul să
nu circule prin query string; pe hostingul ăsta motivul e și mai apăsat.

---

## 4. Modelul de securitate

Partea cea mai delicată: un link care deschide o ușă.

### 4.1 Tokenul

Coloană nouă pe `reservations`, cu aceeași generare ca la
`public_bookings` și la `rooms.ical_token` — 16 octeți aleatori, hex:

```sql
alter table reservations
  add column guest_token text unique
    default encode(gen_random_bytes(16), 'hex');
```

128 de biți nu se enumeră. Pentru comparație, la o rată imposibil de
atins de 1.000 de încercări pe secundă, o singură ghicire corectă ar cere
mai mult decât vârsta universului — iar limitarea de rată (4.4) taie
oricum încercarea de la a doua.

**Token per rezervare, nu per oaspete.** Un oaspete care revine peste o
lună primește alt link. Asta e intenționat: linkul e legat de sejur, nu
de persoană, deci nu poate „rămâne bun" după plecare.

### 4.2 Fereastra de valabilitate

Regula cerută — „doar pe perioada de cazare" — se impune **în funcția de
pe server**, o singură dată, într-un helper folosit de toate funcțiile
guest app-ului:

```sql
create or replace function rezervare_din_token(p_token text)
returns reservations language plpgsql stable security definer
set search_path = public as $$
declare v_r reservations;
begin
  select * into v_r from reservations where guest_token = p_token;
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

Deschiderea ușii e o acțiune cu efect fizic. Două plafoane, pe modelul
`booking_attempts`:

- **pe token** — cel mult 10 deschideri pe oră. Un oaspete care apasă de
  zece ori într-o oră are altă problemă, pe care o rezolvă recepția.
- **pe IP** — cel mult 30 pe oră, ca un token scurs să nu poată fi
  transformat într-o unealtă de deschis ușa la nesfârșit.

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

Cum se face depinde de unde stă, iar asta s-a hotărât între timp (3.1):
fiind sub `lalivada.ro`, robots.txt e unul singur, al domeniului, generat din
`app/robots.ts` în repo-ul site-ului. Acolo se adaugă `Disallow: /guest/`,
lângă `/statistici/` care e deja acolo. `<meta name="robots" content="noindex">`
rămâne în pagina însăși, ca plasă.

(Varianta inițială — `public-guest/robots.txt` propriu, pe modelul
[vite.booking.config.js](../vite.booking.config.js) — ar fi fost calea dacă
guest app-ul primea subdomeniu propriu. Nu mai e cazul.)

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
   │  fetch cu guest_token în corp, niciodată în query string
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

**De ce tokenul nu circulă în query string.** Adresa cu tokenul e trimisă
prin email/WhatsApp, deci ajunge inevitabil în bara de adrese — asta e
acceptabil. Ce nu e acceptabil e să apară și în logurile de acces ale
fiecărei cereri API. La citiri intră ca parametru de RPC (corp POST); în
URL rămâne doar la deschiderea paginii.

---

## 8. Planul de implementare

### Pasul 0 — verificarea gateway-ului (fără cod)

Test manual pe cele 16 camere, din PMS. Rezultatul decide dacă pasul 4
se face, se restrânge sau se amână. Nu se trece mai departe fără el.

### Pasul 1 — tokenul și poarta de acces

- migrație: `reservations.guest_token`, cu backfill pentru rândurile
  existente (`update … set guest_token = encode(gen_random_bytes(16),'hex')
  where guest_token is null`);
- funcția `rezervare_din_token` (4.2);
- teste în `src/guest-token.test.js`, pe modelul `src/acces.test.js`:
  token inexistent → refuz; rezervare `confirmed` → refuz; `checkedin` →
  acceptă; `checkedout` → refuz; `cancelled` → refuz.

Nimic vizibil pentru utilizator încă. Se poate livra separat.

### Pasul 2 — citirile

- `guest_stay_by_token(p_token)` → detaliile rezervării: camera, datele,
  numărul de nopți, numele ocupantului, ora de plecare;
- `guest_access_code_by_token(p_token)` → codul activ și valabilitatea
  lui, citit din `access_codes` cu `status = 'active'`;
- `guest_minibar()` → produsele cu `category = 'minibar'` și
  `public_visible = true`;
- `grant execute … to anon` pentru toate trei.

### Pasul 3 — guest app-ul

- `vite.guest.config.js` + `src/guest/`, pe tiparul booking-ului, dar cu
  ieșirea în `lalivada-site/public/guest/` (3.1);
- aceeași identitate vizuală: `booking/brand.css` se refolosește;
- patru secțiuni: sejurul, codul, ușa (dacă pasul 0 permite), minibarul;
- stări explicite pentru link invalid, sejur neînceput și sejur încheiat
   — fiecare cu ce trebuie să facă omul mai departe, nu doar „eroare";
- `base: "/guest/"` în configul Vite, altfel fișierele se cer de la rădăcina
  domeniului și pagina rămâne albă;
- token citit din fragment (`location.hash`), nu din query string;
- în repo-ul site-ului: `Disallow: /guest/` în `app/robots.ts`, apoi
  `npm run build` și `node scripts/publica.mjs --live`.
  Fără proiect Vercel nou și fără subdomeniu.

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
