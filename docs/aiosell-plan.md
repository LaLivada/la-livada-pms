# Sincronizare cu Airbnb și Booking.com prin Aiosell — plan de implementare

Continuare la [`ical-ota-plan.md`](ical-ota-plan.md), care explică de ce Channex,
Beds24, Smoobu, MyAllocator și RoomCloud au fost respinse (90-180 €/lună la
16 camere) și de ce s-a ales, provizoriu, sincronizarea gratuită prin `.ics`.
Aiosell a apărut ulterior ca o a șasea variantă, cu API documentat public,
webhook real și — dacă prețul se confirmă în banda „per Hotel" — un cost
lunar sub bugetul de 25-30 €. **Acest document înlocuiește planul iCal doar
dacă prețul se confirmă**; până atunci, `.ics` rămâne varianta sigură.

## Cost — o singură cifră lipsește

Verificat direct pe [aiosell.com/pricing](https://aiosell.com/pricing/),
secțiunea „Channel Manager APIs Monthly Pricing", pachetul **API Standard**
(„Channel Manager Connect + Rates + Inventory + Reservations +
Restrictions" — exact ce ne trebuie), opțiunea „ideal for starters":

| Facturare | Preț |
|---|---|
| Per Hotel (o proprietate, mai multe tipuri de cameră) | 10 $/lună, indiferent de câte camere |
| Per anunț VR (fiecare unitate listată separat) | 5 $/anunț/lună — la 16 unități, 80 $/lună |
| Taxă de pornire | 15 $, o singură dată |
| Limită | 40 de cereri API pe minut per partener |

Contul de test al lui Ovidiu are cele 16 camere grupate pe **2 tipuri**
(„Tiny houses", „Loft"), iar maparea către Airbnb se face tot prin „Hotel
Code" — semn că s-ar aplica tariful fix de 10 $/lună, nu 80 $. **De
confirmat direct cu suportul lor** (chat live, întrebare trimisă pe
16 septembrie 2026, răspuns în așteptare) înainte de a începe Task 1.
Dacă răspunsul e „per anunț", planul rămâne valabil tehnic — doar concluzia
de cost se schimbă, și varianta `.ics` redevine cea recomandată.

## Ce oferă în plus față de varianta `.ics`

- **Instant, nu la oră.** Rezervarea vine printr-un webhook, „la fiecare
  rezervare, la fiecare schimbare de tarif" (confirmat din blogul lor
  tehnic), nu la reîmprospătarea periodică a unui feed extern.
- **Date reale despre oaspete**, când OTA le oferă: nume, telefon, email,
  preț pe noapte, monedă — nu doar un interval blocat. Documentația e
  cinstită despre limită: „fiecare canal decide cât oferă; multe maschează
  sau omit emailul, telefonul" — tratat ca opțional peste tot, nu ca sigur.
- **Trimite și tarife și restricții** (sejur minim, închis la sosire/plecare)
  către OTA — `.ics`-ul nu poate deloc.

## Arhitectura

### Ieșire (PMS → Aiosell)

- Bază: `https://live.aiosell.com/api/v2/cm`. Autentificare **Basic Auth**
  pe fiecare cerere (`Authorization: Basic <base64(user:pass)>`) —
  credențialele primite la înscriere stau ca secrete Edge Function
  (`AIOSELL_USER`, `AIOSELL_PASS`), niciodată în cod sau în migrare.
- **Maparea camerelor e aproape gratuită**: `rooms.type` din PMS (`'tiny'`,
  `'loft'`) se potrivește deja cu tipurile configurate în contul de test
  (`tiny-houses`, `loft`) — o constantă de doi termeni în cod, nu un tabel.
- Un job `pg_cron` la 5 minute (limita lor de 40 cereri/minut permite mult
  mai des decât cele 10 minute de la iCal) recalculează, pentru fereastra
  deja folosită de `pms_fereastra` (−30/+400 zile):
  - **disponibilitatea** pe tip: 14 minus tiny houses ocupate în ziua
    respectivă, 2 minus loft-uri ocupate — aceeași logică de suprapunere ca
    `available_rooms`, doar agregată pe tip în loc de pe cameră individuală;
  - **tariful** din `nightly_rate(room_type, date, adults, children)`,
    pentru ocupația implicită a fiecărui tip (2 adulți) — un singur plan de
    tarif per tip la pornire, nu câte unul pentru fiecare combinație posibilă
    de adulți/copii (extensibil ulterior, fără schimbare de arhitectură).
  - Ambele într-un singur apel fiecare —
    `POST /update/{pms}` (disponibilitate),
    `POST /update-rates/{pms}` (tarife) — API-ul acceptă mai multe intervale
    de date într-un singur corp de cerere, deci fereastra întreagă pleacă
    dintr-o dată, nu zi cu zi.
- Restricțiile (sejur minim, stop-sell) nu sunt folosite azi în PMS — se
  pornește fără ele; `updates[].rooms[].restrictions` acceptă exact aceleași
  câmpuri când devine nevoie.

### Intrare (Aiosell → PMS) — webhook, nu interogare periodică

- Funcție edge nouă, `aiosell-webhook`, un singur `POST`, primește
  evenimentele `book`, `modify`, `cancel`, deosebite prin câmpul `action`.
- Autentificare: verifică headerul Basic Auth primit față de
  `AIOSELL_USER`/`AIOSELL_PASS`, cu comparație constantă — funcția
  `egalConstant` există deja în
  [`access-webhook/index.ts:27`](../supabase/functions/access-webhook/index.ts).
- **Scrie întâi payload-ul brut**, într-un tabel de audit nou
  (`aiosell_webhook_log`), înainte de orice procesare — la fel ca
  `access-webhook`: o rezervare reală, de pe Airbnb sau Booking.com, nu se
  pierde niciodată, chiar dacă restul logicii aruncă o eroare neprevăzută.
  Răspunde mereu `{"success":true,...}`, indiferent de rezultatul intern —
  payload-ul salvat permite reconcilierea manuală dacă ceva a eșuat.
- **`book`**: pentru fiecare intrare din `rooms[]` (o rezervare Aiosell
  poate acoperi mai multe camere, eventual de tipuri diferite), alege o
  cameră fizică liberă de tipul cerut — logica de alocare există deja,
  [`allocate_group`](../schema.sql) (linia 1970), scrisă pentru exact acest
  scop la rezervările de grup de pe site. Dacă sunt mai multe camere, se
  creează un `res_groups` nou care le leagă, la fel ca o rezervare de grup
  directă.
- **Idempotență**: `external_source = 'aiosell'`,
  `external_uid = bookingId` (identificatorul stabil dat de Aiosell) —
  același index unic `res_extern_unic` folosit și în planul iCal. `source`
  ia valoarea normalizată a lui `channel` (`booking`/`airbnb`, deja în
  `SOURCES`) sau `other` pentru un canal necunoscut.
- **`modify`**: caută rezervarea după `(external_source, external_uid)`,
  actualizează datele/camera. Dacă noua combinație cameră+dată nu mai e
  liberă, se tratează ca un conflict (mai jos) — nu se forțează.
- **`cancel`**: caută după `bookingId`, trece rezervarea pe `cancelled`.
- **Oaspetele**: dacă `guest.firstName`/`guest.lastName` și un telefon
  valid sunt prezente, se creează un rând `guests` real (schema le cere pe
  amândouă). Dacă OTA le-a mascat sau omis — posibil, documentat explicit de
  Aiosell — se aplică exact mecanismul din planul iCal: `guest_id = null`,
  `occupant_first_name`/`occupant_phone` completate cu ce există, tag
  automat „Detalii lipsă (OTA)".
- **Conflict (suprapunere reală)**: constrângerea `fara_suprapunere` respinge
  fizic inserarea; se loghează în `activity_log` și pleacă alerta prin
  Resend — identic cu Task 5 din planul iCal, reutilizat ca atare. Fereastra
  de risc e mult mai mică decât la `.ics` (push la fiecare schimbare, nu la
  fiecare oră), dar tot nu e zero — două canale pot accepta aceeași cameră
  în intervalul dintre o rezervare și propagarea ei.

## Modelul de date

- **Configurarea contului** (hotel code, partner id) — `app_state`, cheia
  `pms:aiosell:v1`, la fel ca la Oblio (`cif`, `serie` etc.). Credențialele
  Basic Auth rămân secrete Edge Function, nu intră în `app_state`.
- **Tabel nou, `aiosell_webhook_log`**: payload brut (`jsonb`), rezultat
  (`ok`/`eroare`), cameră/rezervare atinsă — modelat după `access_audit`.
- **Nimic nou pe `reservations`/`guests`** — aceleași coloane ca în planul
  iCal (`external_source`, `external_uid`, `tags`, `source`).

## Task-uri

1. **Migrația**: tabelul `aiosell_webhook_log`; secretele
   `AIOSELL_USER`, `AIOSELL_PASS`, `AIOSELL_HOTEL_CODE`, `AIOSELL_PARTNER_ID`
   (puse manual de Ovidiu, ca la `service_role_key`).
2. **Modulul pur `src/lib/aiosell.js`**: construiește corpurile cererilor de
   push (disponibilitate, tarife) din starea curentă a bazei, și decide ce
   face un eveniment de webhook (rezervare nouă / cameră de ales / conflict)
   — separat de rețea și de bază, testat în `src/aiosell.test.js`, după
   modelul `src/lib/ical-ota.js`.
3. **Funcția edge `aiosell-push`**, chemată de cron: citește disponibilitatea
   și tarifele curente, cheamă modulul pur, trimite cele două cereri.
4. **Funcția edge `aiosell-webhook`**: primește `book`/`modify`/`cancel`,
   scrie auditul, alocă/actualizează/anulează, trimite alerta de conflict.
5. **Jobul `pg_cron`** la 5 minute, calchiat după
   [`device-automatizari`](../supabase/migrations/20260909194431_automatizari_relee_cron.sql).
6. **Ecran mic în Setări** cu hotel code/partner id (ca la Oblio) și „ultima
   trimitere reușită către Aiosell".
7. **Testare cap-coadă în sandbox-ul lor**, înainte de producție: `Sandbox`
   pentru push (verificat pe `live.aiosell.com`), `Webhook Tester` pentru
   `book`/`modify`/`cancel` — ambele deja disponibile în contul de test.
   Abia după ce trec astea are rost formularul „Become a Partner" pentru
   credențialele de producție (suportul lor cere explicit testarea înainte
   de formular, altfel întârzie).

## Ce nu am verificat / rămâne de decis

- **Prețul final** (per Hotel vs per anunț) — răspuns Aiosell în așteptare.
- Câte planuri de tarif per tip de cameră la pornire — un singur nivel de
  ocupare acum, de extins dacă apare nevoia (tiny house cu pat etajat are
  capacitate 3, nu 2 — de decis dacă merită un al treilea tip separat în
  Aiosell sau rămâne „tiny-houses" cu tarif pe ocupația de 2).
- Comportamentul exact la `modify` când camera nouă nu mai e liberă — de
  testat concret în `Webhook Tester` înainte de a scrie codul final.
- Formatul exact al câmpului `Fetch Reservations` ca sursă de reconciliere
  periodică (verificat ce întoarce, neclar încă dacă merită folosit ca plasă
  de siguranță suplimentară față de webhook, sau webhook-ul singur ajunge).
