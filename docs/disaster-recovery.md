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
2. **Programează copii regulate** — vezi „Backup periodic".
3. **Ia în calcul planul Pro** dacă PMS-ul devine sursa unică de adevăr
   pentru rezervări. Backup zilnic automat + posibilitatea PITR schimbă
   complet calculul de mai sus. E o decizie de business, nu tehnică:
   întrebarea e cât valorează o zi de rezervări pierdute.

---

## Starea verificată a sistemului

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

Necesită Supabase CLI (`supabase --version` — testat cu 2.115.0) și
parola bazei de date, din Dashboard → Project Settings → Database.

```bash
# Structura (tabele, funcții, politici RLS, trigger-e)
supabase db dump --db-url "postgresql://postgres.suoowrginsliyrbxqeap:[PAROLA]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" -f backup-structura.sql

# Datele
supabase db dump --db-url "postgresql://postgres.suoowrginsliyrbxqeap:[PAROLA]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" --data-only -f backup-date.sql
```

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

**c) Automat, în GitHub Actions.** Posibil, dar cu o rezervă importantă:
dump-ul ar conține date personale ale clienților, iar artefactele de CI
sunt accesibile oricui are acces la repo și rămân stocate la GitHub.
Pentru o pensiune care intră sub GDPR, varianta (b) e de preferat —
datele nu părăsesc infrastructura ta. Dacă totuși se alege (c), repo-ul
trebuie să fie privat, retenția artefactelor scurtă, iar prelucrarea
documentată.

---

## Restaurare

### Cazul 1: baza a fost ștearsă sau coruptă

1. Creează un proiect Supabase nou (aceeași regiune, `eu-central-1`).
2. Rulează `schema.sql` din acest repo în SQL Editor — reconstruiește
   toată structura: tabele, indecși, funcții, trigger-e, politici RLS.
   Fișierul e ținut sincronizat cu baza la fiecare migrare, tocmai
   pentru asta.
3. Încarcă datele din `backup-date.sql`.
4. Recreează conturile de personal (Authentication → Add user) și
   rândurile corespunzătoare din `staff`, cu rolurile potrivite.
5. Actualizează `VITE_SUPABASE_URL` și `VITE_SUPABASE_ANON_KEY` în
   variabilele de mediu Vercel, apoi redeployează.
6. Redeployează funcțiile Edge: `supabase functions deploy ical-feed` și
   `supabase functions deploy anaf-lookup`.
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
