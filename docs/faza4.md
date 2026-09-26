# Faza 4 — igienă continuă

Continuarea planului din `docs/audit-2026-09.md` (§3 D, §4 Faza 4). Auditul
o vede „în paralel, câte puțin": nu o fază cu termen, ci lucruri de făcut
când se atinge oricum fișierul. Aici stau **designul** ales pentru fiecare
punct și **starea** implementării.

| # | Punct din audit | Stare |
|---|---|---|
| 1 | D3 — README real | **făcut**, 14 septembrie 2026 (§1) |
| 2 | D4 — index pentru `docs/` | **făcut**, 14 septembrie 2026 (§2) |
| 3 | D6 — `@ts-check` + JSDoc pe `src/lib/` și `src/data/` | **făcut**, 14 septembrie 2026 (§3) |
| 4 | D1 — spargerea fișierelor mari (`rezervari.jsx`, `facturare.jsx`) | **făcut**, 14 septembrie 2026 (§4) |
| 5 | D2 — stilurile inline → clase | **făcut**, 16 septembrie 2026 (§5): plafon în test pe 14 septembrie, migrarea încheiată pe 16 — din 366 au rămas 12, toate calculate |

D5 (comentariile lungi) nu e o sarcină, e o regulă de păstrat; e scrisă acum
și în README, la „Convenții".

---

## 1. README real (D3)

### 1.1 Ce era

Template-ul Vite („React + Vite", cele două pluginuri oficiale). Nimic
despre proiect: cine vine după trebuia să deducă din `package.json` și din
configurile Vite că sunt trei aplicații.

### 1.2 Ce e acum

`README.md`: cele trei aplicații (adresă, intrare, build), împărțirea
codului (`lib`/`data`/`features`/`ui`, schema și migrațiile, funcțiile edge,
scripturile, testele), comenzile, ce face CI-ul și backup-ul, variabilele de
mediu (numele și rolul, niciodată valorile) și convențiile care nu se văd
din cod. Fiecare afirmație vine din repo-ul de azi: `package.json`,
configurile Vite, workflow-urile, `grep` pe `import.meta.env` și
`Deno.env.get`, capul fiecărei funcții edge.

### 1.3 Ce NU s-a schimbat

- Nimic în cod. Convențiile scrise sunt cele deja practicate, nu reguli noi.

---

## 2. Indexul documentației (D4)

### 2.1 Ce era

Unsprezece documente bune, cu date și verdicte, dar fără intrare: ca să
afli ce există trebuia să le deschizi pe rând.

### 2.2 Ce e acum

`docs/README.md`: o linie pe document — ce e, când a fost scris, ce a rămas
din el (închis, implementat, doar plan). Documentele noi se adaugă acolo în
același commit; `README.md` trimite la el.

### 2.3 Ce NU s-a schimbat

- Documentele în sine. Cele două PDF-uri din `docs/` nu sunt în git și nu
  apar în index.

---

## 3. `@ts-check` + JSDoc pe modulele pure (D6)

### 3.1 Ce era

Douăzeci de mii de linii de JavaScript fără tipuri. Auditul nu propune
migrarea la TypeScript (cost mare, câștig mic pe termen scurt), ci
verificarea modulelor pure — `src/lib/` și `src/data/`, deja testate — prin
JSDoc, fără build nou.

### 3.2 Cum funcționează

- `typescript` e devDependency doar pentru verificare (`tsc --noEmit`);
  nimic nu se compilează prin el, bundle-urile rămân ale lui Vite.
- `jsconfig.json`: `checkJs: false` — se verifică **doar** fișierele care
  încep cu `// @ts-check`; azi toate cele 54 din `src/lib/` și `src/data/`.
  Fișierele importate de ele (`src/supabase.js`, `src/ui/*`) nu sunt
  verificate până nu primesc și ele pragma — așa se extinde câte un fișier,
  fără să se aprindă tot proiectul deodată. `strict: false`: tipuri unde
  contează, nu adnotări pe fiecare parametru (TypeScript 7 pornește strict;
  cu strict ar fi apărut și erorile „implicit any", care nu spun nimic
  despre defecte).
- Ce a ieșit la prima verificare: 49 de fișiere curate din 54; 14 erori în
  5 fișiere, toate de același fel — obiecte de opțiuni cu `= {}` (TypeScript
  le vede tipul `{}`), proprietăți puse pe `Error` (`timeout`, `retea`,
  `code`), un tabel de perechi `[RegExp, text]` dedus ca listă amestecată.
  Rezolvate cu JSDoc (`@param`, `@type`), fără nicio schimbare de
  comportament.
- `npm run typecheck` rulează în CI după lint. `src/ts-check.test.js`
  veghează ca fișierele noi din cele două dosare să aibă pragma: altfel un
  fișier nou ar rămâne tăcut neverificat.

### 3.3 Verificare

`npm run typecheck` fără erori; suita (763 de teste, cu cel nou) și cele
trei build-uri neschimbate.

### 3.4 Ce NU s-a schimbat

- Niciun comportament: doar comentarii JSDoc și două cast-uri pe `Error`.
- Ecranele (`src/features/`, `src/ui/`), site-ul și aplicația de oaspete nu
  sunt verificate încă; se adaugă fișier cu fișier, când se atinge oricum,
  cu pragma pe prima linie.

---

## 4. Spargerea fișierelor mari (D1): `rezervari.jsx` și `facturare.jsx`

### 4.1 Ce era

`src/features/rezervari.jsx` avea 2.796 de linii: opt componente și cele două
acțiuni de check-in / check-out într-un singur fișier, plus bannere de
secțiune rămase de pe vremea când toată aplicația era un fișier („LOGIN",
„CLIENTS VIEW", „SETTINGS HUB"), care nu mai descriau nimic din ce urma
după ele. `src/features/facturare.jsx` avea 2.356 de linii: douăzeci și nouă
de declarații (componente, ferestre, adaptorul XML), cu aceleași bannere.

### 4.2 Cum s-a făcut

- **Tăiere mecanică**, cu `scripts/sparge-fisier.mjs` (rămâne în repo pentru
  `facturare.jsx`): fiecare declarație de nivel superior pleacă împreună cu
  comentariul ei; importurile se recalculează (doar ce folosește fiecare
  fișier), căile relative coboară un nivel; nicio linie de cod nu se schimbă.
- `src/features/rezervari/`: `calendar.jsx` (CalendarView), `fisa-rezervare.jsx`
  (ReservationModal, cu fereastra orelor), `vizualizare.jsx`
  (ReservationViewModal), `actiuni.jsx` (ReservationActions),
  `checkin-checkout.jsx` (doCheckIn, doCheckOut), `azi.jsx` (TodayView,
  CardOnline), `night-audit.jsx` (NightAuditGate), `eticheta-nou.jsx`
  (EtichetaNou). Fiecare are un antet care spune ce e.
- `src/features/facturare/`, grupat pe ce face: `clienti-facturare.jsx`
  (eticheta, alegerea și fereastra clientului de facturare), `emitere.jsx`
  (`emiteFactura`, `ensureCazareLine` — separate, ca folio și factura să nu
  se importe una pe alta), `folio.jsx` (FolioPanel, AddExtraForm,
  InvoiceBuilderModal), `factura.jsx` (InvoicePrint, cu încasarea pe loc,
  stornarea și corecțiile de linie), `produse.jsx`, `facturi-lista.jsx`,
  `incasari.jsx`, `permisiuni.jsx`, `export-contabil.jsx`, `financiar.jsx`
  (FinancialView, filele). `facturare.jsx` rămâne poarta, cu cele 26 de nume.
- `rezervari.jsx` rămâne **poarta**: re-exportă aceleași nume, deci
  `pms-app` (import lazy) și testele n-au trebuit atinse; bundle-ul e același
  (poarta trage tot, ca înainte). Codul nou se pune direct în fișierul
  potrivit.
- Bannerele vechi au fost lăsate deoparte, iar un comentariu (`doarCitire`)
  care ajunsese departe de componenta lui a fost pus la loc.
- Ce s-a învățat: `no-undef` din oxlint e plasa de siguranță a unei tăieri
  ca asta — a prins un import lipsă (un nume folosit doar prin `...spread`,
  pe care detectorul de folosiri îl luase drept acces la membru).

### 4.3 Verificare

Lint (`no-undef` e plasa de siguranță a tăierii), typecheck, suita și cele
trei build-uri. Testele de ecran existente trec prin poartă (CardOnline,
ReservationModal, doCheckIn), iar `src/rezervari-poarta.test.js` și
`src/facturare-poarta.test.js`, noi, cer ca fiecare poartă să exporte exact
numele de dinainte (zece, respectiv douăzeci și șase), toate funcții — deci
fiecare fișier din cele două dosare se încarcă. Previzualizarea în browser n-a fost
posibilă după repornirea serverului local (sesiunea autentificată s-a
pierdut, iar eu nu introduc parole); de verificat la prima deschidere:
calendarul, Azi, „vezi rezervarea" și fișa arată ca înainte.

### 4.4 Ce NU s-a schimbat

- Niciun comportament, nicio semnătură, niciun import din afara dosarului.
- Următorul fișier care ar crește prea mult se taie cu același script, când
  se atinge oricum.

---

## 5. Stilurile inline (D2): plafonul

### 5.1 Ce era

377 de `style={{ … }}` în ecrane (cele mai multe în `camere.jsx`,
`setari.jsx`, `facturare/folio.jsx`, `clienti.jsx`), deși `pms.css` are un
sistem de jetoane și clase. Auditul propune migrarea treptată la clase și o
regulă de lint cu excepții pentru valorile calculate.

### 5.2 Cum funcționează

- oxlint n-are o regulă pentru `style` (nici `forbid-dom-props`), deci
  **plafonul e un test**: `src/stiluri-inline.test.js` numără `style={{` în
  toate fișierele `.jsx` din `src` (fără teste) și cade dacă sunt mai multe
  decât `PLAFON` (377 azi). Când scoți stiluri dintr-un ecran, cobori
  plafonul la noul număr: merge doar în jos. Mesajul testului spune care
  fișiere au cele mai multe.
- **Excepțiile** rămân stiluri inline și stau în plafon: pozițiile calculate
  din calendar (`left` / `width` ale barelor, `--zi-w`), lățimi care vin din
  date. Un stil calculat n-are cum să fie clasă.
- Migrarea propriu-zisă: câte un ecran, când se atinge oricum; întâi
  repetițiile (`marginTop`, `display: flex` cu `gap`) care au deja clase în
  `pms.css`.

### 5.3 Migrarea, încheiată pe 16 septembrie 2026

Din 366 au rămas **12**, toate calculate la rulare: pozițiile barelor din
calendar (`left`, `width:calc(…)`, `--zi-w`, `--days`), scalarea colilor A4
(factura, rooming list), procentele din rapoarte și glisorul de ușă. Un stil
calculat n-are cum să fie clasă, deci plafonul nu mai are unde să coboare:
de acum, un `style={{ }}` nou cu valori constante face testul să cadă, și
asta e treaba lui.

Regula de aur a fost **nicio schimbare vizuală**: fiecare stil inline a
devenit CSS cu exact aceleași declarații. De aici trei alegeri care par
mărunte, dar au contat:

- **Mărimile de font au rămas în px, nu în jetoanele `--fs-*`**, deși
  valorile par egale. Blocul „DESKTOP LAT" (§ de la finalul `pms.css`)
  redefinește jetoanele peste 1400px: `--fs-sm` devine 14px. Un `fontSize:
  12` scris inline nu crește azi pe monitor lat; tradus în jeton, ar fi
  crescut cu ~15%. (Că textele acelea ar merita să intre în scară e o
  discuție separată, nu o decizie de luat pe furiș într-o mutare de stiluri.)
- **Clasele noi stau la capătul fișierului**, după interogările media. Un
  stil inline bate orice clasă; ca înlocuitorul lui să se comporte la fel,
  regula trebuie să fie ultima dintre cele de aceeași specificitate. Unde
  elementul avea deja o regulă mai specifică (`.field input`,
  `.pms .modal .modal-actions`, `.cal-scroll.dense .cal-roomcell .rname`),
  clasa nouă a primit un selector la fel de specific — sunt opt astfel de
  locuri, fiecare cu comentariul lui.
- **Ce are un rol a primit un nume** (`.camere-pasaj-activ`,
  `.naudit-header`, `.folio-total-rand`): 129 de clase, cu prefixul
  ecranului. Doar ajustările dintr-o singură proprietate — o margine, o
  aliniere — au intrat în blocul „Utilitare (D2)" de la final, care e
  **închis**: nu e începutul unui sistem de utilitare.

Un ternar între două valori constante (`marginTop: restante.length ? 10 : 4`)
nu e un stil calculat: a devenit două clase și un `className` condiționat.

### 5.4 Verificare

Testul plafonului trece la 12; o linie nouă cu `style={{` îl face să cadă în
CI. Peste el, la migrare s-au mai rulat două verificări scrise pentru asta:

- fiecare clasă folosită în JSX are o regulă în CSS (altfel elementul rămâne
  nestilat, iar nici testele, nici build-ul n-ar spune nimic — jsdom nu
  încarcă foaia de stil);
- fiecare declarație scoasă dintr-un stil inline se regăsește în CSS (512 de
  perechi proprietate-valoare, toate găsite).

Plus suita întreagă (902 de teste), lint, typecheck și cele trei build-uri.
Partea publică — motorul de rezervări — s-a verificat și în browser, cu
`getComputedStyle` pe elementele atinse: aceleași valori ca înainte,
inclusiv acolo unde regula nouă trebuia să bată `.ldv p`.

### 5.5 Ce NU s-a schimbat

- Nimic la vedere: aceleași valori, alt loc unde sunt scrise.
- Pagina oaspetelui (`src/guest/`) n-avea stiluri inline; n-a fost atinsă.
- `var(--muted)` din `fise.jsx` și `acces.jsx` a fost copiat identic, deși
  jetonul **nu e definit nicăieri** în proiect (textele acelea moștenesc
  culoarea în loc să fie gri). E o eroare mai veche, nu una adusă de D2:
  reparat-o ar fi însemnat o schimbare vizuală, exact ce D2 promite că nu
  face. S-a reparat separat — vezi 5.6.

### 5.6 Jetonul `--muted`, reparat separat (16 septembrie 2026)

`.fise-nota-info` și `.acces-nota` cereau `var(--muted)`, un jeton pe care
nu-l definește nimeni. Un `var()` nerezolvat nu strică regula zgomotos: o
face „invalidă la calcul", iar `color` se întoarce la valoarea moștenită.
Cele două note arătau deci ca textul din jur, nu stinse. Amândouă cer acum
`var(--text-muted)`, singurul jeton gri al proiectului.

Ca să nu se mai strecoare una la fel, `src/jetoane-css.test.js` citește cele
patru foi de stil, aruncă comentariile și cere ca fiecare `var(--x)` **fără
rezervă** să fie definit în aceeași foaie. Scrierea cu rezervă
(`var(--beige, #e7dfd1)` din motorul de rezervări) rămâne permisă: motorul e
gândit să se lipească într-un site care-i dă jetoanele lui și să arate corect
și fără ele. Singura excepție trecută pe listă e `--days`, scris la rulare din
`calendar.jsx`, iar lista își are propriul test ca să nu crească pe furiș.

Testul a fost verificat în ambele sensuri: cu `var(--muted)` pus la loc cade
și numește jetonul, cu corectura pusă trece.

A ieșit la iveală atunci și un lucru înrudit, rezolvat separat: clasa
`.ldv-mic`. Vezi 5.7.

### 5.7 `.ldv-mic` devine `.text-secundar` (17 septembrie 2026)

`.ldv-mic` e o clasă a motorului de rezervări, unde chiar înseamnă text mic
și stins. Istoricul arată cum a ajuns în PMS: apare prima dată în commit-ul
motorului public, iar două commit-uri mai târziu e copiată în PMS, fără ca
foaia lui de stil s-o urmeze. Mai târziu cineva a definit
`.panel-clickabil .ldv-mic` pentru rândul „Vezi pe zile" din rapoarte,
dându-i un al doilea înțeles, de link colorat. Deci un nume, două înțelesuri
și un gol.

Cum stăteau cele 22 de folosiri din PMS înainte:

| | |
|---|---|
| chiar stilate (rândul din rapoarte) | 1 |
| luau doar culoarea, de la o clasă vecină | 3 |
| nu luau nimic: mărime întreagă, culoare moștenită | 18 |
| luau mărimea mai mică | 0 |

Acum există `.text-secundar` (`--fs-sm` + `--text-muted`), scrisă o dată în
`pms.css`, în propria ei secțiune de la începutul foii. Mărimea vine din
jeton, nu din px ca la D2: acolo se muta un stil existent și orice jeton ar
fi schimbat imaginea, aici se scrie unul nou, iar textul secundar al
PMS-ului e peste tot `--fs-sm`.

Restul:

- 20 de locuri poartă acum `.text-secundar` și devin mai mici și stinse. Asta
  **se vede**, și e tot rostul schimbării.
- Rândul din rapoarte ține de-acum regula pe numele lui,
  `.panel-clickabil .setari-raport-vezi-zile`. Nimic schimbat la vedere.
- Notele rezervării (`vizualizare.jsx`) au rămas **nestilate**, adică exact
  cum arătau. Acolo clasa fusese pusă greșit de la început: sub eticheta
  „Note" stă conținutul pe care recepția trebuie să-l citească, nu un text de
  sprijin, deci n-are ce căuta mic și stins.
- `.acces-nota` a dispărut: nu mai spunea decât „stins", iar asta o spune
  acum clasa nouă. `.fise-nota-info` a rămas doar cu spațiul de sub notă.

---

## 6. Protocol: atribut, nu doar stare (15 septembrie 2026)

### 6.1 Ce era

„Protocol" era doar o stare a rezervării, folosită și ca marcaj „nu se
încasează": Azi, `raport_luna`, `oaspeti_statistici` și fișele de client
se uitau la `status = 'protocol'`. Consecință: o rezervare protocol nu putea
face check-in (`canCheckIn` cerea „confirmed"), iar dacă ar fi făcut, ar fi
devenit „checkedin" și ar fi intrat în venit ca un sejur plătit.

### 6.2 Cum funcționează

- Coloana `reservations.protocol` (boolean), pusă de triggerul
  `reservations_protocol_din_status`: adevărată când starea e `protocol`,
  păstrată la check-in / check-out / no-show / anulare, ștearsă când starea
  e pusă explicit pe `pending` sau `confirmed`. Interfața n-o scrie —
  `camelRes` o citește, `snakeRes` n-o trimite.
- `esteProtocol(r)` (`lib/availability.js`) = starea `protocol` sau
  atributul; `isStatsEligible`, Azi și `statisticiProtocol` întreabă pe ea.
  `raport_luna` și `oaspeti_statistici` folosesc coloana.
- `STATUSURI_CAZABILE = ["confirmed", "protocol"]`: protocolul face check-in
  ca o rezervare confirmată; se anulează și trece pe no-show la fel.
- În ferestre, un protocol deja cazat are „· Protocol" în rândul cu sursa.

### 6.3 Verificare

`src/tranzitii.test.js` (cazare, anulare, no-show pe protocol),
`src/rapoarte.test.js` (un protocol cazat rămâne la statistica lui),
`src/protocol-atribut.test.js` (atributul și maparea). Pe baza live, după
migrare: singura rezervare protocol a primit atributul; `raport_luna`
răspunde la fel ca înainte.

---

## 7. Interfața nouă (15 septembrie 2026), singura din 26 septembrie 2026

Cele șapte propuneri de după faza 4 au stat întâi în spatele unui comutator
din Useri și drepturi → Contul tău → **Interfața: Nouă / Actuală**
(alegerea dispozitivului, în `localStorage`), cu „Actuală” ca drum înapoi
la forma de dinainte.

**Pe 26 septembrie 2026 comutatorul a fost scos** (Ovidiu: „Interfața
actuală este definitiva!”). Interfața nouă e singura, oricare ar fi alegerea
rămasă în browser: regulile care stăteau sub `.ui-noua` stau sub `.pms`
(aceeași specificitate, aceeași ordine în cascadă), butonul de rezervare
din bara calendarului — care se vedea doar pe telefon, în forma veche — a
dispărut, iar tema a rămas singură în `lib/tema.js` și `ui/tema.jsx`.

| # | Ce | Unde |
|---|---|---|
| 1 | „Înapoi” al telefonului închide fereastra sau revine la ecranul anterior | `ui/istoric.jsx` (Dialog), `Shell` |
| 2 | Erorile formularului de rezervare sub câmpul lor, aduse în vizor | `fisa-rezervare.jsx` (`EroareCamp`) |
| 3 | Bara de acțiuni a ferestrelor lipită jos | `.pms .modal .modal-actions` |
| 4 | Navigare jos pe telefon (Azi/Camere, Calendar, Caută, Setări) | `Shell`, `.nav-jos` |
| 5 | Ținte de 42–44px și la contact, rânduri, etichete | `@media (pointer: coarse)` sub `.pms` |
| 6 | Culorile stărilor din legendă și în Azi și în istoricul clientului | `azi.jsx`, `clienti.jsx` |
| 7 | Aspect: Ca sistemul / Deschis / Întunecat | `lib/tema.js` (`aplicaTema`), clasa `tema-intunecata` pe `<html>` |

„Ca sistemul” e comportamentul de dinainte. Teste: `src/tema.test.js`,
`src/interfata-definitiva.test.js`, `src/dialog-istoric-ecran.test.js`,
`src/cont-meu-ecran.test.js`.

### 7.1. Antet, bara calendarului, „+” (15 septembrie 2026, seara)

- Antet: titlul ecranului, mare, în stânga (fără „La Livada”); logo-ul auriu
  (`public/logo-text.svg`: doar literele, fără copac și fără linia de dedesubt,
  decupate din `logo.svg`)
  în dreapta, un clic reîncarcă pagina rămânând pe ecran (`reincarca` în
  `Shell`). Dublul tap pe pastilă face același lucru.
- Calendar: bara cu Azi / ±7 zile / vederi stă sub tabel, lipită de rândul
  Ocupare (`.cal-toolbar`, sticky jos). Butonul „Rezervare nouă” rămâne pe
  tabletă și desktop și se ascunde pe telefon în interfața nouă, unde
  „+” din navigarea jos (`.nav-jos-plus`) deschide formularul prin
  intenția `nou`.
- Desktop: aplicația ocupă tot ecranul (`#root` fără lățimea de 1126px din
  șablonul Vite), iar „Rezervare nouă” stă în antet, lângă Calendar
  (`.top-rez`, ascuns pe telefon). Butonul din bara calendarului rămâne doar
  pe telefon, în interfața actuală.
