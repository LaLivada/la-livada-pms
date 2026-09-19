# Mesaje de bun venit pe televizoare (Samsung LYNK Cloud)

Cerința, de la care pornește tot ce urmează: **oaspetele face check-in la
recepție, iar când deschide televizorul din cameră scrie acolo numele lui.**
La plecare, mesajul dispare.

Scris și implementat pe 18 septembrie 2026.

---

## 1. Ce e verificat și ce nu

Distincția stă prima, fiindcă de ea depinde ce se poate pune în producție azi.

**Verificat**, în paginile publice Samsung (18 septembrie 2026):

- LYNK Cloud e platforma cloud prin care se administrează televizoarele de
  hotel: conținut, aparate, și **mesajul de bun venit per cameră**. Samsung
  descrie exact fluxul cerut aici — datele oaspetelui vin din PMS-ul
  proprietății, iar televizorul îl întâmpină pe nume („Welcome John Smith, we
  hope you enjoy your stay with us!"), și menționează un **Open API** pentru
  integrări.
  <https://www.samsung.com/us/business/solutions/industries/hospitality/lynk-cloud/>
- Aceeași funcție există și în varianta locală, LYNK REACH 4.0, pentru
  proprietățile care țin serverul la ele.
  <https://www.samsung.com/us/business/solutions/industries/hospitality/samsung-lynk--reach/>

**Neverificat, și de aceea izolat într-un singur fișier**: contractul REST
propriu-zis — adresele, numele câmpurilor, forma tokenului. Samsung nu publică
documentația Open API; ea vine odată cu contul de proprietate, de la
partenerul care face instalarea. Ce e scris în
`supabase/functions/tv-provider/providers/lynk.ts` e forma obișnuită a unui
astfel de API (OAuth2 *client credentials* + REST pe proprietate și aparat),
pusă într-un singur loc — constantele `CAI` și cele trei funcții de citire a
răspunsului (`listaDin`, `idDin`, `onlineDin`) — ca să poată fi corectată
dintr-o privire când sosesc credențialele.

**Până atunci integrarea merge pe furnizorul `simulare`**: tot lanțul
(check-in → mesaj → mutare → check-out → jurnal) funcționează și se poate
verifica, dar nimic nu pleacă spre vreun televizor real. Alegerea e explicită,
dintr-o setare, niciodată o rezervă automată — exact ca la yale: un cont care
nu răspunde n-are voie să se transforme tăcut în „mesaje trimise cu succes".

## 2. Din ce e făcută

| Bucata | Unde | Ce face |
|---|---|---|
| Logica pură | `src/lib/tv.js` | Șablonul, limba, plafoanele, decizia „ce se face după o modificare de rezervare". Fără rețea, fără bază. Testată în `src/tv.test.js`. |
| Funcția edge | `supabase/functions/tv-provider/` | Singurul drum către LYNK. Citește singură rezervarea, camera și oaspetele. |
| Furnizori | `…/providers/lynk.ts`, `…/providers/simulare.ts` | Cel real și cel simulat, cu aceeași interfață. |
| Date | `src/data/televizoare.js` | Citirea stării, maparea pe camere, jurnalul, apelul funcției edge. |
| Acțiuni pe rezervare | `src/features/tv-mesaje.js` | Check-in, check-out, reconciliere după editare. |
| Ecran | `src/features/televizoare.jsx` | Camere · Aparate · Mesaj · Istoric. Testat în `src/televizoare-ecran.test.js`. |
| Schemă | `tv_devices`, `tv_messages` | Migrația `20260918211500_lynk_mesaje_tv.sql`. |

### De ce o funcție edge, și nu apeluri directe din browser

Aceleași trei motive ca la yale și la relee, în ordinea importanței:

1. Credențialele contului LYNK administrează **toate** televizoarele
   proprietății. Un bundle de browser e public prin definiție.
2. Interfața n-are voie să spună CE scrie pe ecranul unei camere. Funcția
   primește id-ul rezervării și citește singură restul; altfel, din DevTools
   s-ar putea scrie orice pe televizorul oricui.
3. Scrierea în `tv_messages` e rezervată funcției (service_role). Un jurnal pe
   care actorul îl poate scrie singur nu spune nimic.

## 3. Ce se întâmplă și când

| Moment | Ce se face | Unde |
|---|---|---|
| Check-in | `welcome` — mesajul se scrie pe televizoarele camerei | `doCheckIn` |
| Check-out | `clear` — ecranul se golește | `doCheckOut` |
| Cameră schimbată | `clear` pe camera veche + `welcome` pe cea nouă | `reconciliazaTv` |
| Ocupant sau dată de plecare schimbate | `welcome` — mesajul se rescrie | `reconciliazaTv` |
| Anulare / no-show după cazare | `clear` | `reconciliazaTv` |

**Nimic din toate astea nu blochează operațiunea hotelieră.** Un mesaj pe un
televizor e ultimul lucru din pensiune care are voie să răstoarne un check-in:
oaspetele stă la recepție. La check-in apelul nici nu e așteptat; la check-out
e, fiindcă acolo nu ține nimeni pe nimeni la ghișeu, iar recepția trebuie să
afle pe loc dacă a rămas ceva pe ecran.

**Camerele fără televizor mapat nu produc niciun avertisment.** Funcția
răspunde `fara: true`, iar ecranul tace. La început, toate camerele sunt așa;
un avertisment la fiecare check-in ar învăța pe toată lumea să ignore
avertismentele.

**La ștergerea pe cameră, cine e cazat acum are prioritate.** Dacă în camera
golită s-a cazat între timp altcineva (mutare încrucișată, cameră eliberată și
reocupată în aceeași zi), funcția scrie mesajul LUI în loc să golească
ecranul. Altfel, un oaspete real ar rămâne fără mesaj fără ca cineva să afle.

## 4. Mesajul

Două șabloane, română și engleză, alese după țara oaspetelui (Moldova
primește româna — e limba pe care o citește). Fără bold și fără emoji,
spre deosebire de mesajul de pe WhatsApp: `**text**` ar ajunge pe ecran cu
asteriscuri cu tot, iar un emoji depinde de fontul televizorului, care pe
firmware-urile de hotel îl arată des ca dreptunghi gol.

```
Bun venit, {{guest_name}}!
Vă dorim un sejur plăcut la {{hotel_name}}.
Camera {{room_number}} · Wi-Fi: {{wifi_name}}
Recepție: {{support_phone}}
```

Chei: `guest_name`, `hotel_name`, `room_number`, `wifi_name`,
`wifi_password`, `support_phone`, `checkout_date`, `checkout_time`, `nights`.

Trei reguli care nu se văd din șablon:

- **Un rând rămas fără valoare dispare**, iar dintr-un rând cu două bucăți
  dispare doar bucata goală: „Camera 1003 · Wi-Fi:" ajunge pe ecran ca
  „Camera 1003". De-aia rândul de Wi-Fi poate sta liniștit în șablon și cât
  timp rețeaua nu e completată în setări.
- **Numele e al ocupantului, nu al titularului.** La un grup de zece camere,
  titularul e unul singur; „Bun venit, Ion Popescu" pe toate cele zece ecrane
  ar fi greșit în nouă din ele. Un nume prea lung se scurtează la prenume:
  un banner de televizor are lățimea lui.
- **Plafon de 200 de caractere și 6 rânduri**, tăiat pe cuvânt. Plafonul e al
  nostru, nu al Samsung-ului: un text mai lung fie se taie de la mijloc, fie
  iese din casetă, și n-am afla-o din răspunsul API-ului, care raportează
  succes.

Setarea `faraDiacritice` scoate ș/ț/ă/î/â. **Nu e implicită**: televizoarele
Samsung de hotel din ultimii ani afișează UTF-8 fără probleme. Există pentru
cazul în care un aparat mai vechi arată dreptunghiuri — atunci „Bun venit,
Stefan" e mai bun decât „Bun venit, tefan".

## 5. Configurare

**Secretele funcției edge** (Supabase → Edge Functions → Secrets; nu intră
niciodată în repo):

| Secret | Ce e |
|---|---|
| `LYNK_API_BASE` | Adresa API-ului contului. Nu e un domeniu universal — vine cu contul, ca `SHELLY_SERVER_URI`. |
| `LYNK_CLIENT_ID`, `LYNK_CLIENT_SECRET` | Credențialele Open API ale proprietății. |
| `LYNK_SITE_ID` | Proprietatea din cont. Un cont poate administra mai multe clădiri. |

**Din PMS** (Setări → Televizoare, doar adminul — cheia `pms:tv:v1` e închisă
pentru recepție prin RLS, ca `pms:access:v1`):

1. „Aparate" → **Sincronizează**: aduce televizoarele din cont. Nu le leagă
   singură de camere — un televizor pus pe camera greșită scrie numele unui
   oaspete pe ecranul altuia, deci legătura o face un om, uitându-se la un
   aparat real. Propunerea din cont („în cont: 1003") se arată, dar nu leagă.
2. „Mesaj" → completează numele pensiunii, rețeaua Wi-Fi, telefonul recepției,
   verifică previzualizarea (se face cu datele unei cazări în curs, dacă
   există — un nume real e cel care dă pe-afară din plafon, nu unul inventat).
3. „Mesaj" → **Furnizor: Samsung LYNK Cloud**, după ce secretele sunt puse.
   Până atunci rămâne pe simulare, iar ecranul o spune la vedere.

## 6. Ce s-a lăsat deoparte, și de ce

- **Canalul, volumul, pornirea televizorului.** LYNK le poate, dar cerința e
  mesajul de bun venit. Un aparat care pornește singur în cameră e o decizie
  hotelieră, nu una tehnică.
- **Un ciclu periodic de reconciliere** (pg_cron), ca la relee. Mesajul e o
  stare ținută în cloud-ul Samsung, nu un releu care poate fi comutat de la
  perete: se schimbă doar când îl schimbăm noi. Dacă se dovedește că se
  pierde (televizor resetat din fabrică, aparat schimbat), reconcilierea se
  adaugă peste `tv_devices.last_message`, care e exact starea de comparat.
- **Trimiterea pentru o rezervare necazată.** Funcția o refuză explicit
  (`reason: "necazat"`): un „Bun venit" apărut cu trei zile înainte, pe un
  televizor din care tocmai a plecat altcineva, e mai rău decât niciunul.

## 7. Când sosesc credențialele

Ce e de făcut, în ordine:

1. Pune cele patru secrete și cere partenerului Samsung documentația Open API
   a contului.
2. Compară-o cu `CAI` din `providers/lynk.ts` și corectează adresele; dacă
   ștergerea mesajului nu există ca `DELETE`, înlocuiește-o cu `enabled: false`
   (e scris acolo, lângă funcție).
3. Verifică forma răspunsului la listarea aparatelor și, dacă e nevoie,
   ajustează `listaDin`/`idDin`/`onlineDin`. Restul codului nu se atinge.
4. Sincronizează, mapează o singură cameră, comută pe `lynk` și fă un
   check-in de probă pe ea. Jurnalul din „Istoric" spune exact ce a plecat.
