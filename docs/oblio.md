# Facturarea prin Oblio

*Implementată pe 16 septembrie 2026.* Facturile se emit în contul Oblio.eu
al pensiunii, iar PMS-ul păstrează o copie. Planul de implementare, cu
deciziile luate și cele opt sarcini: [`oblio-plan.md`](oblio-plan.md).

## Cum funcționează

Draftul facturii se face exact ca până acum, dintr-un folio, cu liniile și
clientul din `billing_customers`. Ce e nou e butonul „Emite prin Oblio” din
fereastra facturii (`src/features/facturare/factura.jsx`): apăsat, cheamă
funcția edge `oblio-facturare` cu acțiunea `emite`. Primul lucru pe care-l
face funcția, înainte să vorbească cu Oblio, e să blocheze draftul în
Postgres cu `oblio_incepe_emiterea` — pune `oblio_stare = 'in_curs'` și îi
dă o cheie de idempotență fixă, `pms-<id>`. Cheia asta face reîncercarea
sigură: dacă rețeaua cade sau butonul e apăsat a doua oară, Oblio primește
aceeași cheie și știe că e aceeași factură, nu una nouă.

Cu draftul blocat, funcția citește factura, clientul și liniile ei, ia
cotele de TVA din nomenclatorul Oblio (`GET /api/nomenclature/vat_rates`) și
le potrivește pe cele din PMS după procent — 21, 11 sau 0 — nu după nume,
pentru că numele cotelor diferă de la un cont Oblio la altul. Abia apoi
trimite documentul cu `POST /api/docs/invoice`. Dacă Oblio acceptă,
`oblio_finalizeaza_emiterea` scrie în `invoices` tot ce contează: `series`,
`number` și forma exactă a numărului lor (`oblio_numar`, care poate avea
zerouri în față), linkul către PDF (`oblio_link`, arătat în fereastră și în
listă ca „PDF din Oblio”), `status = 'issued'` și `oblio_stare = 'emisa'`.
Dacă Oblio refuză — cotă lipsă, serie greșită, token expirat —
`oblio_marcheaza_eroare` lasă draftul neatins, cu `oblio_stare = 'eroare'`
și mesajul lor exact, sub butoanele ferestrei; omul corectează și apasă din
nou „Emite prin Oblio”, cu aceeași cheie. Celelalte cazuri de eșec (rețeaua
cade după ce Oblio a emis deja, două taburi apasă deodată) sunt în tabelul
de mai jos.

Anularea și stornarea trec tot întâi prin Oblio, niciodată doar prin PMS.
Anularea cheamă `PUT /api/docs/invoice/cancel`, apoi
`oblio_finalizeaza_anularea` trece factura pe `cancelled`. Stornarea trimite
un nou `POST /api/docs/invoice`, cu liniile originalului la cantități
negate și `referenceDocument: { type: "Factura", refund: 1 }` către factura
pe care o stornează; Oblio dă seria și numărul notei de credit, iar
`oblio_finalizeaza_stornarea` scrie rândul negativ cu acel număr, nu cu
următorul din seria locală. Regula care contează aici: o factură cu
`oblio_stare = 'emisa'` se anulează sau se stornează prin Oblio indiferent
de poziția curentă a comutatorului `activ` — decide starea facturii, nu
setarea de azi, ca să nu rămână la Oblio un document „viu” pe care PMS-ul
îl crede anulat.

e-Factura e opțională și separată de emitere: fie automat, imediat după ce
Oblio a emis, dacă „Trimite în SPV (e-Factura) imediat după emitere” e
bifat în setări, fie manual, oricând, din butonul „Trimite în SPV” al
ferestrei (`POST /api/docs/einvoice`). Codul întors de Oblio stă în
`oblio_efactura_cod` (-1 netrimisă, 0 în procesare, 1 trimisă, 2 cu erori)
și se vede ca eticheta „SPV: …” pe factură și pe rândul ei din listă.
Comutatorul `activ`, CIF-ul, seria, punctul de lucru și bifa de e-Factura
stau împreună în `app_state`, la cheia `pms:oblio:v1`, scrisă doar de admin
(politica RLS de pe `app_state`); același loc — tabul „Oblio” din
Financiar, tot doar pentru admin — are și „Verifică legătura”, care
întreabă Oblio cine e firma, ce serii de facturi are și ce cote de TVA,
fără să schimbe nimic. Cât `activ` e oprit, PMS-ul emite exact ca înainte,
cu `emite_factura` și seria locală, neatinse. Secretele `OBLIO_CLIENT_ID`
(emailul contului) și `OBLIO_CLIENT_SECRET` (tokenul API) stau doar în
Supabase → Edge Functions → Secrets, niciodată în repo sau în bază; tokenul
obținut cu ele trăiește o oră în memoria instanței funcției, exact ca la
TTLock.

## Ce se întâmplă când ceva pică

| Pasul care pică | Ce rămâne | Ce face omul |
|---|---|---|
| Oblio refuză (cotă lipsă, serie greșită, token expirat) | draftul, cu `oblio_stare = eroare` și mesajul lor sub butoane | corectează, apasă din nou (aceeași cheie de idempotență) |
| Rețeaua cade după ce Oblio a emis | Oblio are documentul; PMS-ul are draftul | apasă din nou: aceeași cheie, Oblio nu emite a doua oară |
| Oblio a emis, PMS-ul n-a putut scrie | mesaj explicit cu seria și numărul din Oblio | verifică în Oblio, apoi reîncearcă (vezi mai jos) |
| Două taburi apasă deodată | a doua cerere: „Emiterea e deja în curs” | nimic |

## Configurarea (o singură dată, de Ovidiu)

1. În Oblio: Setări → Date cont → tokenul API; seria facturilor (ex. `LL`);
   cotele de TVA 21 / 11 / 0; opțional „Trimite automat e-Factura în SPV”.
2. În Supabase → Edge Functions → Secrets: `OBLIO_CLIENT_ID` (emailul
   contului), `OBLIO_CLIENT_SECRET` (tokenul).
3. În PMS → Financiar → Oblio: CIF-ul, seria, „Verifică legătura”, apoi
   „Emite facturile prin Oblio”.
4. Prima factură reală: una mică, apoi stornată — Oblio n-are sandbox.

## Tabele, funcții, fișiere

| Ce | Unde |
|---|---|
| coloanele `oblio_*` | `invoices`, schema.sql |
| `oblio_incepe_emiterea`, `oblio_marcheaza_eroare`, `oblio_finalizeaza_emiterea`, `oblio_finalizeaza_stornarea`, `oblio_finalizeaza_anularea`, `oblio_actualizeaza_efactura` | schema.sql; doar `service_role` |
| clientul API | `supabase/functions/oblio-facturare/oblio.ts` (+ `src/oblio-client.test.js`) |
| funcția edge | `supabase/functions/oblio-facturare/index.ts` |
| setările și apelul din browser | `src/data/oblio.js` (+ `src/oblio-date.test.js`) |
| tabul de setări | `src/features/facturare/oblio.jsx` (+ `src/oblio-ecran.test.js`) |
| emiterea, anularea, stornarea | `src/features/facturare/emitere.jsx`, `factura.jsx` (+ `src/oblio-emitere.test.js`) |

## Ce NU s-a schimbat

Drumul vechi (`emite_factura`, `storneaza_factura`, seria locală) rămâne
întreg și e cel folosit cât `activ` e oprit. Coala tipăribilă din PMS
rămâne. Încasările și chitanțele rămân în PMS (sincronizarea lor în Oblio
e un plan separat).
