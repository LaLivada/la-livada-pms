# Paginile legale de pe rezervari.lalivada.ro

Cerute de NETOPIA Payments la activarea plății cu cardul (16 septembrie
2026), pe lista lor de verificare: termeni și condiții cu entitatea juridică
și rolul ei, politică de livrare, politică de anulare, politică de
confidențialitate și GDPR, o cale online de retragere din contract (art. 11¹
din OUG 34/2014), sigla NETOPIA în subsol. Ovidiu a cerut ca toate linkurile
din subsol să rămână pe rezervari.lalivada.ro, nu pe lalivada.ro.

## Paginile

| Adresă | Fișier | Ce spune |
|---|---|---|
| `/termeni/` | `booking/termeni/index.html` | S.C. OVISER S.R.L., CUI RO33918057, J2014000396379; rolul de comerciant direct (prestează, vinde în nume propriu, emite factura); rezervarea, prețurile, plata (la sosire; cu cardul prin NETOPIA când e pornită), anularea, dreptul de retragere (art. 16 lit. l exceptează cazarea, art. 11¹ cere calea online), reclamații (ANPC, SOL), legea română |
| `/livrare/` | `booking/livrare/index.html` | nu se livrează nimic: serviciul se prestează la sediu, la datele alese; ce primește omul și când |
| `/anulare/` | `booking/anulare/index.html` | **la anulare se încasează integral prima noapte de cazare**; restul se restituie pe același card în cel mult 14 zile; neprezentarea = anulare; ținerea neconfirmată nu costă nimic |
| `/retragere/` | `booking/retragere/index.html` + `retragere.js` | formularul online de retragere |
| `/confidentialitate/` | `booking/confidentialitate/index.html` | datele cerute, unde ajung (Supabase eu-central-1, Resend, NETOPIA, Oblio, Vercel), cât se păstrează, drepturile GDPR, ANSPDCP |
| `/cookies/` | `booking/cookies/index.html` | niciun cookie, nicio măsurare; ce se încarcă de la terți |

Politica de anulare e scrisă în trei locuri, cu același text: pagina de mai
sus, caseta „Sigur anulezi?” din `src/booking/App.jsx` și emailul de
confirmare din `supabase/functions/booking-email`. Dacă se schimbă, se
schimbă în toate trei.

Perioadele de păstrare din pagina de confidențialitate (10 ani pentru
documentele contabile, 3 ani pentru cereri) sunt presupuneri rezonabile
scrise de Claude, neconfirmate de Ovidiu la data scrierii.

## Antetul și subsolul, o singură dată

Cele șapte pagini poartă același antet și subsol, din `booking/_antet.html`
și `booking/_subsol.html`. Fiecare pagină are doar marcajele
`<!-- @antet film=true|false -->` și `<!-- @subsol -->`; plugin-ul `partiale`
din `vite.booking.config.js` le înlocuiește, la fel în dev și la build.
`film=true` doar pe prima pagină, unde bara pleacă transparentă peste film.
Lista paginilor e `PAGINI`, în același fișier; o pagină nouă înseamnă un
folder cu `index.html` și un nume în listă.

Subsolul are, din aceeași zi: firma și CUI-ul sub copyright, WhatsApp ·
Instagram · Facebook pe un rând în coloana Contact, cele opt linkuri legale
(șase pagini plus ANPC și SOL) și sigla NETOPIA. Sigla vine din scriptul
oficial din mediakit-ul comerciantului (`https://mny.ro/npId.js?p=169004`),
care pune singur imaginea înaintea lui, albă sau neagră după
`data-contrast-color` — aici cărbunele subsolului, `#22221f`. E un script
terț fără SRI, fiindcă NETOPIA îl poate schimba oricând; alternativa, dacă
deranjează, e `<img src="https://mny.ro/np-white-0.svg?id=169004">` direct.

## Formularul de retragere

`booking/retragere/retragere.js` validează în browser cu
`src/lib/retragere.js` (testat în `src/retragere-cerere.test.js`) și trimite
la funcția edge `retragere`, care are aceleași reguli copiate (Deno nu importă
din `src/`). Funcția:

1. răspunde `{ok:true}` fără să facă nimic dacă e plin câmpul-capcană
   `website`;
2. refuză cu 400 și `erori` pe câmp ce nu trece validarea;
3. refuză cu 429 a șasea cerere de pe același email într-o oră;
4. **scrie întâi** rândul în `public.cereri_retragere` (RLS fără politici,
   drepturi luate de la `public`, `anon`, `authenticated`; scrie doar cheia
   de serviciu), apoi trimite prin Resend emailul către recepție
   (`RETRAGERE_EMAIL_CATRE`, implicit office@lalivada.com, cu `reply_to` pe
   adresa clientului) și copia clientului, și marchează `email_trimis`.

Dacă Resend cade, cererea există și răspunsul e tot 200: omul și-a exercitat
dreptul când a apăsat „Trimite”. Cererile se citesc, deocamdată, doar din
tabel (Table Editor); nu au ecran în PMS.

Verificat pe 16 septembrie 2026 cu trei apeluri directe (capcană, câmpuri
greșite, cerere reală de test pe adresa lui Ovidiu, ambele emailuri plecate,
rândul de test șters apoi).

## Ce rămâne de făcut la activarea NETOPIA

- integrarea propriu-zisă a plății (pagina de plată, confirmarea, IPN);
- rambursarea pe card la anulare, minus prima noapte, pe care o promite
  politica de anulare;
- textul „Nu se cere plată online” din `src/booking/App.jsx` și „Plata se face
  la sosire” din emailul de confirmare devin condiționate de metoda aleasă.
