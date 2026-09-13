# Faza 3 — UX

Continuarea planului din `docs/audit-2026-09.md` (§3 C, §4 Faza 3). Aici stau
**designul** ales pentru fiecare punct și **starea** implementării. Auditul
recomanda două sesiuni de câte 20 de minute cu utilizatorii înainte de
orice din lista asta; proprietarul a ales să se construiască direct, în
ordinea propusă de audit. Ce iese din sesiunile cu recepția, când vor fi,
se pune peste.

| # | Punct din audit | Stare |
|---|---|---|
| 1 | C1 — căutare globală (`Ctrl+K`, `/`) | **făcut**, 14 septembrie 2026 (§1) |
| 2 | C2 — scurtături de tastatură | **făcut**, 14 septembrie 2026 (§2) |
| 3 | C5 — conflictul de concurență cu diff și alegere | **făcut**, 14 septembrie 2026 (§3) |
| 4 | C8 — indicator offline + coadă de salvări | **făcut**, 14 septembrie 2026 (§4) |
| 5 | C3 — calendarul pe tabletă (7 zile, coloană lipicioasă) | **făcut**, 14 septembrie 2026 (§5) |
| 6 | C4 — fișa de rezervare cu secțiuni pliabile | **făcut**, 14 septembrie 2026 (§6) |
| 7 | C6 — rapoarte cu delta față de anul trecut + CSV | **făcut**, 14 septembrie 2026 (§7) |
| 8 | C7 — „nou de la ultima deschidere" | de făcut |
| 9 | C9 — optimistic UI pe `room_status` | făcut deja în faza 2 (A6, `docs/faza2.md` §3) |
| 10 | C10 — skeleton + timeout pe site și în aplicația de oaspete | de făcut |

---

## 1. Căutarea globală (C1)

### 1.1 Ce era greșit

Ca să găsești „rezervarea lui Popescu de săptămâna viitoare" treceai prin
Clienți → istoric, sau derulai calendarul. Nici telefonul, nici camera,
nici codul din linkul aplicației de oaspete nu duceau nicăieri.

### 1.2 Cum funcționează

- **Caseta**: lupa din antet, `Ctrl+K` / `Cmd+K` din orice ecran (și
  dintr-un câmp de scris), sau `/` din afara câmpurilor. Un singur câmp;
  rezultatele sunt **rezervări**, nu oaspeți. `↑`/`↓` plimbă selecția (cu
  întoarcere la capete), `Enter` sau clicul deschide rezervarea aleasă,
  `Esc` închide. Sub 3 caractere nu pleacă nicio cerere (indexurile
  trigram n-au ce căuta într-un `%ab%`); după ultima tastă se așteaptă
  200 ms; un răspuns întârziat pentru un text vechi nu acoperă unul nou.
  Camerista n-are caseta: RLS i-ar da oricum zero rânduri.
- **Pe server**: funcția `cauta_rezervari(p_text, p_limita)` (migrarea
  `cautare_globala`, oglindită în `schema.sql`), `security invoker`, deci
  RLS pe `reservations` și `guests` se aplică. Caută în același timp după
  numele și telefonul titularului (indexurile trigram existente), numele
  și telefonul ocupantului de pe rezervare (două indexuri trigram noi,
  `reservations_ocupant_trgm`, `reservations_ocupant_telefon_trgm`),
  numele camerei (exact — „100" nu aduce nouă camere) și codul de oaspete
  (exact, cu majusculele lui). Fiecare cale își folosește indexul ei
  (`union all` de id-uri, nu un `or` peste un join). Rândul spune și **de
  ce** a ieșit (`potrivire`: cod, cameră, telefon, titular, ocupant) — pe
  ecran apare ca etichetă, ca recepția să nu se întrebe de ce apare un
  Popescu la căutarea „1005" (are 1005 în telefon). Ordinea: sejurul în
  curs primul, apoi cea mai apropiată sosire de azi. Cel mult 12 rânduri
  (plafon 50).
- **Rezultatul**: rezervarea vine ca valoare compusă și trece prin același
  `camelRes` ca restul aplicației (`src/data/cautare.js`); alături vin
  numele și telefonul titularului, camera și grupul, ca lista să se
  deseneze fără altă cerere. Alegerea trimite calendarului o intenție
  `deschide` (`lib/scurtaturi.js`): calendarul sare cu o zi înaintea
  sosirii (bara nu e lipită de marginea grilei), lărgirea ferestrei aduce
  perioada, iar fișa rezervării se deschide **abia când rândul ei e în
  stare** — altfel butoanele din fișă (check-in, mutare) n-ar avea pe ce
  lucra. Dacă nu apare în 10 secunde (ștearsă între timp), se renunță
  tăcut.

### 1.3 Verificare

- `src/cautare.test.js`: textul curățat și pragul de 3 caractere; rândul
  de pe server trece prin `camelRes`; descrierea unui rezultat (titular sau
  ocupant, perioada cu anul o singură dată, statusul, ce s-a potrivit);
  selecția cu săgețile. `src/cautare-ecran.test.js`: o singură cerere după
  pauză, cu textul curățat; sub 3 caractere nimic; săgeți, `Enter`, clic,
  `Esc`; eroarea de pe server se vede; un răspuns vechi nu acoperă unul nou.
- În bază, cu roluri impersonate în tranzacție anulată: „Brinza" și
  „brinza" dau aceleași 12 rânduri (`potrivire = nume`), limita se
  respectă, „1001" dă rezervările camerei (`camera`), „100" nimic, ultimele
  6 cifre ale unui telefon dau rândurile titularului (`telefon`), codul de
  oaspete dă exact un rând (`cod`) și zero cu litere mici, un fragment de
  nume de ocupant dă rânduri `ocupant`, textul gol / `%` / un șir fără
  sens dau zero; recepționerul vede rândurile, camerista zero. Advisorii de
  securitate: nimic nou.

### 1.4 Ce NU s-a schimbat

- Căutarea din Clienți (`cauta_oaspeti`) și cea din fișa de rezervare
  rămân pe oaspeți — au alt rost (alegi un client, nu o rezervare).
- Nu se caută în note, în numele grupului sau în orașul oaspetelui.
- Grupurile n-au un rezultat propriu: apar prin rezervările lor, cu numele
  grupului pe rând.

---

## 2. Scurtături de tastatură (C2)

### 2.1 Regula

Regulile sunt pure, în `src/lib/scurtaturi.js` (`decideScurtatura`);
Shell ascultă `keydown` o singură dată pe fereastră și le aplică:

| Tasta | Face |
|---|---|
| `Ctrl+K` / `Cmd+K`, `/` | căutarea globală |
| `N` | rezervare nouă (deschide calendarul dacă e nevoie) |
| `T` | calendarul la azi |
| `←` / `→` | o săptămână înapoi / înainte (doar în calendar) |
| `Esc` | închide dialogul (exista deja în `Dialog`) |

Literele și săgețile tac când scrii într-un câmp (`input`, `textarea`,
`select`, `contenteditable`) sau când un dialog e deschis
(`existaDialogDeschis` din `ui/primitive.jsx`, pe contorul de blocare al
dialogurilor) — altfel un „n" tastat într-o notă ar deschide o rezervare
nouă peste cea editată. `Ctrl+K` merge și dintr-un câmp; `/` merge și cu
Shift (tastatura germană). O tastă ținută apăsată nu repetă `N`/`T`;
săgețile da. `N` și căutarea nu există pentru cameristă.

Intențiile către calendar sunt obiecte cu un număr mereu diferit
(`intentie(tip)`): două apăsări de `→` una după alta sunt două intenții, nu
una pe care React ar lua-o drept aceeași valoare. Calendarul le aplică
printr-un singur plan (`planIntentie`): ce dialog deschide, la ce zi sare,
cu câte zile se mută, ce rezervare deschide după ce ajunge în fereastra ei.
Forma veche (`"group"` din Clienți) rămâne înțeleasă.

### 2.2 Verificare

`src/scurtaturi.test.js`: fiecare tastă cu și fără modificatori, din câmp
și din afara lui, cu dialog deschis (totul tace, inclusiv `Ctrl+K`),
repetarea; planul fiecărei intenții (azi = miezul nopții de la Vaslui,
`deschide` = o zi înaintea sosirii).

### 2.3 Ce NU s-a schimbat

- Nu există listă de scurtături pe ecran; sunt în titlul lupei
  („Ctrl+K sau /") și în rândul de ajutor din casetă.
- Nicio scurtătură pentru check-in / check-out / salvare — auditul nu le
  cerea, iar o literă care schimbă statusul unei rezervări fără confirmare
  e o greșeală care așteaptă să se întâmple.

---

## 3. Conflictul de concurență: ce s-a schimbat și ce rămâne (C5)

### 3.1 Ce era greșit

Baza refuză o scriere cu `updated_at` mai vechi decât al ei (triggerul
`reservations_stamp_updated_at`) — corect. Dar aplicația spunea doar
„altcineva a modificat aceleași date între timp", reîncărca tot și cerea
reluarea modificării: omul nu vedea *ce* se schimbase, iar ce scrisese el se
pierdea din ecran.

### 3.2 Cum funcționează

- **Trei versiuni** (`src/lib/conflict.js`): *baza* (ce era în browser când a
  pornit modificarea), *a mea* (ce vrea să scrie), *a lor* (ce e acum în
  bază). La refuz (`40001` sau textul triggerului), `updateReservations`
  aduce rândurile refuzate de pe server (`src/data/conflict.js`), reține
  doar cele cu stampila mai nouă decât cea trimisă și, tot din jurnal (pe
  `reservation_id`, faza 2 A4), cine a umblat ultima dată la ele. Dacă
  refuzul nu se poate explica așa, se cade pe drumul vechi (mesaj +
  reîncărcare).
- **Dialogul** (`src/features/conflict.jsx`): pentru fiecare rezervare,
  câmpurile în care *a mea* sau *a lor* diferă de bază, cu numele lor
  (cameră, client, grup, client de facturare — nu id-uri), coloanele „A ta"
  / „A lor", cine a modificat și când, și marcajul **amândoi** pe câmpul pe
  care fiecare a pus altceva — singurul caz în care „păstrează a mea" chiar
  pierde ceva de-al lor. Momentele se compară ca momente („+00:00" de pe
  server și „.000Z" din browser sunt același lucru), lipsa ca lipsă (null,
  gol, nedefinit), listele pe conținut; `updated_at`, `guest_code`,
  `seeded` nu apar.
- **„Păstrează a mea"**: se pornește de la rândul lor și se pun peste DOAR
  câmpurile schimbate de mine — ce au schimbat ei în câmpuri pe care nu
  le-am atins rămâne; stampila e a lor, deci baza acceptă. Se scrie din nou
  toată lista (și celelalte modificări ale mele din aceeași salvare).
- **„Ia pe a lor"** sau închiderea dialogului (Esc, X): nimic nu se scrie —
  scrierea respinsă era una singură, atomică, deci niciun rând din ea n-a
  ajuns în bază — iar ecranul revine la ce era înaintea modificării, cu
  versiunea lor pe rândurile în conflict; un mesaj spune că ce ai modificat
  tu nu s-a salvat. Apelantul primește `false`, ca la orice salvare
  nereușită: fereastra rămâne deschisă cu ce ai scris, poți salva din nou
  (acum pe baza versiunii lor) sau închide.

### 3.3 Verificare

`src/conflict.test.js`: recunoașterea erorii; egalitatea canonică
(momente, lipsă, numere din formular, liste); diferențele (ale mele, ale
lor, „amândoi", nu și câmpurile de sistem); îmbinarea (ale mele rămân,
restul iau valorile lor, stampila e a lor, numele ocupantului se
recalculează); rândurile în conflict după stampilă; „lor" readuce ecranul
la ce era, inclusiv pentru celelalte rânduri nescrise din aceeași salvare.
`src/conflict-ecran.test.js`: dialogul arată nume, nu id-uri; marcajele;
butoanele; închiderea = null.

### 3.4 Ce NU s-a schimbat

- Triggerul și protocolul stampilei sunt neschimbate; nimic nou în bază.
- Grupurile (`res_groups`) și blocajele n-au stampilă, deci nici conflict:
  la ele rămâne „ultimul care scrie câștigă", ca înainte.
- Fereastra din care s-a salvat nu se reîmprospătează singură cu versiunea
  lor; o vezi în calendar după ce o închizi.

---

## 4. Offline: indicator și coadă de salvări (C8)

### 4.1 Ce era greșit

Când cădea internetul la recepție, aplicația nu spunea nimic înainte; la
prima salvare dădea „Conexiunea a eșuat", apoi **reîncărca datele** — care
nici ele nu veneau — și rămânea pe ecranul „Aplicația nu a putut porni".
Ce se apăsase (o bifare de curățenie, un check-in) era pierdut.

### 4.2 Cum funcționează

- **Indicatorul** (`src/features/retea.jsx`, în antet): nu apare deloc cât
  timp totul e în regulă. „Offline" când browserul pierde rețeaua
  (`navigator.onLine`, evenimentele `online`/`offline`), cu numărul de
  salvări care așteaptă; „Se trimite · N" când rețeaua a revenit și coada
  se golește. Titlul pastilei explică: ce salvezi rămâne în aplicație și
  pleacă la revenirea conexiunii — nu închide fila.
- **Coada** (`src/lib/coada-salvari.js`, pur; `src/data/coada.js`, rețea și
  browser): o scriere care pică **de rețea** — nu de verdict: drepturi,
  suprapunere, conflict de versiune, alea au `code` și rămân erori — intră
  în coadă, iar apelantul merge mai departe ca și cum s-ar fi scris; starea
  locală e deja actualizată optimist, ca la orice salvare. Intră: upsert-urile
  din `syncTable` (rezervări, grupuri, blocaje, tabelele mici), ștergerile
  din `stergeRanduri`, statusul camerelor (`room_status`) și intrările de
  jurnal. **Nu** intră RPC-urile (emitere de factură, încasare, stornare):
  acolo o cerere repetată ar putea număra de două ori; rămân erori, ca
  înainte.
- **Coalescere pe rând**: a doua salvare a aceluiași rând o înlocuiește pe
  prima (rămâne ultima formă, pe poziția primei); o ștergere scoate
  upsert-urile rândului; intrările de jurnal se adună. La trimitere,
  operațiile consecutive de același fel pe același tabel pleacă într-o
  singură cerere — o salvare de grup rămâne o singură instrucțiune.
- **Reîncercarea**: la `online`, la revenirea pe filă și la fiecare 20 s
  cât e ceva în coadă. Loturile pleacă în ordine; la o nouă eroare de rețea
  se oprește și păstrează restul; la un verdict al bazei (de exemplu
  „modificată de altcineva" pentru o rezervare editată offline) lotul e scos
  și eroarea ajunge la om ca orice eroare de salvare (mesaj + reîncărcare
  — dialogul C5 nu se poate deschide aici, baza de pornire nu mai există).
  Stampilele rezervărilor și rândurile de `room_status` scrise atunci
  intră în stare ca la o salvare obișnuită.
- **Memorie, nu disc**: coada trăiește în filă. La închiderea filei cu
  salvări neurcate browserul întreabă (`beforeunload`); la prima operație
  intrată într-o coadă goală apare un mesaj o singură dată. Fără IndexedDB,
  fără sync engine — auditul (§5) cere exact asta.
- `raporteazaEroare` nu mai reîncarcă datele la o eroare de rețea (n-ar
  aduce nimic, ar lăsa aplicația pe ecranul de pornire eșuată); arată doar
  mesajul.

### 4.3 Verificare

`src/coada-salvari.test.js`: recunoașterea erorilor de transport în formele
lor reale (și un verdict cu `code` nu e rețea, oricât ar suna textul);
înlocuirea pe rând, ștergerea care scoate upsert-urile, `room_status` pe
`room_id`, jurnalul care se adună; loturile; rularea în ordine, oprirea la
rețea cu păstrarea restului, verdictul care scoate lotul și merge mai
departe, o singură rulare o dată, operațiile adăugate în timpul rulării.
`src/retea-ecran.test.js`: pastila lipsește când totul e în regulă,
„Offline" și numărul salvărilor, „Se trimite" la revenire, dispare când
coada se golește. În previzualizare: evenimentele `offline`/`online`
trimise din consolă arată și ascund pastila.

### 4.4 Ce NU s-a schimbat

- Citirile (lărgirea ferestrei calendarului, căutarea, istoricul) nu se
  reîncearcă automat: dau mesajul lor și se refac la următoarea acțiune.
- Realtime își reface singur canalul (faza 2, B3); coada nu se ocupă de el.
- O salvare făcută offline și rămasă în coadă se pierde dacă fila e
  închisă forțat (după avertisment) sau dacă browserul e omorât.

---

## 5. Calendarul pe tabletă: 7 zile pe ecran și pinch (C3)

### 5.1 Ce era

Lățimea zilei avea două trepte: 66px (multe zile, nume trunchiate) și
190px („zile late", implicită din 9 septembrie 2026). Pe o tabletă de 10"
în landscape (1024px) zilele late arată 5 zile pe ecran; cele înguste 14,
dar fără nume. Coloana cu numele camerei (`.cal-roomcell`) și rândul cu
zilele (`.cal-head`) erau deja lipicioase — punctul din audit cerea și
asta, nu mai e nimic de făcut acolo.

### 5.2 Cum funcționează

- **Trei trepte** (`src/lib/calendar-latime.js`): *înguste* (66px), *7 zile
  pe ecran* și *late* (190px). „7 zile" împarte lățimea grilei (măsurată cu
  `ResizeObserver`, fără coloana camerei de 78px) la șapte: ~135px pe zi pe
  1024px, ~184px pe 1366px; sub 66px nu coboară (pe telefon rămâne
  derulabil). Butonul din bară le parcurge în cerc; eticheta spune treapta
  curentă și următoarea.
- **Implicit**: „7 zile" pe tabletă (deget + ecran de la 700px), „late" pe
  telefon și desktop (ca până acum). Alegerea rămâne în browser
  (`localStorage`, `pms:calendar:latime`).
- **Pinch pe grilă**: două degete depărtate cu 30% = o treaptă mai lată,
  apropiate = mai îngustă; referința se mută după fiecare pas, deci un pinch
  continuu urcă treptele pe rând; la capete se oprește (nu se învârte).
  `.cal-scroll` primește `touch-action: pan-x pan-y`: derularea rămâne a
  browserului, zoom-ul paginii pe grilă nu mai pornește — gestul ajunge la
  aplicație. Restul paginii se poate mări în continuare.
- Densitatea rândurilor (`dense`, butonul cu rânduri) rămâne separată și
  neschimbată.

### 5.3 Verificare

`src/calendar-latime.test.js`: implicitul pe tabletă / telefon / desktop;
alegerea salvată doar dacă e validă; ciclul butonului și pasul pinch-ului cu
oprire la capete; pixelii pe zi (1024 → 135, 1366 → 184, telefon → 66);
pragul pinch-ului (30%, tremurul nu schimbă nimic). În previzualizare, pe
lățime de tabletă: butonul trece prin cele trei trepte și grila se
redimensionează.

### 5.4 Ce NU s-a schimbat

- Fereastra rămâne de 30 de zile, cu creșterea prin derulare pe ecranele
  tactile; „7 zile" e o lățime de coloană, nu o fereastră mai scurtă.
- Nu s-a măsurat cu utilizatori (auditul o cerea); dacă recepția vrea altă
  treaptă implicită pe tabletă, e o constantă în `latimeImplicita`.

---

## 6. Fișa de rezervare în secțiuni pliabile (C4)

### 6.1 Ce era

Un singur formular lung: cameră, client, ocupant, persoane, sursă, date,
preț, folio, etichete, status, note, mesaje, ore, acces, fișă de cazare —
derulat de sus până jos la fiecare deschidere, chiar și pentru o schimbare
de o secundă.

### 6.2 Cum funcționează

- **Cinci secțiuni** (`src/ui/sectiune.jsx`, `src/lib/fisa-sectiuni.js`), în
  ordinea din audit după prima: **Sejur** (cameră / camerele grupului sau
  blocajului, datele, orele cazării, statusul, sursa), **Oaspete** (client,
  ocupant, adulți / copii), **Preț** (nopți × camere, prețul manual, folio-ul
  la editare), **Note** (etichete, note, mesaje), **Acces și fișă de cazare**
  (la editare). Capul fiecărei secțiuni e un buton (`aria-expanded`,
  `aria-controls`); corpul rămâne în DOM (`hidden`), deci ce e scris în
  câmpuri nu se pierde la pliere.
- **Rezumatul** din capul secțiunii, când e pliată: „Popescu Ana · ocupant
  Olaru Florin · 2 adulți", „1005 · 17.10 → 19.10 (2 nopți) · Confirmată",
  „600 lei · preț manual", „vip · „vine târziu” · 2 mesaje", „Orele 14:00 →
  12:00". Ziua se ia din șirul formularului, nu prin `Date` — la vest de
  Greenwich ar fi alunecat o zi. La editare, sub titlul dialogului stă și un
  rând de rezumat al întregii rezervări (cine · cameră · perioadă · nopți ·
  preț · status).
- **Implicit**: la o rezervare nouă sunt deschise Sejur, Oaspete și Preț
  (ce e de completat), Note pliată; la editare **toate** stau pliate — desfaci
  ce ai de schimbat. O eroare de validare le desface pe toate, ca să se vadă
  câmpul cu pricina. Alegerea nu se ține minte între deschideri: o secțiune
  pliată de la o editare ar fi ascuns „Alege clientul" la următoarea
  rezervare nouă.
- Orele cazării s-au mutat lângă date (în Sejur); până acum stăteau deasupra
  secțiunii de acces, lângă butoanele pe care le influențează — acum Acces e
  la un clic distanță, iar nota „Codul de acces urmează orele de aici" a
  rămas sub buton. Butoanele rapide (fișa de sosire, check-in / check-out),
  eroarea și Salvează / Șterge rămân în afara secțiunilor, jos.

### 6.3 Verificare

`src/fisa-sectiuni.test.js`: implicitul nou / editare; fiecare rezumat
(ocupantul doar dacă e altul, camerele ca listă sau ca număr, ziua din șir,
nota scurtată, „Fără note"); rândul din capul dialogului.
`src/sectiune-ecran.test.js`: cap cu `aria-expanded` și `aria-controls`,
rezumatul doar pliat, corpul ascuns dar prezent, câmpul își păstrează
valoarea la pliere, capul e `type="button"`. În previzualizare: „N"
deschide fișa nouă cu Sejur / Oaspete / Preț desfăcute; editarea unei
rezervări deschide totul pliat, cu rezumatele.

### 6.4 Ce NU s-a schimbat

- Câmpurile, validările și salvarea sunt aceleași; nimic în bază.
- Fișa de vizualizare (`ReservationViewModal`) și editorul de grup nu au
  secțiuni — nu erau în audit; se pot pune pe același tipar.

---

## 7. Rapoarte: delta față de anul trecut și export CSV (C6)

### 7.1 Ce era

Cele patru carduri (ocupare, venit, ADR, RevPAR) spuneau cifra lunii și
atât; ca să știi dacă e bine sau rău trebuia să dai o lună înapoi, să ții
minte, să revii. Nicio cale de a scoate cifrele din aplicație.

### 7.2 Cum funcționează

- **Două luni, o cerere**: ecranul cere `raport_luna` și pentru aceeași lună a
  anului trecut (în paralel); dacă a doua nu vine, cardurile rămân fără
  delta, nu fără cifre.
- **Delta** (`deltaRaport`, `deltaFata` în `src/lib/rapoarte.js`): ocuparea în
  **puncte procentuale** („+3 pp" spune mai mult decât „+25 %" când
  ocuparea a trecut de la 12 la 15), venitul, ADR și RevPAR în procente;
  minus tipografic; verde când e mai mult, roșu când e mai puțin. Fără
  bază (0 anul trecut) nu se inventează un procent. O lună a anului trecut
  fără nicio noapte și niciun leu nu e „0 %", e necunoscută (dinaintea
  aplicației): cardurile rămân fără delta și un rând spune „Fără cifre
  pentru septembrie 2025". Cardul `Stat` din `ui/primitive.jsx` are un
  prop nou, `delta`; titlul lui spune față de ce lună e.
- **Export CSV** (`csvRaport`, butonul din bară): luna, zilele (camere
  ocupate, venit), totalul (camere-nopți, capacitate, ocupare, venit, ADR,
  RevPAR), sursele, tipurile de cameră, protocolul — **aceleași cifre ca pe
  ecran**, din același `statisticiDinSql`, nimic recalculat. Separator „;"
  (Excel în română), BOM UTF-8 pentru diacritice, nume `raport-2026-09.csv`.
  Descărcarea e în `src/lib/descarcare.js` (mutată din facturare, unde
  rămâne cu numele vechi pentru exportul contabil). Exportul se trece în
  jurnal.

### 7.3 Verificare

`src/rapoarte-delta.test.js`: procentele și punctele, semnul, fără bază;
cele patru carduri din două luni; luna necunoscută → fără delta; CSV-ul
rând cu rând (luna, zilele, totalul, sursele, tipurile, protocolul), aceleași
cifre ca pe ecran, ghilimelele la „;", fără protocol fără tabelul lui,
numele fișierului. În previzualizare: ecranul Rapoarte arată cardurile cu
delta (sau rândul „fără cifre") și butonul de export.

### 7.4 Ce NU s-a schimbat

- Cifrele lunii vin tot din `raport_luna`; nimic nou în bază.
- Comparația e doar cu aceeași lună a anului trecut (cum cere auditul), nu
  cu luna precedentă.
- Graficul zilnic, sursele și tipurile n-au delta — doar cele patru carduri.
