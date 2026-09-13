# Recuperare în caz de dezastru

Ce se întâmplă dacă baza de date dispare, aplicația nu mai pornește sau
Supabase e indisponibil — și ce trebuie făcut, în ce ordine.

Documentul descrie situația **verificată** la 19 august 2026. Datele de
mai jos au fost citite direct din proiect, nu presupuse.

---

## ⚠️ Constatarea principală: nu există niciun backup automat

Organizația `LaLivada's Org` e pe **planul Free**. Documentația Supabase
e explicită: backup-urile zilnice automate există doar pe planurile Pro,
Team și Enterprise. Pentru planul Free, recomandarea oficială este ca
proiectele *„să-și exporte datele în mod regulat cu `supabase db dump` și
să păstreze copii în afara platformei"*.

Concret, astăzi:

| | Stare |
|---|---|
| Backup automat zilnic | ❌ nu există |
| Point-in-Time Recovery | ❌ indisponibil pe Free (add-on Pro+) |
| Copie manuală existentă | ❌ niciuna |
| **Pierdere maximă de date la un incident** | **TOT** |

Adică: dacă baza se pierde acum, se pierd toate cele 87 de rezervări,
87 de fișe de client, facturile emise și jurnalul de activitate.
Reconstrucția s-ar face din memorie și hârtii.

**Al doilea risc al planului Free:** proiectele se suspendă automat după
o perioadă de inactivitate. Pentru o aplicație folosită zilnic nu se
întâmplă, dar în extrasezon, cu recepția închisă câteva zile, e o
posibilitate reală. Un proiect suspendat se reactivează din Dashboard,
fără pierdere de date, dar aplicația e indisponibilă până atunci.

### Ce e de făcut, în ordinea importanței

1. **Fă o copie chiar acum** (procedura de mai jos, durează sub un minut
   la 13 MB).
2. **Pornește copia zilnică din GitHub Actions** — există din 13 septembrie
   2026 (`.github/workflows/backup.yml`), dar rulează doar după ce sunt
   puse secretul, certificatul și cheia publică — vezi „Backup periodic".
3. **Ia în calcul planul Pro** dacă PMS-ul devine sursa unică de adevăr
   pentru rezervări. Backup zilnic automat + posibilitatea PITR schimbă
   complet calculul de mai sus. E o decizie de business, nu tehnică:
   întrebarea e cât valorează o zi de rezervări pierdute.

---

## Starea verificată a sistemului

Citită pe 19 august 2026. La 13 septembrie 2026 (vezi
`docs/audit-2026-09.md`): 17 MB, 140 de rezervări, 3 conturi de personal,
105 migrații, 8 funcții edge — tot pe planul Free, tot fără backup automat.

| Element | Valoare |
|---|---|
| Proiect Supabase | `suoowrginsliyrbxqeap` („PMS La Livada") |
| Regiune | `eu-central-1` (Frankfurt) |
| Postgres | 17.6 |
| Plan | Free |
| Mărimea bazei | 13 MB |
| Tabele în `public` | 25 |
| Conturi de utilizator | 1 (admin) |
| Migrări aplicate | 13 |
| Frontend | Vercel, domeniu `pms.lalivada.ro` |
| Funcții Edge | `ical-feed`, `anaf-lookup` |

Volumul mic e o veste bună pentru recuperare: un dump complet și
restaurarea lui durează secunde, nu ore.

---

## Backup manual (de făcut acum)

`supabase db dump` rulează `pg_dump` într-un container, deci cere Docker
Desktop — care nu e instalat și nu merită instalat doar pentru asta. În
locul lui, `scripts/backup.mjs` se conectează direct (prin `pg`) și scrie
un fișier SQL doar cu datele; structura e în `schema.sql`, ținut
sincronizat cu baza la fiecare migrare.

Are nevoie de parola bazei (Dashboard → Project Settings → Database,
„Connection string", varianta cu pooler, portul 5432) și de certificatul
autorității Supabase (aceeași pagină → SSL Configuration → Download,
`prod-ca-2021.crt`), fără de care verificarea TLS eșuează — iar scriptul
refuză deliberat să o dezactiveze:

```bash
node scripts/backup.mjs "postgresql://postgres.suoowrginsliyrbxqeap:[PAROLA]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" --ca C:\cale\prod-ca-2021.crt
```

Rezultatul, `backup-date-AAAA-LL-ZZ.sql`, e ignorat de git.

**Unde se păstrează:** oriunde **în afara** Supabase și **în afara**
acestui repo — un disc extern, un cloud personal, orice. Un backup ținut
în același loc cu originalul nu e backup.

**Atenție la conținut:** fișierele conțin nume, telefoane, adrese și
e-mailuri de clienți, plus date de facturare. Sunt date cu caracter
personal. Nu le pune într-un repo public, nu le trimite pe e-mail
nesecurizat, nu le lăsa pe un calculator partajat.

**Ce NU intră în dump:** conturile din `auth.users` (parolele) nu sunt
incluse într-un dump obișnuit de schemă publică. La o restaurare pe un
proiect nou, conturile de personal se recreează manual — sunt puține
(unul azi).

---

## Backup periodic

Trei variante, de la cea mai simplă la cea mai robustă.

**a) Manual, recurent.** Un memento în calendar și comanda de mai sus.
Funcționează dacă e chiar respectat; la un PMS de pensiune, o dată pe
săptămână plus înainte de orice modificare mare e rezonabil.

**b) Un script local programat** (Task Scheduler pe Windows) care rulează
aceleași comenzi și scrie într-un folder sincronizat cu un cloud
personal. Nu necesită nimic în plus și ține datele la tine.

**c) Automat, în GitHub Actions — implementat pe 13 septembrie 2026**
(`.github/workflows/backup.yml`: zilnic la 02:15 UTC, plus pornire manuală
din tab-ul Actions). Rezerva formulată aici inițial era reală: dump-ul
conține date personale, iar artefactele de CI sunt accesibile oricui are
acces la repo și stau la GitHub. De aceea copia e **criptată cu o cheie
publică (age)** înainte să devină artefact: GitHub și oricine cu acces la
repo pot doar să încuie, nu să deschidă; cheia privată stă la proprietar,
în afara repo-ului. Retenția e de 90 de zile (maximul GitHub), deci
fereastra de recuperare e de trei luni în urmă, cu o copie pe zi.

Job-ul există dar **nu rulează** până nu sunt puse, o singură dată:

1. secretul `DATABASE_URL` (Settings → Secrets and variables → Actions) —
   adresa cu pooler, portul 5432; runner-ele GitHub n-au IPv6, iar adresa
   directă a bazei e doar IPv6 pe planul Free;
2. `scripts/prod-ca-2021.crt` în repo — certificatul CA Supabase, public;
3. `scripts/cheie-publica-backup.txt` în repo — cheia publică age. Se
   generează o dată, local:

   ```bash
   winget install FiloSottile.age
   ```
   ```bash
   age-keygen -o cheia-de-backup.txt
   ```

   `cheia-de-backup.txt` e cheia **privată**: se pune în managerul de
   parole și se șterge de pe disc; fără ea nicio copie nu se mai deschide.
   Linia `# public key: age1…` din el e ce intră în repo, singură, în
   fișierul de mai sus.

Prima rulare se pornește manual (Actions → Backup → Run workflow) și se
verifică descărcând artefactul și decriptându-l (comanda e la „Restaurare",
cazul 1) — un backup nedeschis niciodată e o presupunere, nu un backup.

**Varianta (b) rămâne valabilă** pentru cine vrea ca datele să nu părăsească
deloc infrastructura proprie; (c) are avantajul că nu depinde de un
calculator pornit la ora potrivită.

---

## Restaurare

### Cazul 1: baza a fost ștearsă sau coruptă

1. Creează un proiect Supabase nou (aceeași regiune, `eu-central-1`).
2. Rulează `schema.sql` din acest repo în SQL Editor — reconstruiește
   toată structura: tabele, indecși, funcții, trigger-e, politici RLS.
   Fișierul e ținut sincronizat cu baza la fiecare migrare, tocmai
   pentru asta.
3. Decriptează copia — `age -d -i cheia-de-backup.txt backup-date-AAAA-LL-ZZ.sql.age > backup-date.sql`
   (copia manuală de la `scripts/backup.mjs` e deja în clar) — și rulează
   `backup-date.sql` în SQL Editor.
4. Recreează conturile de personal (Authentication → Add user) și
   rândurile corespunzătoare din `staff`, cu rolurile potrivite.
5. Actualizează `VITE_SUPABASE_URL` și `VITE_SUPABASE_ANON_KEY` în
   variabilele de mediu Vercel, apoi redeployează.
6. Redeployează toate funcțiile Edge din `supabase/functions/` (8 la 13
   septembrie 2026) — `supabase functions deploy`, fără argument, le urcă
   pe toate. Secretele lor (Resend, TTLock, Shelly, Turnstile) se pun din
   nou în Dashboard → Edge Functions → Secrets: nu sunt în repo și nu sunt
   în backup.
7. **Token-urile iCal se schimbă** — fiecare cameră primește un token nou
   la recreare, deci feed-urile din Booking.com/Airbnb trebuie
   reconfigurate cu adresele noi.
8. Rulează `tests/invarianti-productie.sql` ca să confirmi că datele
   restaurate sunt coerente.

### Cazul 2: un deploy stricat pe Vercel

Vercel păstrează deploy-urile anterioare și permite revenirea instant la
oricare dintre ele (Dashboard → Deployments → Promote to Production).
Nu e nimic de configurat în acest repo.

**Neverificat:** revenirea n-a fost niciodată exercitată pentru acest
proiect. Merită încercată o dată, controlat, ca să știi unde sunt
butoanele înainte să ai nevoie de ele sub presiune.

### Cazul 3: proiectul Supabase e suspendat (inactivitate)

Dashboard → proiectul → butonul de restaurare. Datele rămân intacte.
Aplicația e indisponibilă până la reactivare, care durează câteva minute.

### Cazul 4: Supabase e temporar indisponibil

Aplicația nu are mod offline. Fiecare scriere eșuează, utilizatorul vede
un mesaj de eroare și datele se reîncarcă de la server. Nu se pierde
nimic din ce era deja salvat, dar nu se poate lucra deloc.

Recepția trebuie să știe procedura de rezervă: rezervările se notează pe
hârtie și se introduc după revenire. Verificarea de suprapunere din baza
de date le va prinde dacă între timp s-a suprapus ceva.

### Cazul 5: `ical-feed` nu mai funcționează

Booking.com și Airbnb nu mai primesc actualizări de disponibilitate —
risc de suprarezervare din surse externe. **Nu există nicio alertă**
pentru asta; s-ar observa abia când apare o rezervare dublă.

Un mod simplu de a verifica periodic: deschide într-un browser adresa
iCal a unei camere și vezi dacă răspunde cu conținut valid.

---

## RPO și RTO

Termenii, pe scurt: **RPO** = câte date pierzi (cât timp înapoi ajunge
ultima copie). **RTO** = cât durează până revii în funcțiune.

| | Astăzi (Free, fără copii) | Cu backup săptămânal | Cu plan Pro |
|---|---|---|---|
| RPO | **totul** | până la 7 zile | până la 24 h |
| RTO | nedefinit (reconstrucție manuală) | ~30 min | ~15 min |

Cifrele pentru coloanele 2 și 3 sunt estimări bazate pe mărimea bazei
(13 MB), nu măsurători. **Devin reale doar după o restaurare de probă.**

---

## Ce nu e verificat

Onest, ca să nu existe surprize:

- **Nicio restaurare n-a fost testată vreodată.** Un backup netestat e o
  presupunere, nu o garanție. Cea mai utilă oră pe care o poți investi
  aici: creează un proiect de probă, restaurează în el, verifică că
  aplicația pornește și că datele sunt întregi. Proiectul de probă
  servește apoi și pentru testele E2E (vezi `tests/e2e/README.md`).
- **Revenirea la un deploy anterior pe Vercel** — capabilitate a
  platformei, neexercitată aici.
- **Nu există monitorizare sau alertare** pentru niciuna dintre
  componente. O cădere se observă când o observă cineva.
