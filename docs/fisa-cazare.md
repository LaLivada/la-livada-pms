# Fișa de cazare, completată de oaspete

Document de arhitectură pentru mutarea fișei de anunțare a sosirii și
plecării de pe hârtie în guest app: oaspetele o completează de pe telefon,
o semnează cu degetul, iar fișa semnată devine documentul care se arată la
un control.

Scris pe baza codului existent la 7 septembrie 2026. Fiecare afirmație
despre ce există deja e însoțită de fișierul și linia unde se vede. Ce
lipsește e marcat explicit ca lipsă, nu presupus rezolvat.

---

## 0. Decizii luate (7 septembrie 2026)

Patru întrebări au primit răspuns înainte de a se scrie o linie de cod.

**Fișa digitală înlocuiește hârtia complet.** Nu se mai tipărește și nu se
mai semnează la recepție. Fișa semnată din guest app e documentul legal.

**Modelul de date e făcut de la început pentru mai multe persoane pe
rezervare, dar prima versiune ia doar titularul.** Legal, fișa se
completează pentru fiecare persoană cazată; PMS-ul de azi are un singur
client pe rezervare. Structura pregătește însoțitorii, livrarea nu-i
include — ca adăugarea lor să nu ceară o migrație de date.

**În spatele ferestrei rămân la vedere ușa, wi-fi-ul și numărul
asistenței.** Restul paginii se blochează până la semnare. Motivul e
practic: butonul de deschidere e *în* guest app, iar un oaspete ajuns la
miezul nopții cu semnal prost, blocat de un formular, nu mai intră de pe
telefon. Codul de tastatură îi rămâne, dar tocmai pagina ar fi devenit
piedica.

**Fișa nu se citește niciodată înapoi.** După trimitere, pagina spune doar
că e completată; conținutul nu se mai arată. Motivul, pe larg, în 3.

**Cum s-a tradus a treia decizie în cod.** Prima variantă a ferestrei era un
panou `position:fixed; inset:0` peste toată pagina. Arăta a fereastră modală
și *părea* să respecte cerința, fiindcă butonul ușii se vedea prin fundalul
translucid. Verificat cu `elementFromPoint` în centrul butonului: răspundea o
etichetă din formular. Butonul se **vedea**, dar nu se putea apăsa — exact ce
s-a hotărât să nu se întâmple.

Fișa e acum un card în curgerea paginii, sub cel cu codul și ușa. Deasupra
rămâne tot ce-i trebuie unui om în fața ușii; sub ea, secțiunile se ascund
până la semnare. Wi-fi-ul și numărul asistenței stau chiar în card: fără
internet nu se completează niciun formular, iar cine se împotmolește trebuie
să poată suna fără să caute.

---

## 1. Ce există deja, și ce nu

**Fișa din PMS e o coală de tipărit, nu o structură de date.**
[documente.jsx:17](../src/features/documente.jsx) randează A4-ul și îl
trimite la imprimantă. Din bază se precompletează patru lucruri — numele,
localitatea, strada, țara — plus datele sejurului. Restul se tipăresc
**goale, ca să fie scrise cu pixul**:

| Câmp de pe fișă | În `guests` |
|---|---|
| Data nașterii | nu există coloană |
| Locul nașterii | nu există coloană |
| Scopul călătoriei | nu există coloană |
| Act de identitate / seria / nr. | nu există coloană |
| Semnătura turistului | nu există coloană |

Tabelul are treisprezece coloane și niciuna dintre acestea
([schema.sql:49](../schema.sql)).

Prin urmare, cerința „extrage de pe fișă câmpurile necompletate" nu se poate
executa așa cum e scrisă: câmpurile alea nu sunt necompletate, **nu
există**. Prima parte a lucrării nu e în guest app, ci în modelul de date.

**Naționalitatea și țara sunt același câmp, și e greșit.** Coala scrie
`g.country` în amândouă ([documente.jsx:54](../src/features/documente.jsx) și
[:59](../src/features/documente.jsx)). Un cetățean român cu domiciliul în
Germania iese cu „Germania" la naționalitate. Pe hârtie a trecut neobservat
fiindcă recepționerul corecta cu pixul; într-un formular completat de
oaspete, greșeala se salvează. În modelul nou sunt două câmpuri.

**Ce se refolosește fără modificări:**

- `guest_poarta` ([schema.sql:3036](../schema.sql)) — plafoanele de
  încercări și fereastra sejurului, gata scrise;
- tiparul de scriere anonimă: `confirm_public_booking` și
  `cancel_public_booking` scriu deja din link public, prin funcții
  `security definer` cu token ([schema.sql:2568](../schema.sql));
- componenta `ArrivalSheet`, pentru randarea colii;
- `generatePdfBlob` ([lib/pdf.js:12](../src/lib/pdf.js)), cu rezervele din 4.

**Supabase Storage nu e folosit nicăieri în proiect.** Dacă fișa ajunge să
ceară fișiere, e primul.

---

## 2. Modelul de date

Un tabel nou. Un rând per persoană cazată.

```sql
create table fise_cazare (
  id              text primary key,
  reservation_id  text not null references reservations(id) on delete cascade,
  -- 1 = titularul. Coloana exista de la inceput ca insotitorii sa nu ceara
  -- o migratie de date; prima versiune scrie numai 1.
  ordine          smallint not null default 1,
  guest_id        text references guests(id),

  nume            text not null,
  prenume         text not null,
  data_nasterii   date not null,
  locul_nasterii  text not null,
  -- Doua campuri, nu unul: vezi 1.
  nationalitate   text not null,
  tara            text not null,
  adresa          text not null,
  localitate      text not null,
  scopul          text not null,

  act_tip         text not null check (act_tip in ('ci','pasaport','permis')),
  act_seria       text,
  act_numarul     text not null,

  -- Semnatura oaspetelui SAU numele celui de la receptie care a completat
  -- fisa in locul lui (5) — niciodata niciuna, niciodata amandoua.
  semnatura_svg   text,
  completata_de   text,
  semnat_la       timestamptz not null default now(),
  semnat_ip       text,
  semnat_agent    text,
  sablon_versiune text not null,

  -- Anularea, singura schimbare pe care triggerul o lasa sa treaca.
  anulata_la      timestamptz,
  anulata_de      text,
  anulata_motiv   text,

  constraint fisa_are_un_autor check (
    (semnatura_svg is not null) <> (completata_de is not null))
);
```

**Unicitatea stă pe un index parțial, nu pe o cheie.** O cheie unică pe
`(reservation_id, ordine)` ar fi blocat locul pentru totdeauna după prima
fișă anulată — iar o fișă se anulează tocmai ca să se poată scrie alta în
locul ei. Așa, regula se aplică numai rândurilor neanulate.

```sql
create unique index fise_cazare_activa
  on fise_cazare (reservation_id, ordine) where anulata_la is null;
```

**Rândul există doar când fișa e completă și semnată.** Nu se salvează
parțial. Asta face trei lucruri deodată: „fișă lipsă" devine „niciun rând",
`not null` poate sta pe câmpurile obligatorii — deci validarea trăiește în
bază, nu doar în formular — și nu există stare intermediară de curățat.

**Un trigger refuză `delete` și lasă din `update` o singură trecere:
completarea celor trei coloane de anulare, o dată, când sunt goale.** Fără
el, „document care nu se poate schimba" e o promisiune, nu o proprietate.
Corecțiile se fac prin anularea fișei și scrierea alteia — nu prin
rescriere.

Anularea trebuie să fie chiar acest caz special, nu o excepție lăsată
deschisă: dacă triggerul ar permite orice `update` „doar pentru anulare",
n-ar mai apăra nimic. El compară rândul vechi cu cel nou și respinge orice
diferență în afara celor trei coloane.

Cele două căi de autor — semnătura oaspetelui sau numele recepționerului —
sunt ținute de `fisa_are_un_autor`. Constrângerea e scrisă cu `<>` pe două
teste de `null`, adică *exact una*: o fișă fără niciun autor n-ar avea
valoare, iar una cu amândoi ar spune două povești despre cine a completat-o.

**Verificat pe 7 septembrie 2026**, cu tranzacție anulată, pe patru cazuri:
modificarea unui câmp obișnuit, ștergerea, și anularea care schimbă și
altceva pe drum sunt toate refuzate; anularea curată trece. Dovada nu sunt
mesajele de eroare, ci rândul citit la final — `nume` rămăsese „Popescu" și
`act_numarul` „123456", deci niciuna dintre încercări nu apucase să scrie.
Din afară, cheia `anon` primește `42501 permission denied for table
fise_cazare`, și la citire, și la scriere.

`sablon_versiune` e explicată în 4.

---

## 3. Modelul de securitate

Guest app-ul de azi citește trei lucruri și deschide o ușă. Cu fișa
înăuntru, ar începe să scrie date personale dintr-un link public — iar
seria și numărul actului de identitate nu expiră odată cu sejurul.

Documentul guest app-ului spune despre codul de cinci caractere că un cod
scurs devine, peste câteva zile, un șir fără putere
([guest-app.md, 4.1](guest-app.md)). Afirmația rămâne adevărată **doar dacă
fișa nu se poate citi înapoi.** Altfel, ce apără codul nu mai e o ușă
temporară, ci un act de identitate.

**De aici, regula: fișa se scrie o dată și nu se citește niciodată
înapoi.** Concret:

- `guest_fisa_precompletare` întoarce numele, adresa, localitatea, țara și
  datele sejurului — atât. Niciodată actul, data sau locul nașterii,
  semnătura.
- **Funcția tace de îndată ce fișa e semnată.** Fereastra în care un cod ar
  putea citi până și atâta se închide singură, de obicei în câteva minute.
- `guest_fisa_semneaza` nu întoarce nimic din ce a scris. Doar dacă a mers.
- A doua scriere pe aceeași `(reservation_id, ordine)` e refuzată de cheia
  unică. Un cod scurs nu poate suprascrie o fișă bună.

**Verificat pe 7 septembrie 2026**, cu tranzacție anulată: precompletarea
întoarce exact cheile `nume`, `prenume`, `adresa`, `localitate`, `tara` —
niciun câmp sensibil; scrierea întoarce doar `ok`; a doua încercare pe
aceeași rezervare dă `deja-completata`; o dată a nașterii stricată dă
`date-incomplete`, nu o excepție cu forma tabelului în ea.

**De ce verificarea e manuală și nu un test.** Scrisă ca test de integrare,
ar fi chemat funcțiile cu un cod inventat — iar fiecare apel cu cod greșit
trece prin `guest_poarta`, scrie un rând în `guest_code_attempts` și consumă
din plafonul de 200 de eșecuri pe oră. Suita rulată de câteva zeci de ori
într-o oră ar fi blocat linkurile oaspeților reali: un test care stinge
funcția pe care o apără. Testele de integrare rămân pe ce pot verifica fără
să scrie — tabelul, triggerul și poarta, toate închise din afară.

Amândouă funcțiile trec prin `guest_poarta`, deci moștenesc plafoanele
existente — 200 de eșecuri pe oră global, 20 de la o adresă — și fereastra
sejurului, fără să se inventeze a doua definiție a lui „e cazat acum".

**Grantul se scrie după revocare**, ca peste tot în schemă: o revocare
scrisă doar pentru `anon` arată corect și nu face nimic
([schema.sql:3268](../schema.sql)).

### Ce nu apără asta

Cine are codul în timpul sejurului poate deschide fișa înainte ca oaspetele
s-o completeze și poate scrie date false, o dată. Rămâne posibil prin
construcție: linkul e singura poartă, iar a adăuga o a doua ar însemna un
pas în plus pentru fiecare oaspete, la fiecare sejur. Compensarea e că
recepția vede fișa și o poate anula (5).

---

## 4. Documentul înghețat

Dacă fișa înlocuiește hârtia, singurul lucru care contează la un control e
un document care nu se poate schimba după semnare. Trei feluri de a-l
obține, și diferă mult ca preț.

**Ce s-a aflat verificând.** `generatePdfBlob`
([lib/pdf.js:51](../src/lib/pdf.js)) nu construiește PDF-ul, ci
**fotografiază DOM-ul**: `html2canvas` rasterizează elementul, iar jsPDF
îmbracă bitmapul rezultat. Într-o funcție edge nu există DOM, deci calea
asta nu se poate muta pe server așa cum e.

### B1 — PDF pe server, la semnare

Îngheț adevărat: un fișier scris o dată, în Storage, care nu se mai atinge.

Costul real, după verificarea de mai sus: în Deno ar trebui redesenată coala
A4 din primitive jsPDF — text, linii, dreptunghiuri — adică **a doua
definiție a aceluiași aspect**, lângă JSX-ul și CSS-ul care există. Exact
duplicarea scoasă din mesajul de acces în aceeași zi, și cu aceeași urmare
previzibilă: cele două s-ar despărți la prima modificare. Plus prima
folosire de Storage din proiect.

### B2 — rând imuabil, PDF randat la cerere

Rândul nu se poate schimba și poartă `sablon_versiune`. Fiindcă intrarea e
fixă și șablonul e fixat, ieșirea e aceeași de fiecare dată — un îngheț
obținut din determinism, nu din stocare.

Fără Storage, fără PDF în Deno, fără a doua definiție a colii. Costul:
versiunile vechi ale șablonului trebuie păstrate, altfel promisiunea cade
tăcut — și „tăcut" e cuvântul important, fiindcă nimic nu s-ar strica
vizibil.

### B3 — recepția congelează, cu randorul care există ← recomandarea

Oaspetele semnează, rândul se scrie. Prima dată când recepția deschide fișa,
PMS-ul o randează cu `ArrivalSheet` și `generatePdfBlob` — codul de azi,
neatins — și încarcă PDF-ul în Storage. De atunci înainte, fișa se servește
din fișier.

Evită și problema lui B1 (nicio a doua definiție a colii, nicio generare în
Deno), și pe a lui B2 (nu depinde de păstrarea șablonului). Congelarea se
întâmplă într-un browser autentificat, al personalului — nu în telefonul
oaspetelui, unde conținutul ar putea fi rescris înainte de trimitere.

Costul cinstit: îngheațarea e la **prima deschidere**, nu la semnare. Între
semnare și deschidere, documentul e încă o reconstrucție. În practică
recepția deschide fișa la scurt timp după check-in; dacă intervalul deranjează,
se poate declanșa automat, tot din PMS.

**Recomandarea e B3, cu B2 ca plasă**: până se scrie încărcarea în Storage,
rândul imuabil plus versiunea de șablon dau deja un document reproductibil.

---

## 5. Ce se schimbă în PMS ✅ făcut (7 septembrie 2026)

**Indicator pe rezervare** — „completată" sau „lipsește", lângă secțiunea de
acces, în `SectiuneFisa` ([features/fise.jsx](../src/features/fise.jsx)). O
fișă fără semnătură se vede ca atare, cu motivul lângă ea.

**Fișa completată, doar citire**, cu semnătura randată din traseul SVG la
același `viewBox` pe care s-a desenat. Alt raport ar deforma-o, iar o
semnătură deformată nu mai e a nimănui.

**Completarea în locul oaspetelui.** Fără pânză de semnat, și e o alegere:
cine *poate* semna o face de pe linkul lui, unde semnătura îi aparține fără
discuție. Calea de la recepție e pentru cine nu poate — un om fără
smartphone, unul plecat în oraș — iar acolo nu există semnătură de cules, ci
un motiv de consemnat. Motivul e cerut în formular, nu lăsat pe seama
constrângerii din bază: recepționerul n-are de ce să afle de la o eroare de
Postgres ce trebuia să scrie.

**Completarea pornește precompletată** — adăugat 7 septembrie 2026, după ce
proprietarul a semnalat că formularul de la recepție venea gol. Venea, într-adevăr:
oaspetele care își deschide linkul primea numele și adresa deja scrise, iar
recepționerul care completa *în locul lui* le retasta, cu omul în față la ghișeu.

Sunt **exact aceleași cinci câmpuri** ca la oaspete — nume, prenume, adresă,
localitate, țară — și nu din întâmplare: două precompletări diferite ar fi
însemnat că aceeași rezervare arată altfel după cine deschide fișa. Regula stă
într-o funcție pură, `precompletareDinOaspete` ([lib/fisa.js](../src/lib/fisa.js)),
iar un test verifică structural că nu scoate niciodată un câmp marcat `sensibil`.

**Naționalitatea nu se ia din `country`**, deși ar fi la îndemână: `country` e
țara de domiciliu, iar un român cu domiciliul în Germania ar fi ieșit „Germania"
la naționalitate. E greșeala pe care coala tipărită o făcea deja.

**Actul de identitate nu se precompletează niciodată**, nici aici. Se citește de
pe documentul din mână, de fiecare dată. O serie precompletată dintr-o fișă
veche e felul în care ajunge un număr greșit pe un act oficial. Formularul spune
pe față de unde vin valorile și cere verificarea lor pe act.

**Un defect găsit cu ocazia asta, pe partea de oaspete.** `snakeGuest`
([data/mapari.js](../src/data/mapari.js)) scrie `"-"` ca umplutură când lipsesc
`last_name`, `first_name` sau `city`. `guest_fisa_precompletare` o trecea mai
departe. Trecută în formular, umplutura *arată* completată: oaspetele nu mai
scrie nimic acolo, validarea o acceptă ca valoare, și `-` ajunge ca localitate pe
un act oficial. Golul se vede; `-` nu. Funcția filtrează acum umplutura și
spațiile, la fel ca partea de recepție. Zero rânduri erau afectate la momentul
reparației — verificat, nu presupus; capcana era latentă, deschisă de primul
oaspete salvat fără localitate.

**Data nașterii se scrie în trei casete** — zi, lună, an — adăugat
7 septembrie 2026, la cererea proprietarului. `<input type="date">` deschide pe
telefon un calendar care pornește de la anul curent: ca să ajungi la 1980
derulezi patruzeci de ani, stând în fața ușii. Trei casete de cifre se
completează din tastatura numerică, fără nicio derulare. Ordinea e cea în care
se scrie în română, iar la ultima cifră focusul sare singur mai departe;
`Backspace` pe o casetă goală se întoarce.

**Formatul păstrat rămâne `AAAA-LL-ZZ`** — coloana din Postgres e `date`, iar
coala tipărită și validarea se sprijină pe el. Casetele sunt doar felul în care
omul îl scrie. Compunerea și descompunerea stau în
[lib/fisa.js](../src/lib/fisa.js), deci aceeași zi tastată la recepție și în
pagina oaspetelui dă același rând în bază.

**Schimbarea a scos la iveală o gaură în validare.** `new Date("1980-02-31")`
**nu** întoarce `Invalid Date` — se rostogolește tăcut la 2 martie. Cu un
calendar nativ, 31 februarie nu se putea tasta; cu trei casete libere, se poate.
Postgres l-ar fi respins cu `date/time field value out of range`, adică
oaspetele ar fi aflat de la o eroare de bază de date ce a greșit. Validarea
verifică acum ziua prin dus-întors: ce a intrat trebuie să iasă. Prinde 31
februarie, 31 aprilie, luna 13 și 29 februarie 1900 — an care nu e bisect,
fiind divizibil cu 100 dar nu cu 400.

**Anularea**, cu motiv și autor. **Nu există buton de „editează"**: triggerul
respinge orice `update` în afara anulării, deci o greșeală se anulează și se
scrie alta.

**Coala tipărită citește din rând.** Până acum tipărea căsuțe goale; acum se
umple din fișă, semnătura inclusă. Fără pasul ăsta ai date în bază și tot o
coală goală la tipărire. Când fișa lipsește, coala rămâne exact ca înainte —
utilă și pentru oaspeții care n-au trecut prin guest app.

**Ce s-a schimbat în model pe drum.** Constrângerea cerea *exact un* autor.
Prea rigidă: fluxul real e ca recepționerul să tasteze și oaspetele să semneze
pe tableta lui. Regula e acum **semnătură sau motivul lipsei ei**, iar
`completata_de` înseamnă „cine a tastat", independent.

**Cine vede fișele:** `admin` și `receptionist`. **`housekeeping` nu** — cine
face curat n-are ce căuta în seriile de buletin, același tipar ca la `guests`.
Verificat că `anon` rămâne în afară după ce grantul s-a pus înapoi pentru
`authenticated`: tot `42501`.

**Ce NU e verificat:** ecranele propriu-zise, la ochi. PMS-ul e în spatele
autentificării, iar eu n-am cont. Build-ul e curat și pagina pornește fără
erori în consolă, dar cum arată panourile pe ecran rămâne de văzut de un om
logat.

---

## 6. Ce nu știu, și cine trebuie întrebat

**Semnătura cu degetul e în regulă** — confirmat de proprietar pe
7 septembrie 2026. Întrebarea era dacă ține loc de una pe hârtie; dacă
răspunsul ar fi fost nu, totul s-ar fi mutat înapoi la „completarea
pregătește hârtia, semnătura rămâne cu pixul" — aceleași tabele, același
formular, alt pas final. Nu s-a întâmplat, deci pasul 3 se face ca scris.

Ce rămâne de făcut oricum, fiindcă o confirmare nu ține loc de urmă: momentul
exact, adresa IP, browserul, și rândul imposibil de modificat după semnare.
Toate sunt în 2.

**A doua întrebare pentru aceeași discuție:** cât timp se păstrează fișele.
Datele de identitate nu se țin „până se umple discul" — există un termen, și
el hotărăște dacă mai trebuie scrisă o ștergere programată.

---

## 7. Ordinea livrărilor

| Pas | Ce | Livrabil singur |
|---|---|---|
| 1 | Tabelul, triggerul de imuabilitate, cele două funcții | da, nimic vizibil |
| 2 | Fereastra din guest app, cu precompletare | nu, cere 1 |
| 3 | Semnătura pe canvas → SVG | nu, cere 2 |
| 4 | Congelarea în Storage (B3) | da, peste 3 |
| 5 | Indicatorul, completarea și anularea de la recepție | da |

Pașii 1–3 se pot livra fără 4: o fișă completată și semnată, ținută într-un
rând imuabil, e deja mai mult decât există azi. Pasul 5 e independent de 4 și
se poate face înaintea lui — recepția are nevoie de el din prima zi în care
un oaspete nu poate folosi linkul.

**Semnătura ca traseu SVG, nu ca poză.** Se desenează pe canvas, dar se
salvează coordonatele. Trei motive: ~3 KB în loc de ~25; se tipărește curat
la A4 fiindcă e vectorială, iar fișa se tipărește; și stă în rândul din bază,
deci intră în același backup ca restul. O poză în Storage ar fi al doilea loc
de salvat — iar backup-ul e încă pe planul gratuit, cu zero copii
([MEMORY](../MEMORY.md)).
