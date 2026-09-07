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
    (semnatura_svg is not null) <> (completata_de is not null)),
  unique (reservation_id, ordine)
);
```

Cheia unică e pe `(reservation_id, ordine)`, deci o fișă anulată ar bloca
scrierea alteia pe același loc. Se rezolvă cu un **index parțial**, nu cu o
cheie: unicitatea se aplică numai rândurilor neanulate.

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

## 5. Ce se schimbă în PMS

**Un indicator pe rezervare** — fișă completată sau lipsă — vizibil acolo
unde se vede și codul de acces.

**Fișa semnată, deschisă și tipărită de la recepție**, prin `ArrivalForm`,
alimentată din rândul nou în loc de câmpuri goale.

**Completarea în locul oaspetelui.** Nu e opțional. Un om de optzeci de ani
fără smartphone tot trebuie cazat legal; fără această cale, mutarea pe
digital nu elimină hârtia, ci o face imposibilă pentru o parte din oaspeți.
Fișa scrisă de la recepție e marcată ca atare — cine a scris-o și când —
fiindcă nu poartă semnătura oaspetelui.

**Anularea unei fișe**, pentru greșeli. Rândul rămâne, marcat anulat cu
motiv și autor, iar unul nou se poate scrie pe locul lui — indexul parțial
din 2 face loc. Nu se șterge nimic: un document legal care dispare fără urmă
e mai rău decât unul greșit.

O consecință de urmărit: cheia de scriere a oaspetelui e „nu există deja o
fișă activă". După o anulare, **linkul redevine deschis pentru scriere** —
corect când recepția anulează ca oaspetele s-o refacă, dar înseamnă că
anularea nu e o operație de rutină. Ea redeschide, pentru câteva minute, fix
fereastra pe care 3 o închide.

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
