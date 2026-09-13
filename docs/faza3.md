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
| 4 | C8 — indicator offline + coadă de salvări | de făcut |
| 5 | C3 — calendarul pe tabletă (7 zile, coloană lipicioasă) | de făcut |
| 6 | C4 — fișa de rezervare cu secțiuni pliabile | de făcut |
| 7 | C6 — rapoarte cu delta față de anul trecut + CSV | de făcut |
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
