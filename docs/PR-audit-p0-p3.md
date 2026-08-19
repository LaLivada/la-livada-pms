# Auditul de producție: fix-uri P0–P3, teste și disaster recovery

Rezolvă toate cele 20 de constatări din auditul de producție, plus 5
probleme descoperite pe parcurs care nu erau în raport. Toate fix-urile
sunt aditive — migrări, trigger-e, guard clause-uri, extrageri de funcții
pure. Nicio rescriere.

7 commit-uri, fiecare cu propriul motiv explicat în mesaj. Se pot citi în
ordine.

---

## P0 — securitate

| Problemă | Fix |
|---|---|
| `create_booking` (RPC publică, fără autentificare) putea fi folosită ca să se umple calendarul cu rezervări false | Rate-limit 5/oră per telefon, 20/oră per IP, în tabelul nou `booking_attempts` |
| Orice cont autentificat, inclusiv de cameristă, putea șterge orice rezervare sau schimba tarifele printr-un request direct | Politici RLS separate pe INSERT/UPDATE/DELETE, mapate pe rolurile din `VIEW_ROLES` |
| `search_path` nefixat pe funcții `SECURITY DEFINER` | Fixat pe toate cele 12 funcții |

Politicile de **SELECT au rămas neschimbate** — nimeni nu pierde acces la
citire față de comportamentul de azi.

## P1 — stabilitate și concurență

- **Concurență optimistă pe rezervări** (`updated_at` + trigger). Înainte,
  doi utilizatori care editau aceeași rezervare își suprascriau tăcut
  modificările: `syncTable` trimite rândul întreg din starea locală, deci
  al doilea salvat readucea valorile primului. Testat cu 3 scenarii în
  tranzacție cu rollback.
- **Guard anti-dublu-click** pe salvare, ștergere, check-in, check-out,
  no-show, anulare, mesaj.
- **Scrierile care eșuau în tăcere acum se văd.** `saveShared` arunca
  `false`, ignorat de toți apelanții; un status de curățenie nesalvat
  rămânea afișat ca și cum ar fi fost scris. Acum revine la valoarea reală
  cu mesaj de eroare.

## P2 — performanță și mentenabilitate

- 14 indecși pe chei străine, 14 politici `for all` sparte pe acțiuni.
  **Linterul de performanță e curat.**
- **Banii se rotunjesc la calcul, nu doar la afișare.** `500 lei / 3 nopți`
  ajungea în bază ca `166.6666...` în timp ce ecranul arăta `167`.
- **Erorile trec printr-un tabel de traducere** (după codul Postgres, nu
  după text). Recepția vedea nume de constrângeri și formulări de RLS.
- Logica pură mutată în `src/lib/` — testele nu mai încarcă toată
  aplicația ca să ajungă la câteva funcții de calcul.

## P3 — sesiune, CORS, plafoane, bundle

- **Deconectarea golea doar sesiunea Supabase.** Rezervările și jurnalul
  rămâneau în memoria React, vizibile pentru următorul care se autentifica
  pe același calculator. Plus reverificarea rolului pentru taburi lăsate
  deschise.
- **CORS pe `anaf-lookup`**: de la `*` la allow-list. Verificat live —
  `pms.lalivada.ro` primește antetul, `pms.lalivada.ro.exemplu.ro` nu.
- **Plafoane de lungime în bază**, nu doar în formular: acoperă și
  importul iCal, și rezervările de pe site.
- **Bundle: 1318 kB → 720 kB** (gzip 369 → 194). Jumătate din ce se
  descărca la fiecare pornire.

---

## Teste — de la 36 la 89

| Suită | Comandă | Rezultat |
|---|---|---|
| Unitare + proprietate | `npm test` | 65/65 |
| Integrare RLS | `npm run test:integration` | 21/21 |
| E2E | `npm run test:e2e` | 3/3 (+3 care cer bază de test) |

**Testele de integrare** verifică refuzurile RLS prin API-ul public, pe
calea reală a unui atacator. Niciun test nu creează sau modifică date.

**Testele de proprietate** (`fast-check`) declară reguli pe care biblioteca
încearcă să le spulbere cu sute de combinații generate.

**Testele E2E refuză să ruleze pe producție** — fluxul emite o factură,
iar emiterea consumă un număr din serie care nu se mai poate elibera.
Seria `LL` e chiar acum la numărul 1.

---

## Ce au găsit testele, dincolo de audit

1. **`revoke execute ... from anon` nu avea niciun efect.** Postgres
   acordă implicit `EXECUTE` către `PUBLIC`, iar `anon` moștenea dreptul
   pe acolo. Comentariul din schemă — *„calculul de preț NU e expus
   public"* — descria o intenție care nu era aplicată. Practic nu se
   scursese nimic (funcțiile sunt `security invoker`, deci RLS le
   returna 0), dar lipsea un strat de apărare.

2. **Bug în `round2`**, funcție pe care o adăugasem eu la P2: peste
   ~1.79e306 întorcea `Infinity` — exact ce promitea că nu face.

3. **Regresie introdusă de mine în P0.2**, prinsă în P1: politica pe
   `app_state` ar fi împiedicat cameristele să-și mai înregistreze
   propriile acțiuni în jurnal — pe dos față de rostul unui audit trail.

4. **`online_pricing_tiers`** avea scrierea deschisă oricui autentificat.
   Nu era în audit. Aliniat la `rates`/`seasons`.

5. Un test al meu greșea, nu codul: construiam datele adunând
   `N × 86400000` ms, ceea ce peste trecerea la ora de iarnă cade pe ziua
   precedentă. `nightsBetween` era corectă.

---

## ⚠️ Disaster recovery: constatarea cea mai gravă

Organizația e pe **planul Free**. Documentația Supabase e explicită:
backup-urile automate există doar pe Pro, Team și Enterprise.

**Nu există niciun backup automat, PITR nu e disponibil, și nu există
nicio copie manuală.** Pierderea maximă de date la un incident, azi:
tot. 87 de rezervări, 87 de fișe de client, facturile emise, jurnalul.

Procedura completă în [`docs/disaster-recovery.md`](docs/disaster-recovery.md).
**O copie de siguranță e mai urgentă decât orice din acest PR.**

---

## Înainte de merge

- [ ] **Fă o copie de siguranță a bazei** (comanda e în documentul de DR)
- [ ] Rulează `REVOKE`-ul de tabele pentru `anon` (P0.3 — nu a putut fi
      aplicat automat)
- [ ] Activează leaked-password protection: Dashboard → Authentication
- [ ] **Testează cu un cont `receptionist` și unul `housekeeping`** —
      există un singur cont admin, care trece orice verificare de rol,
      deci noile politici n-au fost exercitate pe un rol real
- [ ] Verifică vizual fluxul de admin — nu am putut testa în interfață
      autentificat (nu introduc parole)

## Ce nu e verificat

- Fluxul E2E complet n-a fost rulat niciodată (necesită bază de test)
- Rate-limit-ul pe `create_booking` — logica e verificată prin citire, dar
  apelul real a fost blocat de mediul de execuție
- Cifrele de RPO/RTO din documentul de DR sunt estimări, nu măsurători
