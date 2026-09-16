# Facturarea prin Oblio — plan de implementare

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facturile emise din PMS se emit în contul Oblio.eu al pensiunii (serie, număr, PDF, e-Factura), iar PMS-ul păstrează o copie fidelă; anularea și stornarea trec tot prin Oblio.

**Architecture:** O funcție edge nouă, `oblio-facturare`, e singurul loc care vorbește cu API-ul Oblio (tokenul contului stă doar în secretele ei). Browserul îi cere „emite / stornează / anulează factura X"; funcția blochează draftul în Postgres, trimite documentul la Oblio cu o cheie de idempotență fixă, apoi scrie în `invoices` seria, numărul și linkul primite. Oblio e sursa numerotării; drumul vechi (`emite_factura`, seria locală) rămâne pentru cât timp integrarea e oprită din setări.

**Tech Stack:** React 19 + Vite (vitest, oxlint, `tsc -p jsconfig.json`), Supabase (Postgres cu RLS, funcții `security definer`, Edge Functions pe Deno), API-ul REST Oblio (https://www.oblio.eu/api), `supabase-js` v2.

**Spec:** nu există un document separat; cerința lui Ovidiu („facturile emise să fie prin Oblio") plus deciziile din secțiunea „Ce se cere și deciziile" de mai jos. Documentația API citită pe 16 septembrie 2026: https://www.oblio.eu/api.

## Global Constraints

- Repo-ul e **public**: niciun secret, token, CIF real sau constatare de securitate în fișiere. `OBLIO_CLIENT_ID` / `OBLIO_CLIENT_SECRET` le pune Ovidiu în Supabase → Edge Functions → Secrets; executorul nu le cere și nu le vede.
- Nu se creează conturi și nu se introduc credențiale nicăieri (Oblio, Supabase, Vercel). Verificarea legăturii cu Oblio o face Ovidiu din PMS, după ce pune secretele.
- **Oblio n-are sandbox**: orice document trimis e fiscal. Nu se emite nimic „de test" din cod; prima factură reală o emite Ovidiu (una mică, apoi stornată — ambele legale).
- Orice funcție SQL nouă chemată doar de funcția edge: `revoke execute ... from public, anon, authenticated;` + `grant ... to service_role;` (Supabase dă grant direct fiecărui rol; `from public, anon` singur lasă funcția deschisă oricui e logat).
- Politicile RLS se schimbă cu `alter policy`, nu `drop` + `create`.
- `schema.sql` oglindește baza vie: orice migrație aplicată se scrie și acolo, în același commit.
- Fără stiluri inline noi în JSX (`src/stiluri-inline.test.js`, PLAFON 366): elementele noi primesc clase în `src/styles/pms.css`, puse **înainte** de blocul `/* ---------- Responsive overrides`.
- `src/lib` și `src/data` au `// @ts-check` și trec prin `tsc -p jsconfig.json` (`npm run typecheck`).
- Fișierele sunt LF/CRLF amestecat; scripturile de editare păstrează ce găsesc. Backtick-urile din `node -e`/heredoc se strică — scrie scripturile ca fișiere și pune backtick-ul ca `String.fromCharCode(96)`.
- Poarta `src/features/facturare.jsx` are lista exactă de exporturi în `src/facturare-poarta.test.js` (`NUMELE`): orice export nou se adaugă și acolo.
- Commit-uri: `rm -f s drumul` înainte, doar `git add <căi explicite>` (niciodată `1090`, `2200`, `285`, `$TEMP/`, `.claude-flow/`, `.claude/proven-config*`, `docs/*.pdf`, `calendar/`), mesaj `git commit -q -m 'titlu' -m 'corp' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'`, apoi `git status --short` (fișierele au dispărut o dată după commit), `git push`, și CI verde: `gh run list --commit "$(git rev-parse HEAD)" --json status,conclusion`.
- Textele pentru utilizator sunt în română, cu diacritice; ghilimelele românești sunt `„…”` (închiderea `”`, nu `"`, altfel se rupe string-ul JS).
- Deploy funcție edge: `npx --no-install supabase functions deploy oblio-facturare --project-ref suoowrginsliyrbxqeap` (FĂRĂ `--no-verify-jwt`: browserul trimite mereu JWT-ul userului).
- Migrațiile se aplică pe proiectul `suoowrginsliyrbxqeap` cu unealta MCP `apply_migration` (nume `oblio_facturare`); verificările cu `execute_sql`.

---

## Ce se cere și deciziile

**Starea de plecare (măsurată pe 16 septembrie 2026):** nicio factură emisă vreodată din PMS (`invoice_series` are doar `LL`, `next_number = 1`; un singur draft). Deci Oblio poate deveni sursa numerotării fără nicio reconciliere.

1. **Oblio dă seria și numărul.** PMS-ul creează draftul ca acum; la „Emite factura", funcția edge trimite documentul la Oblio (`POST /api/docs/invoice`, fără `disableAutoSeries`), iar Oblio răspunde cu `seriesName`, `number`, `link` (PDF). Abia atunci draftul devine „emisă", cu exact acele valori. Numerotarea locală (`invoice_series`) nu se mai atinge cât Oblio e pornit. Motiv: dacă PMS-ul ar aloca numărul și Oblio doar l-ar primi, o factură făcută direct în Oblio ar dubla numărul.
2. **Comutator în setări, nu cod șters.** `pms:oblio:v1` în `app_state` (scris doar de admin): `{ activ, cif, serie, punctLucru, trimiteEFactura }`. Cu `activ = false` totul merge exact ca azi (`emite_factura`, seria locală). Așa se poate configura și verifica înainte de a porni, și opri dacă Oblio cade.
3. **Ce se întâmplă când ceva pică, pas cu pas.** Emiterea are trei pași: (a) Postgres blochează draftul (`oblio_stare = 'in_curs'`, cheia de idempotență `pms-<id>`, fixă); (b) cererea la Oblio cu `idempotencyKey`; (c) Postgres scrie răspunsul. Pică (b) → draftul rămâne draft, cu `oblio_stare = 'eroare'` și mesajul lui Oblio la vedere; „Emite" din nou trimite aceeași cheie, deci Oblio nu emite de două ori. Pică (c) (rar: Oblio a emis, dar scrierea noastră a eșuat) → mesajul spune explicit „verifică în Oblio"; documentul există acolo, iar reîncercarea cu aceeași cheie îl regăsește în loc să-l dubleze. Două taburi apăsând deodată → a doua cerere e refuzată de blocajul de la (a) („Emiterea e deja în curs").
4. **Anularea și stornarea, întâi la Oblio, apoi la noi.** Anulare: `PUT /api/docs/invoice/cancel`, apoi `status = 'cancelled'`. Stornare: `POST /api/docs/invoice` cu `referenceDocument { type: "Factura", refund: 1 }` și liniile cu cantități negate; Oblio dă numărul notei de credit, iar noi scriem rândul negativ ca acum (`storneaza_factura`), dar cu seria/numărul lor. O factură emisă prin Oblio se anulează/stornează doar prin Oblio, chiar dacă între timp comutatorul a fost oprit (decide `invoice.oblio_stare`, nu setarea).
5. **TVA după procent, din nomenclatorul lor.** Cotele PMS (21 / 11 / 0) se potrivesc cu `GET /api/nomenclature/vat_rates?cif=` după `percentage`; se trimit `vatName` + `vatPercentage`, `vatIncluded: 1` (prețurile PMS sunt cu TVA inclus, ca în `lib/money.js`). O cotă lipsă în Oblio oprește emiterea cu un mesaj clar, nu cu o factură greșită.
6. **Clientul vine din `billing_customers`**, nu din nomenclatorul Oblio (`save: 0`): firmă → `cif`, `rc`, `contact`, `vatPayer` după prefixul `RO`; persoană → `name` = nume + prenume, `cif` = CNP dacă e completat.
7. **e-Factura (SPV).** Opțional, imediat după emitere (`POST /api/docs/einvoice`, dacă `trimiteEFactura`), plus un buton „Trimite în SPV" în fereastra facturii. Se păstrează codul întors (-1 netrimisă, 0 în procesare, 1 trimisă, 2 erori). Alternativ, Ovidiu poate lăsa Oblio să trimită automat (setarea contului „Trimite automat e-Factura în SPV").
8. **Tokenul Oblio ține o oră** și stă în memoria instanței funcției (ca la TTLock), niciodată în baza de date.
9. **PDF-ul e al lui Oblio** (`oblio_link`); coala tipăribilă din PMS rămâne ca până acum, pentru pretipărire și pentru drumul vechi.

**Ce NU intră (plan separat, după ce merge emiterea):** sincronizarea încasărilor în Oblio (`PUT /api/docs/invoice/collect` — semantica seriilor de chitanțe cere confirmare pe contul real); webhook-uri Oblio; interogarea stării SPV după trimitere (Oblio o arată în contul lor); importul în PMS al facturilor făcute direct în Oblio.

## Fluxul emiterii

```
browser (factura.jsx) ── cheamaOblio("emite", {invoiceId}) ──► edge oblio-facturare
   ▲                                                              │ 1. JWT → staff; has_billing_permission('issue_invoice')
   │                                                              │ 2. rpc oblio_incepe_emiterea(id)   → in_curs + cheie
   │                                                              │ 3. citește factura, clientul, liniile (+ unitatea, categoria)
   │                                                              │ 4. GET nomenclature/vat_rates → cotele
   │                                                              │ 5. POST docs/invoice {idempotencyKey: cheie, client, products}
   │                                                              │ 6a. ok  → rpc oblio_finalizeaza_emiterea(id, serie, nr, link, uid)
   │                                                              │ 6b. pică → rpc oblio_marcheaza_eroare(id, mesaj)
   └──── {ok, factura} sau {ok:false, error} ◄────────────────────┘
```

## Fișiere

| Fișier | Rol |
|---|---|
| `schema.sql` (+ migrația `oblio_facturare`) | coloanele `oblio_*` pe `invoices`, cele șase funcții, politica `pms:oblio:v1` |
| `supabase/functions/oblio-facturare/oblio.ts` | clientul Oblio, pur (fără `Deno.*`): token, cereri, potrivirea cotelor, construirea documentelor; testat din vitest |
| `supabase/functions/oblio-facturare/index.ts` | handler-ul: autentificare, permisiuni, acțiunile `verifica / emite / storneaza / anuleaza / efactura-trimite` |
| `src/data/oblio.js` | setările `pms:oblio:v1` și apelul funcției edge (nu aruncă niciodată) |
| `src/features/facturare/oblio.jsx` | tabul „Oblio" din Financiar (setări + „Verifică legătura") |
| `src/features/facturare/financiar.jsx`, `src/features/facturare.jsx` | tabul nou, exportul din poartă |
| `src/features/facturare/emitere.jsx` | `emiteFactura` alege drumul (Oblio / local) |
| `src/features/facturare/factura.jsx` | PDF din Oblio, e-Factura, eroarea de emitere, anulare/stornare prin Oblio |
| `src/features/facturare/facturi-lista.jsx` | link PDF + eticheta SPV pe rând |
| `src/lib/constante.js` | etichetele codului e-Factura |
| `src/styles/pms.css` | clasele noi (`btn-lat`, `oblio-*`) |
| `src/oblio-client.test.js`, `src/oblio-date.test.js`, `src/oblio-emitere.test.js`, `src/oblio-ecran.test.js`, `src/facturare-poarta.test.js` | testele |
| `docs/oblio.md`, `docs/README.md`, `README.md` | documentația, indexul, variabilele de mediu |

---

### Task 1: Migrația — coloanele `oblio_*`, funcțiile, politica setărilor

**Files:**
- Migrație nouă (MCP `apply_migration`, nume `oblio_facturare`)
- Modify: `schema.sql` (tabelul `invoices` ~linia 668, după `storneaza_factura` ~linia 1040, blocul de drepturi ~linia 1103, politicile `app_state` ~linia 2978)

**Interfaces:**
- Produces (chemate doar cu `service_role`, din Task 3):
  - `oblio_incepe_emiterea(p_id text) returns invoices`
  - `oblio_marcheaza_eroare(p_id text, p_mesaj text) returns void`
  - `oblio_finalizeaza_emiterea(p_id text, p_serie text, p_numar text, p_link text, p_de uuid) returns invoices`
  - `oblio_finalizeaza_stornarea(p_id text, p_serie text, p_numar text, p_link text, p_de uuid) returns jsonb` — `{stornare, original}`
  - `oblio_finalizeaza_anularea(p_id text) returns invoices`
  - `oblio_actualizeaza_efactura(p_id text, p_cod int) returns invoices`
  - coloane pe `invoices`: `oblio_stare text` (`neemisa | in_curs | emisa | eroare`), `oblio_cheie text`, `oblio_numar text`, `oblio_link text`, `oblio_eroare text`, `oblio_la timestamptz`, `oblio_efactura_cod int`, `oblio_efactura_la timestamptz`

- [ ] **Step 1: Aplică migrația pe baza vie**

Cu `apply_migration` (`project_id: suoowrginsliyrbxqeap`, `name: oblio_facturare`), exact acest SQL:

```sql
-- Oblio (facturarea prin oblio.eu, docs/oblio.md): copia din PMS a ce a
-- răspuns Oblio, funcțiile chemate DOAR de funcția edge `oblio-facturare`
-- (service_role) și cheia de setări `pms:oblio:v1`, scrisă numai de admin.

alter table invoices
  add column oblio_stare        text not null default 'neemisa'
    check (oblio_stare in ('neemisa', 'in_curs', 'emisa', 'eroare')),
  add column oblio_cheie        text,
  add column oblio_numar        text,
  add column oblio_link         text,
  add column oblio_eroare       text,
  add column oblio_la           timestamptz,
  add column oblio_efactura_cod int,
  add column oblio_efactura_la  timestamptz;

comment on column invoices.oblio_stare is 'neemisa = doar în PMS; in_curs = cererea către Oblio a plecat; emisa = Oblio a dat serie+număr; eroare = Oblio a refuzat (draftul rămâne, mesajul în oblio_eroare).';
comment on column invoices.oblio_cheie is 'idempotencyKey trimis la Oblio: pms-<id>, fix — o reîncercare nu emite de două ori.';
comment on column invoices.oblio_numar is 'Numărul exact cum l-a dat Oblio (poate avea zerouri în față: 0053); `number` e același, ca int.';
comment on column invoices.oblio_efactura_cod is 'Codul de la POST /docs/einvoice: -1 netrimisă, 0 în procesare, 1 trimisă, 2 cu erori.';

-- Pasul (a) al emiterii: blochează draftul și îi dă cheia de idempotență.
-- A doua cerere în două minute e refuzată — două taburi apăsând deodată.
create or replace function oblio_incepe_emiterea(p_id text)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_f invoices;
begin
  select * into v_f from invoices where id = p_id for update;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  if v_f.status <> 'draft' then
    raise exception 'Factura % nu mai e draft (%) — nu se poate emite a doua oară.', p_id, v_f.status;
  end if;
  if v_f.oblio_stare = 'in_curs' and v_f.oblio_la > now() - interval '2 minutes' then
    raise exception 'Emiterea e deja în curs. Așteaptă un minut și încearcă din nou.';
  end if;
  if not exists (select 1 from invoice_items where invoice_id = p_id) then
    raise exception 'Factura n-are nicio linie.';
  end if;
  update invoices
     set oblio_stare = 'in_curs', oblio_eroare = null, oblio_la = now(),
         oblio_cheie = coalesce(oblio_cheie, 'pms-' || id)
   where id = p_id
   returning * into v_f;
  return v_f;
end $$;

-- Oblio a refuzat: draftul rămâne draft, cu mesajul lor la vedere.
create or replace function oblio_marcheaza_eroare(p_id text, p_mesaj text)
returns void language sql security definer set search_path = public as $$
  update invoices
     set oblio_stare = 'eroare',
         oblio_eroare = left(coalesce(p_mesaj, 'eroare necunoscută'), 1000),
         oblio_la = now()
   where id = p_id and status = 'draft';
$$;

-- Pasul (c): seria și numărul sunt ale lui Oblio. `number` rămâne int (cheia
-- unică serie+număr), `oblio_numar` păstrează forma exactă („0053").
create or replace function oblio_finalizeaza_emiterea(
  p_id text, p_serie text, p_numar text, p_link text, p_de uuid
) returns invoices language plpgsql security definer set search_path = public as $$
declare v_f invoices; v_nr int;
begin
  v_nr := nullif(regexp_replace(coalesce(p_numar, ''), '\D', '', 'g'), '')::int;
  if p_serie is null or p_serie = '' or v_nr is null then
    raise exception 'Răspuns Oblio fără serie sau număr (% %).', p_serie, p_numar;
  end if;
  select * into v_f from invoices where id = p_id for update;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  if v_f.status <> 'draft' then
    raise exception 'Factura % nu mai e draft (%).', p_id, v_f.status;
  end if;
  update invoices
     set series = p_serie, number = v_nr, oblio_numar = p_numar, oblio_link = p_link,
         status = 'issued', issue_date = now(), issued_by = p_de,
         oblio_stare = 'emisa', oblio_eroare = null, oblio_la = now()
   where id = p_id
   returning * into v_f;
  return v_f;
end $$;

-- Stornarea, ca storneaza_factura, dar cu seria/numărul date de Oblio
-- pentru nota de credit (documentul cu referenceDocument.refund = 1).
create or replace function oblio_finalizeaza_stornarea(
  p_id text, p_serie text, p_numar text, p_link text, p_de uuid
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_orig invoices; v_noua invoices; v_nr int;
begin
  v_nr := nullif(regexp_replace(coalesce(p_numar, ''), '\D', '', 'g'), '')::int;
  if p_serie is null or p_serie = '' or v_nr is null then
    raise exception 'Răspuns Oblio fără serie sau număr (% %).', p_serie, p_numar;
  end if;
  select * into v_orig from invoices where id = p_id for update;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  if v_orig.status not in ('issued', 'partially_paid', 'paid') then
    raise exception 'Factura % este % — se pot storna doar facturi emise.', p_id, v_orig.status;
  end if;
  insert into invoices (id, series, number, folio_id, billing_customer_id, status, issue_date,
                        service_date_start, service_date_end,
                        subtotal_net, subtotal_vat, total_amount, credit_note_of, created_by, issued_by,
                        oblio_stare, oblio_cheie, oblio_numar, oblio_link, oblio_la)
  values ('nc-' || encode(gen_random_bytes(6), 'hex'), p_serie, v_nr,
          v_orig.folio_id, v_orig.billing_customer_id, 'issued', now(),
          v_orig.service_date_start, v_orig.service_date_end,
          -v_orig.subtotal_net, -v_orig.subtotal_vat, -v_orig.total_amount,
          v_orig.id, p_de, p_de,
          'emisa', 'pms-storno-' || v_orig.id, p_numar, p_link, now())
  returning * into v_noua;
  insert into invoice_items (id, invoice_id, product_id, name, quantity, unit_price, vat_rate,
                             net_amount, vat_amount, total_amount, sort_order)
  select 'nci-' || encode(gen_random_bytes(6), 'hex'), v_noua.id, product_id, name, -quantity,
         unit_price, vat_rate, -net_amount, -vat_amount, -total_amount, sort_order
    from invoice_items
   where invoice_id = v_orig.id;
  update invoices set status = 'credited', oblio_la = now() where id = v_orig.id returning * into v_orig;
  return jsonb_build_object('stornare', to_jsonb(v_noua), 'original', to_jsonb(v_orig));
end $$;

-- Anularea: regulile (doar „emisă", fără plăți) le impune guard_invoice_update.
create or replace function oblio_finalizeaza_anularea(p_id text)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_f invoices;
begin
  update invoices set status = 'cancelled', oblio_la = now() where id = p_id returning * into v_f;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  return v_f;
end $$;

create or replace function oblio_actualizeaza_efactura(p_id text, p_cod int)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_f invoices;
begin
  update invoices set oblio_efactura_cod = p_cod, oblio_efactura_la = now()
   where id = p_id returning * into v_f;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  return v_f;
end $$;

-- Toate șase sunt chemate NUMAI de funcția edge, cu service_role. Numește
-- explicit `authenticated`: default privileges din Supabase îi dau un grant
-- propriu, iar `from public, anon` singur l-ar lăsa (vezi comentariul de la
-- blocheaza_zilele_evenimentului).
revoke execute on function oblio_incepe_emiterea(text)                               from public, anon, authenticated;
revoke execute on function oblio_marcheaza_eroare(text, text)                        from public, anon, authenticated;
revoke execute on function oblio_finalizeaza_emiterea(text, text, text, text, uuid)  from public, anon, authenticated;
revoke execute on function oblio_finalizeaza_stornarea(text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function oblio_finalizeaza_anularea(text)                          from public, anon, authenticated;
revoke execute on function oblio_actualizeaza_efactura(text, int)                    from public, anon, authenticated;
grant  execute on function oblio_incepe_emiterea(text)                               to service_role;
grant  execute on function oblio_marcheaza_eroare(text, text)                        to service_role;
grant  execute on function oblio_finalizeaza_emiterea(text, text, text, text, uuid)  to service_role;
grant  execute on function oblio_finalizeaza_stornarea(text, text, text, text, uuid) to service_role;
grant  execute on function oblio_finalizeaza_anularea(text)                          to service_role;
grant  execute on function oblio_actualizeaza_efactura(text, int)                    to service_role;

-- `pms:oblio:v1` (CIF, seria din Oblio, activ) o scrie doar adminul:
-- `activ` decide pe unde ies facturile. ALTER, nu DROP + CREATE.
alter policy "scrie app_state" on app_state with check (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1'))
  or ((select staff_role()) = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
);
alter policy "modifica app_state" on app_state using (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1'))
  or ((select staff_role()) = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
) with check (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1'))
  or ((select staff_role()) = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
);
alter policy "sterge app_state" on app_state using (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1'))
);
```

- [ ] **Step 2: Verifică fluxul într-o tranzacție care se anulează singură**

Cu `execute_sql`, blocul de mai jos (se termină cu `raise exception 'OK …'`, deci nu lasă nimic în bază):

```sql
do $$
declare v_f invoices; v_admin uuid; v_j jsonb;
begin
  select user_id into v_admin from staff where role = 'admin' limit 1;
  if exists (select 1 from pg_proc where proname like 'oblio\_%' and has_function_privilege('authenticated', oid, 'execute')) then
    raise exception 'DREPTURI: o funcție oblio_* e deschisă pentru authenticated';
  end if;
  insert into invoices (id, folio_id, billing_customer_id, status, total_amount)
  select 'inv-proba-oblio', f.id, c.id, 'draft', 100 from folios f, billing_customers c limit 1;
  insert into invoice_items (id, invoice_id, name, quantity, unit_price, vat_rate, net_amount, vat_amount, total_amount)
  values ('ii-proba-oblio', 'inv-proba-oblio', 'Cazare', 1, 100, 11, 90.09, 9.91, 100);
  v_f := oblio_incepe_emiterea('inv-proba-oblio');
  if v_f.oblio_stare <> 'in_curs' or v_f.oblio_cheie <> 'pms-inv-proba-oblio' then
    raise exception 'INCEPE: % %', v_f.oblio_stare, v_f.oblio_cheie;
  end if;
  begin
    perform oblio_incepe_emiterea('inv-proba-oblio');
    raise exception 'INCEPE: a doua pornire trebuia refuzată';
  exception when others then
    if sqlerrm not like 'Emiterea e deja în curs%' then raise; end if;
  end;
  perform oblio_marcheaza_eroare('inv-proba-oblio', 'Seria nu exista');
  select * into v_f from invoices where id = 'inv-proba-oblio';
  if v_f.status <> 'draft' or v_f.oblio_stare <> 'eroare' or v_f.oblio_eroare <> 'Seria nu exista' then
    raise exception 'EROARE: % % %', v_f.status, v_f.oblio_stare, v_f.oblio_eroare;
  end if;
  v_f := oblio_finalizeaza_emiterea('inv-proba-oblio', 'LL', '999007', 'https://www.oblio.eu/x', v_admin);
  if v_f.status <> 'issued' or v_f.series <> 'LL' or v_f.number <> 999007 or v_f.oblio_numar <> '999007'
     or v_f.oblio_stare <> 'emisa' or v_f.issued_by <> v_admin then
    raise exception 'FINALIZEAZA: %', to_jsonb(v_f);
  end if;
  v_f := oblio_actualizeaza_efactura('inv-proba-oblio', 0);
  if v_f.oblio_efactura_cod <> 0 then raise exception 'EFACTURA'; end if;
  v_j := oblio_finalizeaza_stornarea('inv-proba-oblio', 'LL', '999008', 'https://www.oblio.eu/y', v_admin);
  if (v_j->'original'->>'status') <> 'credited' or (v_j->'stornare'->>'number')::int <> 999008
     or (v_j->'stornare'->>'total_amount')::numeric <> -100 or (v_j->'stornare'->>'oblio_cheie') <> 'pms-storno-inv-proba-oblio' then
    raise exception 'STORNARE: %', v_j;
  end if;
  if (select quantity from invoice_items where invoice_id = v_j->'stornare'->>'id') <> -1 then
    raise exception 'STORNARE: linia nu e negată';
  end if;
  raise exception 'OK — toate verificările au trecut; tranzacția se anulează';
end $$;
```

Așteptat: eroarea `OK — toate verificările au trecut; tranzacția se anulează`. Orice alt text (DREPTURI / INCEPE / EROARE / FINALIZEAZA / STORNARE) spune ce pas a picat. Apoi `select count(*) from invoices where id like '%proba-oblio%'` → `0`.

- [ ] **Step 3: Oglindește în `schema.sql`**

Scrie scriptul `oblio-schema.mjs` (cu unealta Write, în scratchpad) și rulează-l din rădăcina repo-ului cu `node`:

```js
import fs from "node:fs";
const F = "schema.sql";
let t = fs.readFileSync(F, "utf8");
const crlf = t.includes("\r\n");
const nl = (s) => (crlf ? s.replace(/\n/g, "\r\n") : s);
function inlocuieste(de, la, ori = 1) {
  const d = nl(de), l = nl(la);
  const n = t.split(d).length - 1;
  if (n !== ori) throw new Error("gasit de " + n + " ori (asteptat " + ori + "): " + de.slice(0, 70));
  t = t.split(d).join(l);
}
/* 1. Coloanele, în tabel. */
inlocuieste(`  issued_by            uuid references staff(user_id),
  created_at           timestamptz not null default now(),
  unique (series, number)
);`,
`  issued_by            uuid references staff(user_id),
  created_at           timestamptz not null default now(),
  -- Oblio (docs/oblio.md): ce a răspuns Oblio la emitere. Coloanele nu sunt
  -- în lista înghețată din guard_invoice_update, deci starea e-Factura se
  -- poate actualiza și după emitere.
  oblio_stare          text not null default 'neemisa'
                         check (oblio_stare in ('neemisa', 'in_curs', 'emisa', 'eroare')),
  oblio_cheie          text,          -- idempotencyKey: pms-<id>, fix
  oblio_numar          text,          -- numărul exact al lui Oblio („0053")
  oblio_link           text,          -- PDF-ul din Oblio
  oblio_eroare         text,          -- mesajul lor, când a refuzat
  oblio_la             timestamptz,   -- ultima schimbare a oblio_stare
  oblio_efactura_cod   int,           -- -1 netrimisă, 0 în procesare, 1 trimisă, 2 erori
  oblio_efactura_la    timestamptz,
  unique (series, number)
);`);
/* 2. Funcțiile, după storneaza_factura. */
const FUNCTII = fs.readFileSync(process.argv[2], "utf8"); // fișierul cu SQL-ul funcțiilor (vezi mai jos)
inlocuieste(`-- Încasare: plata + (la numerar) numărul de chitanță, în aceeași tranzacție.`,
FUNCTII.trim() + `

-- Încasare: plata + (la numerar) numărul de chitanță, în aceeași tranzacție.`);
/* 3. Drepturile. */
inlocuieste(`grant  execute on function storneaza_factura(text, text)                                          to authenticated, service_role;`,
`grant  execute on function storneaza_factura(text, text)                                          to authenticated, service_role;
-- Oblio: chemate doar de funcția edge (vezi și revoke-urile de lângă definiții).
grant  execute on function oblio_incepe_emiterea(text)                               to service_role;
grant  execute on function oblio_marcheaza_eroare(text, text)                        to service_role;
grant  execute on function oblio_finalizeaza_emiterea(text, text, text, text, uuid)  to service_role;
grant  execute on function oblio_finalizeaza_stornarea(text, text, text, text, uuid) to service_role;
grant  execute on function oblio_finalizeaza_anularea(text)                          to service_role;
grant  execute on function oblio_actualizeaza_efactura(text, int)                    to service_role;`);
/* 4. Politicile app_state: 4 apariții (insert, update using, update check, delete). */
inlocuieste(`(select staff_role()) = 'receptionist' and key <> 'pms:access:v1'`,
            `(select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1')`, 4);
inlocuieste(`-- (features/acces.jsx și cele două funcții edge), deci restricția nu taie
-- niciun flux de lucru.`,
`-- (features/acces.jsx și cele două funcții edge), deci restricția nu taie
-- niciun flux de lucru. Din 16 septembrie 2026 la fel și \`pms:oblio:v1\`
-- (docs/oblio.md): \`activ\` de acolo decide pe unde ies facturile.`);
fs.writeFileSync(F, t);
console.log("ok");
```

Fișierul pasat ca argument conține, din migrația de la Step 1, exact partea de la comentariul `-- Pasul (a) al emiterii` până la ultimul `revoke execute … oblio_actualizeaza_efactura … from public, anon, authenticated;` inclusiv (funcțiile și revoke-urile; grant-urile stau în blocul de drepturi, pasul 3 al scriptului). Rulează: `node "<scratchpad>/oblio-schema.mjs" "<scratchpad>/oblio-functii.sql"` → `ok`.

Atenție la backtick-urile din pasul 4 al scriptului: în fișierul scris cu Write sunt escapate (`\``) în interiorul template literal-ului, cum e mai sus.

- [ ] **Step 4: Verifică oglinda și commit-ul**

```bash
grep -c "oblio_" schema.sql
```
Așteptat: cel puțin 40 de apariții. Apoi `npm test -- --run src/facturare-poarta.test.js` ca să confirmi că nimic din JS nu s-a atins (trece). Commit:

```bash
rm -f s drumul
git add schema.sql
git commit -q -m 'Oblio: coloanele si functiile de emitere prin Oblio, setarile doar de admin' -m 'Migratia oblio_facturare: oblio_* pe invoices, sase functii service_role (incepe/eroare/finalizeaza emiterea, stornarea, anularea, e-Factura), pms:oblio:v1 scris doar de admin. Verificat intr-o tranzactie anulata: drepturi inchise pentru authenticated, blocajul dublei emiteri, eroarea pastreaza draftul, finalizarea si stornarea cu numerele lui Oblio.' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 2: Clientul Oblio pur (`oblio.ts`) + testele lui

**Files:**
- Create: `supabase/functions/oblio-facturare/oblio.ts`
- Test: `src/oblio-client.test.js`

**Interfaces:**
- Produces (folosite de Task 3):
  - `obtineToken(f: Fetch, clientId: string, clientSecret: string, acum?: number): Promise<Token>` — `Token = { valoare: string; expiraLa: number }`
  - `tokenValabil(t: Token | null, acum?: number): boolean`
  - `cereOblio(f: Fetch, token: string, metoda: "GET"|"POST"|"PUT"|"DELETE", cale: string, corp?: unknown): Promise<any>` — întoarce `data` din răspuns; aruncă `EroareOblio(mesaj, status)`
  - `alegeCota(cote: CotaTva[], procent: number): CotaTva` — `CotaTva = { name: string; percentage: number; default?: boolean }`
  - `aziBucuresti(acum?: Date): string` (YYYY-MM-DD), `ziRo(iso): string` (dd.mm.yyyy)
  - `clientOblio(c)`, `liniiOblio(linii, cote, semn?: 1 | -1)`, `facturaOblio(factura, client, linii, setari, cote, azi)`, `stornoOblio(factura, client, linii, setari, cote, azi)`, `anulareOblio(factura, setari)`, `raspunsEmitere(data): { serie, numar, link }`
  - `PERMISIUNI: Record<string, string>` — acțiune → permisiune de facturare (`"admin"` pentru `verifica`)
  - `SetariOblio = { cif: string; serie: string; punctLucru?: string; trimiteEFactura?: boolean }`

- [ ] **Step 1: Scrie testul care pică**

`src/oblio-client.test.js`:

```js
/* Clientul Oblio (supabase/functions/oblio-facturare/oblio.ts), pur, cu un
 * fetch fals: tokenul, cererile si erorile lor, potrivirea cotelor de TVA
 * dupa procent, clientul (firma / persoana), liniile cu TVA inclus, factura,
 * stornarea (cantitati negate + referenceDocument), anularea. Ce s-ar strica
 * tacut: o factura cu alta cota, alt client sau alt total decat in PMS. */
import { describe, it, expect } from "vitest";
import {
  obtineToken, tokenValabil, cereOblio, alegeCota, aziBucuresti, ziRo, clientOblio, liniiOblio,
  facturaOblio, stornoOblio, anulareOblio, raspunsEmitere, EroareOblio, PERMISIUNI,
} from "../supabase/functions/oblio-facturare/oblio.ts";

const raspuns = (corp, status = 200) => ({ ok: status < 400, status, json: async () => corp, text: async () => JSON.stringify(corp) });
const fetchFals = (corp, status) => {
  const apeluri = [];
  const f = async (url, init) => { apeluri.push({ url, init }); return raspuns(corp, status); };
  f.apeluri = apeluri;
  return f;
};
const COTE = [{ name: "Normala", percentage: 21, default: true }, { name: "Redusa", percentage: 11 }, { name: "SFDD", percentage: 0 }];
const SETARI = { cif: "RO12345678", serie: "LL", punctLucru: "Sediu" };
const FIRMA = { kind: "company", company_name: "Exemplu SRL", cui: "RO987654", reg_com: "J37/1/2020", contact_name: "Ana", address: "Str. X 1", city: "Vaslui", county: "Vaslui", country: "România", email: "a@x.ro", phone: "07" };
const PERSOANA = { kind: "person", last_name: "Popescu", first_name: "Ion", cnp: "", address: "Str. Y 2", city: "Iași", county: "Iași", country: "România" };
const LINII = [
  { name: "Cazare", quantity: 2, unit_price: 350, vat_rate: 11, unit: "noapte", category: "cazare" },
  { name: "Minibar", quantity: 1, unit_price: 25.5, vat_rate: 21, unit: "buc", category: "minibar" },
];
const FACTURA = { id: "inv-1", oblio_cheie: "pms-inv-1", notes: "", service_date_start: "2026-09-14T11:00:00Z", service_date_end: "2026-09-16T08:00:00Z" };

describe("token", () => {
  it("trimite client_id/client_secret ca form (fara spatii), tine tokenul un minut mai putin decat expires_in", async () => {
    const f = fetchFals({ access_token: "tok", expires_in: 3600 });
    const t = await obtineToken(f, " mail@x.ro ", "secret\n", 1_000_000);
    expect(t).toEqual({ valoare: "tok", expiraLa: 1_000_000 + 3600_000 - 60_000 });
    expect(f.apeluri[0].url).toBe("https://www.oblio.eu/api/authorize/token");
    expect(f.apeluri[0].init.method).toBe("POST");
    expect(f.apeluri[0].init.body).toBe("client_id=mail%40x.ro&client_secret=secret");
    expect(tokenValabil(t, 1_000_000)).toBe(true);
    expect(tokenValabil(t, 1_000_000 + 3600_000)).toBe(false);
    expect(tokenValabil(null)).toBe(false);
  });
  it("refuzul devine EroareOblio cu mesajul lor", async () => {
    await expect(obtineToken(fetchFals({ status: 401, statusMessage: "Invalid client" }, 401), "a", "b")).rejects.toThrow("Invalid client");
  });
});

describe("cereOblio", () => {
  it("Bearer, JSON, intoarce `data`", async () => {
    const f = fetchFals({ status: 200, statusMessage: "Success", data: { seriesName: "LL", number: "0007" } });
    const d = await cereOblio(f, "tok", "POST", "/docs/invoice", { cif: "x" });
    expect(d).toEqual({ seriesName: "LL", number: "0007" });
    expect(f.apeluri[0].url).toBe("https://www.oblio.eu/api/docs/invoice");
    expect(f.apeluri[0].init.headers.Authorization).toBe("Bearer tok");
    expect(f.apeluri[0].init.headers["Content-Type"]).toBe("application/json");
    expect(f.apeluri[0].init.body).toBe('{"cif":"x"}');
  });
  it("GET fara corp, fara Content-Type", async () => {
    const f = fetchFals({ status: 200, data: [] });
    await cereOblio(f, "tok", "GET", "/nomenclature/companies");
    expect(f.apeluri[0].init.body).toBeUndefined();
    expect(f.apeluri[0].init.headers["Content-Type"]).toBeUndefined();
  });
  it("status 400 in corp = eroare, chiar cu HTTP 200", async () => {
    await expect(cereOblio(fetchFals({ status: 400, statusMessage: "Seria nu exista" }), "tok", "GET", "/x")).rejects.toThrow("Seria nu exista");
  });
  it("HTTP 500 fara JSON = EroareOblio cu statusul HTTP", async () => {
    const f = async () => ({ ok: false, status: 500, text: async () => "<html>" });
    const e = await cereOblio(f, "tok", "GET", "/x").catch((x) => x);
    expect(e).toBeInstanceOf(EroareOblio);
    expect(e.status).toBe(500);
  });
});

describe("cote si date", () => {
  it("alege cota dupa procent, preferand-o pe cea implicita", () => {
    expect(alegeCota(COTE, 11).name).toBe("Redusa");
    expect(alegeCota([{ name: "A", percentage: 21 }, { name: "B", percentage: 21, default: true }], 21).name).toBe("B");
    expect(() => alegeCota(COTE, 5)).toThrow("5%");
  });
  it("azi la Vaslui, nu UTC; zilele in format romanesc", () => {
    expect(aziBucuresti(new Date("2026-09-16T21:30:00Z"))).toBe("2026-09-17");
    expect(ziRo("2026-09-16T21:30:00Z")).toBe("17.09.2026");
    expect(ziRo(null)).toBe("");
  });
});

describe("clientul", () => {
  it("firma: CUI, RC, contact, platitor de TVA dupa prefixul RO, fara salvare in nomenclatorul lor", () => {
    expect(clientOblio(FIRMA)).toEqual({
      cif: "RO987654", name: "Exemplu SRL", rc: "J37/1/2020", address: "Str. X 1", city: "Vaslui", state: "Vaslui",
      country: "România", email: "a@x.ro", phone: "07", contact: "Ana", vatPayer: true, save: 0,
    });
    expect(clientOblio({ ...FIRMA, cui: "987654" }).vatPayer).toBe(false);
  });
  it("persoana: nume + prenume, CNP-ul (optional) in cif, fara RC", () => {
    const c = clientOblio(PERSOANA);
    expect(c.name).toBe("Popescu Ion");
    expect(c.cif).toBe("");
    expect(c.rc).toBe("");
    expect(c.contact).toBe("");
    expect(c.vatPayer).toBe(false);
    expect(clientOblio({ ...PERSOANA, cnp: "1800101123456" }).cif).toBe("1800101123456");
  });
});

describe("factura", () => {
  it("liniile: pret cu TVA inclus, unitatea produsului, serviciu pentru cazare", () => {
    expect(liniiOblio(LINII, COTE)).toEqual([
      { name: "Cazare", price: 350, quantity: 2, measuringUnit: "noapte", currency: "RON", vatName: "Redusa", vatPercentage: 11, vatIncluded: 1, productType: "Serviciu", save: 0 },
      { name: "Minibar", price: 25.5, quantity: 1, measuringUnit: "buc", currency: "RON", vatName: "Normala", vatPercentage: 21, vatIncluded: 1, productType: "Marfa", save: 0 },
    ]);
    expect(liniiOblio(LINII, COTE, -1).map((l) => l.quantity)).toEqual([-2, -1]);
  });
  it("antetul, cheia de idempotenta si perioada sejurului in mentiuni", () => {
    const p = facturaOblio(FACTURA, PERSOANA, LINII, SETARI, COTE, "2026-09-16");
    expect(p).toMatchObject({
      cif: "RO12345678", seriesName: "LL", issueDate: "2026-09-16", language: "RO", currency: "RON", precision: 2,
      workStation: "Sediu", sendEmail: 0, useStock: 0, idempotencyKey: "pms-inv-1",
    });
    expect(p.mentions).toBe("Servicii de cazare în perioada 14.09.2026 – 16.09.2026");
    expect(p.client.name).toBe("Popescu Ion");
    expect(p.products).toHaveLength(2);
    expect(p.referenceDocument).toBeUndefined();
  });
  it("fara cheie salvata, cheia e derivata din id — aceeasi la fiecare reincercare", () => {
    expect(facturaOblio({ ...FACTURA, oblio_cheie: null }, PERSOANA, LINII, SETARI, COTE, "2026-09-16").idempotencyKey).toBe("pms-inv-1");
  });
  it("notele facturii ajung in mentiuni, dupa perioada", () => {
    const p = facturaOblio({ ...FACTURA, notes: "Plata la receptie" }, PERSOANA, LINII, SETARI, COTE, "2026-09-16");
    expect(p.mentions).toBe("Servicii de cazare în perioada 14.09.2026 – 16.09.2026\nPlata la receptie");
  });
  it("stornarea: cantitati negate, documentul de referinta cu refund, cheie proprie", () => {
    const p = stornoOblio({ ...FACTURA, series: "LL", number: 7, oblio_numar: "0007" }, PERSOANA, LINII, SETARI, COTE, "2026-09-20");
    expect(p.referenceDocument).toEqual({ type: "Factura", seriesName: "LL", number: "0007", refund: 1 });
    expect(p.products.map((l) => l.quantity)).toEqual([-2, -1]);
    expect(p.idempotencyKey).toBe("pms-storno-inv-1");
    expect(p.mentions).toBe("Stornare factură LL 0007");
    expect(p.issueDate).toBe("2026-09-20");
  });
  it("anularea cere doar cif, serie si numarul exact al lui Oblio", () => {
    expect(anulareOblio({ id: "i", series: "LL", number: 7, oblio_numar: "0007" }, SETARI)).toEqual({ cif: "RO12345678", seriesName: "LL", number: "0007" });
    expect(anulareOblio({ id: "i", series: "LL", number: 7 }, SETARI).number).toBe("7");
  });
  it("raspunsul la emitere: serie, numar, link — sau eroare", () => {
    expect(raspunsEmitere({ seriesName: "LL", number: "0007", link: "https://www.oblio.eu/x" })).toEqual({ serie: "LL", numar: "0007", link: "https://www.oblio.eu/x" });
    expect(raspunsEmitere({ seriesName: "LL", number: 7 }).numar).toBe("7");
    expect(() => raspunsEmitere({ link: "x" })).toThrow(EroareOblio);
  });
  it("fiecare actiune are o permisiune de facturare", () => {
    expect(PERMISIUNI).toEqual({
      verifica: "admin", emite: "issue_invoice", storneaza: "create_credit_note",
      anuleaza: "cancel_invoice", "efactura-trimite": "issue_invoice",
    });
  });
});
```

- [ ] **Step 2: Rulează testul — trebuie să pice**

```bash
npx vitest run src/oblio-client.test.js
```
Așteptat: FAIL, „Failed to resolve import … oblio.ts".

- [ ] **Step 3: Scrie modulul**

`supabase/functions/oblio-facturare/oblio.ts`:

```ts
// Clientul Oblio (https://www.oblio.eu/api) — singurul loc din proiect care
// știe cum arată API-ul lor. Fără `Deno.*` la nivel de modul: tot ce ține de
// mediu (fetch, credențiale, data de azi) vine ca parametru, ca modulul să
// se testeze din vitest cu un fetch fals — exact ca providers/shelly.ts.
//
// ENDPOINT-URI FOLOSITE (din documentația oficială, 16 septembrie 2026):
//   POST /api/authorize/token              token; client_id = emailul contului,
//                                          client_secret = tokenul din Setări cont
//   GET  /api/nomenclature/companies       firmele contului (verificarea CIF-ului)
//   GET  /api/nomenclature/series?cif=     seriile firmei (verificarea seriei)
//   GET  /api/nomenclature/vat_rates?cif=  cotele de TVA ale firmei
//   POST /api/docs/invoice                 emitere (și stornare, cu referenceDocument)
//   PUT  /api/docs/invoice/cancel          anulare
//   POST /api/docs/einvoice                trimitere în SPV (e-Factura)
//
// Numerotarea e a lui Oblio: nu trimitem `number`/`disableAutoSeries`, ci
// citim seria și numărul din răspuns (raspunsEmitere). Cheia de idempotență
// e fixă per factură (pms-<id>): o reîncercare după un eșec de rețea nu
// emite de două ori. Limite Oblio: 30 de documente / 100 s, alte cereri
// 30 / 10 s — la volumul pensiunii, irelevant.

export const BAZA = "https://www.oblio.eu/api";
export type Fetch = typeof fetch;

export class EroareOblio extends Error {
  constructor(mesaj: string, public status?: number) {
    super(mesaj);
    this.name = "EroareOblio";
  }
}

export interface SetariOblio { cif: string; serie: string; punctLucru?: string; trimiteEFactura?: boolean }
export interface CotaTva { name: string; percentage: number; default?: boolean }
export interface Token { valoare: string; expiraLa: number }

/* Acțiune → permisiunea de facturare cerută (has_billing_permission din
   schema.sql; adminul le are pe toate). `admin` = doar adminul. */
export const PERMISIUNI: Record<string, string> = {
  verifica: "admin",
  emite: "issue_invoice",
  storneaza: "create_credit_note",
  anuleaza: "cancel_invoice",
  "efactura-trimite": "issue_invoice",
};

/* `.trim()` pe credențiale: un spațiu lipit la copiere e cea mai frecventă
   cauză de „invalid client", și e o problemă pe care o putem rezolva. */
export async function obtineToken(f: Fetch, clientId: string, clientSecret: string, acum = Date.now()): Promise<Token> {
  const r = await f(`${BAZA}/authorize/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId.trim(), client_secret: clientSecret.trim() }).toString(),
  });
  const corp: any = await r.json().catch(() => ({}));
  if (!r.ok || !corp?.access_token) {
    throw new EroareOblio(corp?.statusMessage || corp?.error_description || `Oblio a refuzat autentificarea (HTTP ${r.status}).`, r.status);
  }
  // Un minut mai devreme decât spun ei, ca să nu prindem expirarea în zbor.
  return { valoare: String(corp.access_token), expiraLa: acum + (Number(corp.expires_in) || 3600) * 1000 - 60_000 };
}

export function tokenValabil(t: Token | null, acum = Date.now()): boolean {
  return !!t && t.expiraLa > acum;
}

/* Oblio pune codul și în corp (`status: 400`, `statusMessage`), uneori cu
   HTTP 200 — de aceea se citesc amândouă. Întoarce `data`. */
export async function cereOblio(
  f: Fetch, token: string, metoda: "GET" | "POST" | "PUT" | "DELETE", cale: string, corp?: unknown,
): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (corp !== undefined) headers["Content-Type"] = "application/json";
  const r = await f(`${BAZA}${cale}`, { method: metoda, headers, body: corp !== undefined ? JSON.stringify(corp) : undefined });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const statusIntern = Number(json?.status) || 0;
  if (!r.ok || (statusIntern && statusIntern !== 200)) {
    const mesaj = json?.statusMessage || json?.message || text.slice(0, 200) || `Oblio a răspuns cu HTTP ${r.status}.`;
    throw new EroareOblio(String(mesaj), statusIntern || r.status);
  }
  return json?.data ?? json;
}

/* Cota PMS (21 / 11 / 0) → intrarea din nomenclatorul Oblio cu același
   procent; la egalitate, cea marcată implicită. Lipsă = oprim emiterea. */
export function alegeCota(cote: CotaTva[], procent: number): CotaTva {
  const potrivite = cote.filter((c) => Number(c.percentage) === Number(procent));
  const aleasa = potrivite.find((c) => c.default) || potrivite[0];
  if (!aleasa) {
    throw new EroareOblio(`Cota de TVA ${procent}% nu există în contul Oblio — adaug-o în Oblio (Setări → Cote TVA) sau schimbă cota produsului.`);
  }
  return aleasa;
}

/* Data facturii e ziua de la pensiune, nu UTC: la 00:30 la Vaslui e încă
   „ieri" în UTC. `en-CA` dă direct YYYY-MM-DD. */
export function aziBucuresti(acum = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(acum);
}
export function ziRo(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export interface ClientPms {
  kind: string; last_name?: string | null; first_name?: string | null; cnp?: string | null;
  company_name?: string | null; cui?: string | null; reg_com?: string | null; contact_name?: string | null;
  address?: string | null; city?: string | null; county?: string | null; country?: string | null;
  email?: string | null; phone?: string | null;
}
export interface LiniePms {
  name: string; quantity: number | string; unit_price: number | string; vat_rate: number | string;
  unit?: string | null; category?: string | null;
}
export interface FacturaPms {
  id: string; series?: string | null; number?: number | null; oblio_numar?: string | null;
  oblio_cheie?: string | null; notes?: string | null;
  service_date_start?: string | null; service_date_end?: string | null;
}

/* Clientul vine din billing_customers, nu din nomenclatorul lor (save: 0).
   Firmă cu CUI cu „RO" = plătitoare de TVA; persoană: CNP-ul, dacă e. */
export function clientOblio(c: ClientPms) {
  const firma = c.kind === "company";
  const nume = firma ? (c.company_name || "") : [c.last_name, c.first_name].filter(Boolean).join(" ");
  const cui = (c.cui || "").trim();
  return {
    cif: firma ? cui : (c.cnp || "").trim(),
    name: nume.trim(),
    rc: firma ? (c.reg_com || "") : "",
    address: c.address || "",
    city: c.city || "",
    state: c.county || "",
    country: c.country || "România",
    email: c.email || "",
    phone: c.phone || "",
    contact: firma ? (c.contact_name || "") : "",
    vatPayer: firma && /^ro/i.test(cui),
    save: 0,
  };
}

/* Prețul unitar e cu TVA inclus (lib/money.js), deci vatIncluded: 1 și
   Oblio recalculează exact ce a calculat PMS-ul. `semn` = -1 la stornare. */
export function liniiOblio(linii: LiniePms[], cote: CotaTva[], semn: 1 | -1 = 1) {
  return linii.map((l) => {
    const cota = alegeCota(cote, Number(l.vat_rate));
    return {
      name: l.name,
      price: Number(l.unit_price),
      quantity: semn * Number(l.quantity),
      measuringUnit: l.unit || "buc",
      currency: "RON",
      vatName: cota.name,
      vatPercentage: Number(cota.percentage),
      vatIncluded: 1,
      productType: l.category === "cazare" ? "Serviciu" : "Marfa",
      save: 0,
    };
  });
}

function antet(setari: SetariOblio, azi: string) {
  return {
    cif: setari.cif.trim(), seriesName: setari.serie.trim(), issueDate: azi,
    language: "RO", currency: "RON", precision: 2,
    workStation: (setari.punctLucru || "Sediu").trim(),
    sendEmail: 0, useStock: 0,
  };
}

export function facturaOblio(factura: FacturaPms, client: ClientPms, linii: LiniePms[], setari: SetariOblio, cote: CotaTva[], azi: string) {
  const perioada = factura.service_date_start && factura.service_date_end
    ? `Servicii de cazare în perioada ${ziRo(factura.service_date_start)} – ${ziRo(factura.service_date_end)}`
    : "";
  return {
    ...antet(setari, azi),
    mentions: [perioada, factura.notes || ""].filter(Boolean).join("\n"),
    idempotencyKey: factura.oblio_cheie || `pms-${factura.id}`,
    client: clientOblio(client),
    products: liniiOblio(linii, cote),
  };
}

/* Stornarea e tot un POST /docs/invoice: liniile originalului cu cantități
   negate și documentul de referință cu refund: 1. Oblio dă numărul. */
export function stornoOblio(factura: FacturaPms, client: ClientPms, linii: LiniePms[], setari: SetariOblio, cote: CotaTva[], azi: string) {
  const numar = factura.oblio_numar || String(factura.number ?? "");
  return {
    ...antet(setari, azi),
    mentions: `Stornare factură ${factura.series} ${numar}`,
    idempotencyKey: `pms-storno-${factura.id}`,
    client: clientOblio(client),
    products: liniiOblio(linii, cote, -1),
    referenceDocument: { type: "Factura", seriesName: factura.series || "", number: numar, refund: 1 },
  };
}

export function anulareOblio(factura: FacturaPms, setari: SetariOblio) {
  return { cif: setari.cif.trim(), seriesName: factura.series || "", number: factura.oblio_numar || String(factura.number ?? "") };
}

export function raspunsEmitere(data: any): { serie: string; numar: string; link: string } {
  const serie = String(data?.seriesName || "");
  const numar = data?.number == null ? "" : String(data.number);
  const link = String(data?.link || "");
  if (!serie || !numar) throw new EroareOblio("Oblio a răspuns fără serie sau număr.");
  return { serie, numar, link };
}
```

- [ ] **Step 4: Rulează testul — trece**

```bash
npx vitest run src/oblio-client.test.js
```
Așteptat: PASS, 16 teste.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
rm -f s drumul
git add supabase/functions/oblio-facturare/oblio.ts src/oblio-client.test.js
git commit -q -m 'Oblio: clientul API, pur si testat' -m 'oblio.ts fara Deno la nivel de modul: token, cereri cu erorile lor, cota de TVA dupa procent din nomenclatorul Oblio, clientul din billing_customers, liniile cu TVA inclus, factura, stornarea (cantitati negate + referenceDocument refund) si anularea. 16 teste cu fetch fals.' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 3: Funcția edge `oblio-facturare`

**Files:**
- Create: `supabase/functions/oblio-facturare/index.ts`

**Interfaces:**
- Consumes: tot din `oblio.ts` (Task 2); funcțiile SQL din Task 1; `has_billing_permission(perm)`.
- Produces (pentru `src/data/oblio.js`, Task 4): `POST /functions/v1/oblio-facturare` cu JWT-ul userului, corp `{ action, invoiceId?, cif?, serie? }`. Răspunsuri:
  - `verifica {cif, serie}` → `{ ok: true, firma: string, serii: [{nume, urmatorul}], seriaOk: boolean, cote: CotaTva[] }`
  - `emite {invoiceId}` → `{ ok: true, factura }` (rândul `invoices` emis)
  - `storneaza {invoiceId}` → `{ ok: true, stornare, original }`
  - `anuleaza {invoiceId}` → `{ ok: true, factura }`
  - `efactura-trimite {invoiceId}` → `{ ok: true, factura, cod }`
  - orice eșec → HTTP 4xx/5xx cu `{ ok: false, error: string }` (mesajele Oblio prefixate cu „Oblio: ")

- [ ] **Step 1: Scrie handler-ul**

`supabase/functions/oblio-facturare/index.ts`:

```ts
// Facturarea prin Oblio (https://www.oblio.eu/api; docs/oblio.md). Browserul
// nu vorbește niciodată direct cu Oblio: acolo ar trebui să stea tokenul
// contului, care poate emite și anula orice document al firmei. Funcția
// primește doar id-ul facturii din PMS și o acțiune, citește singură restul,
// cere Oblio-ului documentul și abia apoi scrie în baza noastră ce a răspuns.
//
// POST {action, invoiceId?, cif?, serie?} cu JWT-ul userului logat (se
// deployează cu verify_jwt, cel implicit). Acțiunile și permisiunea de
// facturare cerută: PERMISIUNI din oblio.ts.
//
// Secretele (Dashboard → Edge Functions → Secrets, niciodată în repo):
//   OBLIO_CLIENT_ID      emailul contului Oblio
//   OBLIO_CLIENT_SECRET  tokenul din Oblio → Setări → Date cont
// Setările fără secret (CIF, seria, activ) stau în app_state `pms:oblio:v1`.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  obtineToken, tokenValabil, cereOblio, aziBucuresti, facturaOblio, stornoOblio, anulareOblio,
  raspunsEmitere, EroareOblio, PERMISIUNI, type Token, type SetariOblio, type CotaTva,
} from "./oblio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CLIENT_ID = (Deno.env.get("OBLIO_CLIENT_ID") || "").trim();
const CLIENT_SECRET = (Deno.env.get("OBLIO_CLIENT_SECRET") || "").trim();
const CHEIE_SETARI = "pms:oblio:v1";

// CORS ca la anaf-lookup: doar aplicația și originile de dezvoltare.
const ORIGINI_PERMISE = [
  "https://pms.lalivada.ro", "http://localhost:5173", "http://127.0.0.1:5173",
  ...(Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o) => o.trim()).filter(Boolean),
];
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ORIGINI_PERMISE.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
const raspunde = (req: Request, corp: unknown, status = 200) =>
  new Response(JSON.stringify(corp), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });

/* Erori ale cererii (factura nu există, stare nepotrivită): ajung la om cu
   statusul lor, nu ca „Oblio: …". */
class EroareCerere extends Error {
  constructor(mesaj: string, public status = 400) { super(mesaj); this.name = "EroareCerere"; }
}

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/* Tokenul ține o oră; îl păstrăm în memorie cât trăiește instanța, ca la
   TTLock. Nu se scrie în baza de date. */
let token: Token | null = null;
async function tokenOblio(): Promise<string> {
  if (!tokenValabil(token)) token = await obtineToken(fetch, CLIENT_ID, CLIENT_SECRET);
  return token!.valoare;
}
const oblio = async (metoda: "GET" | "POST" | "PUT", cale: string, corp?: unknown) =>
  cereOblio(fetch, await tokenOblio(), metoda, cale, corp);

async function setari(): Promise<SetariOblio & { activ: boolean }> {
  const { data, error } = await admin.from("app_state").select("value").eq("key", CHEIE_SETARI).maybeSingle();
  if (error) throw new Error(`Nu pot citi setările Oblio: ${error.message}`);
  const v = (data?.value || {}) as any;
  return {
    activ: v.activ === true,
    cif: String(v.cif || "").trim(),
    serie: String(v.serie || "").trim(),
    punctLucru: String(v.punctLucru || "Sediu"),
    trimiteEFactura: v.trimiteEFactura === true,
  };
}

async function cote(cif: string): Promise<CotaTva[]> {
  const d = await oblio("GET", `/nomenclature/vat_rates?cif=${encodeURIComponent(cif)}`);
  return (Array.isArray(d) ? d : []).map((c: any) => ({ name: String(c.name), percentage: Number(c.percentage), default: !!c.default }));
}

/* Factura + clientul + liniile, cu unitatea și categoria produsului, cum le
   vrea oblio.ts. Citirea e cu service_role: permisiunea s-a verificat deja
   pe JWT-ul omului, mai jos. */
async function citesteFactura(id: string) {
  const { data: factura, error } = await admin.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!factura) throw new EroareCerere("Factura nu există.", 404);
  const [client, linii] = await Promise.all([
    admin.from("billing_customers").select("*").eq("id", factura.billing_customer_id).maybeSingle(),
    admin.from("invoice_items").select("*, products(unit, category)").eq("invoice_id", id).order("sort_order"),
  ]);
  if (client.error) throw new Error(client.error.message);
  if (linii.error) throw new Error(linii.error.message);
  if (!client.data) throw new EroareCerere("Factura n-are client de facturare.");
  return {
    factura,
    client: client.data,
    linii: (linii.data || []).map((l: any) => ({ ...l, unit: l.products?.unit || "buc", category: l.products?.category || "" })),
  };
}

async function rpc(nume: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(nume, args);
  if (error) throw new EroareCerere(error.message, 409);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return raspunde(req, { ok: false, error: "Metodă nepermisă." }, 405);

  let corp: any;
  try { corp = await req.json(); } catch { return raspunde(req, { ok: false, error: "Corp invalid." }, 400); }
  const action = String(corp?.action || "");
  const permisiune = PERMISIUNI[action];
  if (!permisiune) return raspunde(req, { ok: false, error: `Acțiune necunoscută: ${action}` }, 400);

  // Cine cere: JWT-ul (Supabase l-a verificat deja), apoi rândul din staff.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return raspunde(req, { ok: false, error: "Neautentificat." }, 401);
  const { data: staff } = await admin.from("staff").select("user_id, role").eq("user_id", auth.user.id).maybeSingle();
  if (!staff) return raspunde(req, { ok: false, error: "Contul nu e în personal." }, 403);
  if (permisiune === "admin") {
    if (staff.role !== "admin") return raspunde(req, { ok: false, error: "Doar adminul poate verifica legătura cu Oblio." }, 403);
  } else {
    // Aceeași regulă ca în baza de date, evaluată pe JWT-ul omului.
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: are, error } = await userClient.rpc("has_billing_permission", { perm: permisiune });
    if (error || !are) return raspunde(req, { ok: false, error: "Nu ai permisiunea pentru această acțiune." }, 403);
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return raspunde(req, { ok: false, error: "Oblio nu e configurat: lipsesc OBLIO_CLIENT_ID / OBLIO_CLIENT_SECRET din secretele funcției." }, 503);
  }

  try {
    if (action === "verifica") {
      const cif = String(corp.cif || "").trim();
      const serie = String(corp.serie || "").trim();
      if (!cif) throw new EroareCerere("Lipsește CIF-ul.");
      const firme = await oblio("GET", "/nomenclature/companies");
      const fara = (s: string) => s.replace(/^RO/i, "").trim();
      const firma = (Array.isArray(firme) ? firme : []).find((f: any) => fara(String(f.cif || "")) === fara(cif));
      if (!firma) throw new EroareCerere(`CIF-ul ${cif} nu e printre firmele contului Oblio.`);
      const serii = await oblio("GET", `/nomenclature/series?cif=${encodeURIComponent(cif)}`);
      const listaSerii = (Array.isArray(serii) ? serii : [])
        .filter((s: any) => /factura/i.test(String(s.type || "")))
        .map((s: any) => ({ nume: String(s.name), urmatorul: s.next ?? null }));
      return raspunde(req, {
        ok: true,
        firma: String(firma.company || firma.name || cif),
        serii: listaSerii,
        seriaOk: !serie || listaSerii.some((s) => s.nume === serie),
        cote: await cote(cif),
      });
    }

    const s = await setari();
    if (!s.activ) throw new EroareCerere("Facturarea prin Oblio nu e pornită (Financiar → Oblio).", 409);
    if (!s.cif || !s.serie) throw new EroareCerere("Setările Oblio sunt incomplete: CIF-ul și seria.", 409);
    const invoiceId = String(corp.invoiceId || "");
    if (!invoiceId) throw new EroareCerere("Lipsește invoiceId.");

    if (action === "emite") {
      // (a) blochează draftul și îi dă cheia; (b) cere Oblio; (c) scrie ce a
      // răspuns. Un eșec la (b) lasă draftul cu oblio_stare = 'eroare' și
      // mesajul lor — omul îl vede și reîncearcă, cu aceeași cheie, deci
      // Oblio nu emite de două ori.
      const blocata = await rpc("oblio_incepe_emiterea", { p_id: invoiceId });
      let rezultat: { serie: string; numar: string; link: string };
      try {
        const { factura, client, linii } = await citesteFactura(invoiceId);
        const payload = facturaOblio({ ...factura, oblio_cheie: blocata.oblio_cheie }, client, linii, s, await cote(s.cif), aziBucuresti());
        rezultat = raspunsEmitere(await oblio("POST", "/docs/invoice", payload));
      } catch (e) {
        await rpc("oblio_marcheaza_eroare", { p_id: invoiceId, p_mesaj: (e as Error).message });
        throw e;
      }
      let factura;
      try {
        factura = await rpc("oblio_finalizeaza_emiterea", {
          p_id: invoiceId, p_serie: rezultat.serie, p_numar: rezultat.numar, p_link: rezultat.link, p_de: auth.user.id,
        });
      } catch (e) {
        // Oblio a emis, noi n-am putut scrie: nu se ascunde și nu se repetă.
        throw new EroareCerere(`Oblio a emis ${rezultat.serie} ${rezultat.numar}, dar PMS-ul n-a putut-o înregistra: ${(e as Error).message}. Verifică în Oblio înainte de a reîncerca.`, 500);
      }
      if (s.trimiteEFactura) {
        try {
          const ef = await oblio("POST", "/docs/einvoice", { cif: s.cif, seriesName: rezultat.serie, number: rezultat.numar });
          factura = await rpc("oblio_actualizeaza_efactura", { p_id: invoiceId, p_cod: Number(ef?.code ?? -1) });
        } catch (e) {
          // Factura e emisă; SPV-ul se poate retrimite din fereastra ei.
          console.error("e-Factura", (e as Error).message);
        }
      }
      return raspunde(req, { ok: true, factura });
    }

    if (action === "storneaza") {
      const { factura, client, linii } = await citesteFactura(invoiceId);
      if (!["issued", "partially_paid", "paid"].includes(factura.status)) {
        throw new EroareCerere(`Factura este ${factura.status} — se pot storna doar facturi emise.`, 409);
      }
      if (factura.oblio_stare !== "emisa") throw new EroareCerere("Factura n-a fost emisă prin Oblio — stornarea ei merge pe drumul vechi.", 409);
      const payload = stornoOblio(factura, client, linii, s, await cote(s.cif), aziBucuresti());
      const rezultat = raspunsEmitere(await oblio("POST", "/docs/invoice", payload));
      const data = await rpc("oblio_finalizeaza_stornarea", {
        p_id: invoiceId, p_serie: rezultat.serie, p_numar: rezultat.numar, p_link: rezultat.link, p_de: auth.user.id,
      });
      return raspunde(req, { ok: true, ...data });
    }

    if (action === "anuleaza") {
      const { factura } = await citesteFactura(invoiceId);
      if (factura.status !== "issued" || Number(factura.paid_amount) !== 0) {
        throw new EroareCerere("O factură se poate anula doar din stadiul „emisă” și fără plăți înregistrate.", 409);
      }
      if (factura.oblio_stare !== "emisa") throw new EroareCerere("Factura n-a fost emisă prin Oblio — anularea ei merge pe drumul vechi.", 409);
      await oblio("PUT", "/docs/invoice/cancel", anulareOblio(factura, s));
      const data = await rpc("oblio_finalizeaza_anularea", { p_id: invoiceId });
      return raspunde(req, { ok: true, factura: data });
    }

    if (action === "efactura-trimite") {
      const { factura } = await citesteFactura(invoiceId);
      if (factura.oblio_stare !== "emisa") throw new EroareCerere("Factura n-a fost emisă prin Oblio.", 409);
      const ef = await oblio("POST", "/docs/einvoice", { cif: s.cif, seriesName: factura.series, number: factura.oblio_numar || String(factura.number) });
      const cod = Number(ef?.code ?? -1);
      const data = await rpc("oblio_actualizeaza_efactura", { p_id: invoiceId, p_cod: cod });
      return raspunde(req, { ok: true, factura: data, cod });
    }

    throw new EroareCerere(`Acțiune necunoscută: ${action}`);
  } catch (e) {
    const mesaj = (e as Error).message || "Oblio nu a răspuns.";
    console.error("oblio-facturare", action, mesaj);
    if (e instanceof EroareCerere) return raspunde(req, { ok: false, error: mesaj }, e.status);
    if (e instanceof EroareOblio) return raspunde(req, { ok: false, error: `Oblio: ${mesaj}` }, 502);
    return raspunde(req, { ok: false, error: mesaj }, 500);
  }
});
```

- [ ] **Step 2: Testele existente încă trec (modulul pur nu s-a schimbat)**

```bash
npx vitest run src/oblio-client.test.js
```
Așteptat: PASS.

- [ ] **Step 3: Deploy și proba de fum**

```bash
npx --no-install supabase functions deploy oblio-facturare --project-ref suoowrginsliyrbxqeap
```
Așteptat: „Deployed Functions on project suoowrginsliyrbxqeap: oblio-facturare". Apoi, fără JWT, gateway-ul trebuie să refuze (nu funcția noastră):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://suoowrginsliyrbxqeap.supabase.co/functions/v1/oblio-facturare" -H "Content-Type: application/json" -d '{"action":"verifica"}'
```
Așteptat: `401`. Verificarea cu un user logat se face din PMS, la Task 5 (după ce Ovidiu pune secretele — până atunci răspunsul e 503 cu „Oblio nu e configurat", ceea ce e corect).

- [ ] **Step 4: Commit**

```bash
rm -f s drumul
git add supabase/functions/oblio-facturare/index.ts
git commit -q -m 'Oblio: functia edge oblio-facturare (verifica, emite, storneaza, anuleaza, e-Factura)' -m 'JWT-ul userului + has_billing_permission pe fiecare actiune; emiterea in trei pasi (blocheaza draftul, cere Oblio cu cheie de idempotenta, scrie raspunsul), cu draftul pastrat si mesajul lui Oblio la esec. Tokenul sta doar in memoria instantei. Deployata cu verify_jwt.' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 4: `src/data/oblio.js` — setările și apelul din browser

**Files:**
- Create: `src/data/oblio.js`
- Test: `src/oblio-date.test.js`

**Interfaces:**
- Consumes: `loadShared`, `saveShared` din `src/data/stare-partajata.js`; `supabase.functions.invoke`.
- Produces:
  - `CHEIE_OBLIO = "pms:oblio:v1"`, `SETARI_OBLIO_GOALE = { activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false }`
  - `setariOblio(): Promise<Setari>` (completează câmpurile lipsă), `salveazaSetariOblio(setari): Promise<true>` (normalizează CIF-ul și seria), `oblioActiv(setari): boolean`
  - `cheamaOblio(action, payload?): Promise<{ok: boolean, error?: string, ...}>` — nu aruncă niciodată

- [ ] **Step 1: Scrie testul care pică**

`src/oblio-date.test.js`:

```js
/* Drumul din browser catre Oblio (data/oblio.js): setarile din app_state
 * (lipsa = oprit; salvarea normalizeaza CIF-ul si seria) si apelul functiei
 * edge, care intoarce mereu {ok, ...} — inclusiv mesajul functiei la HTTP
 * 4xx/5xx si un mesaj de om la caderea retelei. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const stare = new Map();
vi.mock("./supabase.js", () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }));
vi.mock("./data/stare-partajata.js", () => ({
  loadShared: vi.fn(async (k, f) => (stare.has(k) ? stare.get(k) : f)),
  saveShared: vi.fn(async (k, v) => { stare.set(k, v); return true; }),
}));
const { setariOblio, salveazaSetariOblio, oblioActiv, cheamaOblio, CHEIE_OBLIO, SETARI_OBLIO_GOALE } = await import("./data/oblio.js");

beforeEach(() => { invoke.mockReset(); stare.clear(); });

describe("setarile Oblio", () => {
  it("lipsa = oprit, cu campurile goale", async () => {
    expect(await setariOblio()).toEqual({ activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false });
    expect(oblioActiv(await setariOblio())).toBe(false);
    expect(oblioActiv(null)).toBe(false);
  });
  it("salvarea normalizeaza CIF-ul si seria, iar citirea completeaza campurile lipsa", async () => {
    await salveazaSetariOblio({ activ: true, cif: " ro123 ", serie: " LL " });
    expect(stare.get(CHEIE_OBLIO)).toEqual({ ...SETARI_OBLIO_GOALE, activ: true, cif: "RO123", serie: "LL" });
    stare.set(CHEIE_OBLIO, { activ: true, cif: "RO1" });
    expect(await setariOblio()).toEqual({ activ: true, cif: "RO1", serie: "", punctLucru: "Sediu", trimiteEFactura: false });
    expect(oblioActiv(await setariOblio())).toBe(true);
  });
});

describe("cheamaOblio", () => {
  it("trimite actiunea si restul corpului, intoarce raspunsul", async () => {
    invoke.mockResolvedValue({ data: { ok: true, factura: { id: "i" } }, error: null });
    expect(await cheamaOblio("emite", { invoiceId: "i" })).toEqual({ ok: true, factura: { id: "i" } });
    expect(invoke).toHaveBeenCalledWith("oblio-facturare", { body: { action: "emite", invoiceId: "i" } });
  });
  it("eroarea HTTP a functiei ajunge cu mesajul ei", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: { json: async () => ({ error: "Oblio: Seria nu exista" }) } } });
    expect(await cheamaOblio("emite", { invoiceId: "i" })).toEqual({ ok: false, error: "Oblio: Seria nu exista" });
  });
  it("caderea retelei devine un mesaj de om, nu o exceptie", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request to the Edge Function" } });
    const r = await cheamaOblio("verifica", {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/conexiunea/);
    invoke.mockRejectedValue(new Error("boom"));
    expect(await cheamaOblio("verifica", {})).toEqual({ ok: false, error: "boom" });
    invoke.mockResolvedValue({ data: null, error: null });
    expect((await cheamaOblio("verifica", {})).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rulează — pică**

```bash
npx vitest run src/oblio-date.test.js
```
Așteptat: FAIL, „Failed to resolve import "./data/oblio.js"".

- [ ] **Step 3: Scrie modulul**

`src/data/oblio.js`:

```js
// @ts-check
/* Oblio (oblio.eu, docs/oblio.md) — drumul din browser: setarile fara secret
 * din app_state (`pms:oblio:v1`) si apelul catre functia edge
 * `oblio-facturare`. Browserul nu vorbeste niciodata direct cu Oblio:
 * tokenul contului sta doar in secretele functiei
 * (supabase/functions/oblio-facturare/index.ts). */

import { supabase } from "../supabase.js";
import { loadShared, saveShared } from "./stare-partajata.js";

export const CHEIE_OBLIO = "pms:oblio:v1";

/* `activ` decide pe unde ies facturile: prin Oblio (functia edge) sau pe
   drumul vechi (emite_factura, seria locala). Cat e oprit, nimic din restul
   nu se atinge — se poate configura si verifica inainte de a porni. Cheia
   e scrisa doar de admin (politica RLS pe app_state). */
export const SETARI_OBLIO_GOALE = Object.freeze({
  activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false,
});

export async function setariOblio() {
  const s = await loadShared(CHEIE_OBLIO, SETARI_OBLIO_GOALE);
  return { ...SETARI_OBLIO_GOALE, ...s };
}

export function salveazaSetariOblio(setari) {
  return saveShared(CHEIE_OBLIO, {
    ...SETARI_OBLIO_GOALE,
    ...setari,
    cif: String(setari.cif || "").trim().toUpperCase(),
    serie: String(setari.serie || "").trim(),
  });
}

export const oblioActiv = (setari) => setari?.activ === true;

/* Intoarce mereu un obiect {ok, ...}, niciodata nu arunca — ca
   cheamaDispozitiv: apelantii arata mesajul si merg mai departe. */
export async function cheamaOblio(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("oblio-facturare", { body: { action, ...payload } });
    if (error) {
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };
      const retea = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: retea
          ? "Nu am putut contacta serviciul de facturare. Verifică conexiunea și încearcă din nou."
          : (error.message || "Serviciul de facturare a răspuns cu eroare."),
      };
    }
    return data || { ok: false, error: "Răspuns gol de la serviciul de facturare." };
  } catch (e) {
    return { ok: false, error: e?.message || "Serviciul de facturare nu a răspuns." };
  }
}
```

- [ ] **Step 4: Rulează — trece; typecheck**

```bash
npx vitest run src/oblio-date.test.js && npm run typecheck
```
Așteptat: PASS (5 teste), typecheck fără erori.

- [ ] **Step 5: Commit**

```bash
rm -f s drumul
git add src/data/oblio.js src/oblio-date.test.js
git commit -q -m 'Oblio: setarile pms:oblio:v1 si apelul functiei edge din browser' -m 'data/oblio.js: setariOblio/salveazaSetariOblio (lipsa = oprit; CIF-ul si seria normalizate), oblioActiv, cheamaOblio care nu arunca niciodata. 5 teste.' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 5: Tabul „Oblio" din Financiar

**Files:**
- Create: `src/features/facturare/oblio.jsx`
- Modify: `src/features/facturare/financiar.jsx` (tabul), `src/features/facturare.jsx` (poarta), `src/facturare-poarta.test.js:13-21` (`NUMELE`), `src/styles/pms.css` (clasele noi, înainte de `/* ---------- Responsive overrides`)
- Test: `src/oblio-ecran.test.js`

**Interfaces:**
- Consumes: `setariOblio`, `salveazaSetariOblio`, `cheamaOblio` (Task 4); `billingPerms` din `src/lib/permisiuni.js`.
- Produces: `OblioView({ core })` exportată din poartă.

- [ ] **Step 1: Scrie testul care pică**

`src/oblio-ecran.test.js`:

```js
/* Tabul „Oblio” din Financiar (features/facturare/oblio.jsx): setarile citite
 * din app_state, CIF-ul preluat de la emitent cand lipseste, pornirea
 * refuzata fara serie, salvarea, si verificarea legaturii cu raspunsul
 * functiei edge (firma, serii, cote) sau eroarea ei. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}) } }));

let setari = { activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false };
const salveazaSetariOblio = vi.fn(async (s) => {
  setari = { ...setari, ...s, cif: s.cif.trim().toUpperCase(), serie: s.serie.trim() };
  return true;
});
const cheamaOblio = vi.fn(async () => ({
  ok: true, firma: "La Livada SRL", serii: [{ nume: "LL", urmatorul: 1 }], seriaOk: true,
  cote: [{ name: "Normala", percentage: 21 }, { name: "Redusa", percentage: 11 }],
}));
vi.mock("./data/oblio.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, setariOblio: vi.fn(async () => ({ ...setari })), salveazaSetariOblio, cheamaOblio };
});

const { OblioView } = await import("./features/facturare/oblio.jsx");

const montate = [];
async function randeaza(core = { invoiceIssuer: { cui: "ro12345678" } }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(OblioView, { core })); });
  await act(async () => {});
  return host;
}
const butonText = (host, text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const apasa = async (el) => { await act(async () => { el.click(); }); await act(async () => {}); };
const scrie = async (input, valoare) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, valoare);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const camp = (host, eticheta) => [...host.querySelectorAll("label.field")].find((l) => l.textContent.includes(eticheta))?.querySelector("input");

beforeEach(() => {
  setari = { activ: false, cif: "", serie: "", punctLucru: "Sediu", trimiteEFactura: false };
  salveazaSetariOblio.mockClear();
  cheamaOblio.mockClear();
});
afterEach(() => {
  for (const { root, host } of montate.splice(0)) { act(() => root.unmount()); host.remove(); }
});

describe("OblioView", () => {
  it("preia CIF-ul de la emitent cand setarile n-au unul si porneste oprit", async () => {
    const host = await randeaza();
    expect(camp(host, "CIF").value).toBe("RO12345678");
    expect(camp(host, "Emite facturile prin Oblio").checked).toBe(false);
    expect(host.textContent).toContain("Modificări nesalvate");
  });
  it("nu lasa pornirea fara serie", async () => {
    const host = await randeaza();
    await apasa(camp(host, "Emite facturile prin Oblio"));
    await apasa(butonText(host, "Salvează"));
    expect(salveazaSetariOblio).not.toHaveBeenCalled();
  });
  it("salveaza CIF-ul, seria si pornirea", async () => {
    const host = await randeaza();
    await scrie(camp(host, "Seria facturilor"), " LL ");
    await apasa(camp(host, "Emite facturile prin Oblio"));
    await apasa(butonText(host, "Salvează"));
    expect(salveazaSetariOblio).toHaveBeenCalledTimes(1);
    expect(salveazaSetariOblio.mock.calls[0][0]).toMatchObject({ activ: true, cif: "RO12345678", serie: " LL " });
    expect(host.textContent).not.toContain("Modificări nesalvate");
  });
  it("verificarea arata firma, seriile si cotele din Oblio, sau eroarea", async () => {
    const host = await randeaza();
    await apasa(butonText(host, "Verifică legătura"));
    expect(cheamaOblio).toHaveBeenCalledWith("verifica", { cif: "RO12345678", serie: "" });
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("La Livada SRL");
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("Normala 21%, Redusa 11%");
    cheamaOblio.mockResolvedValueOnce({ ok: false, error: "Oblio: Invalid client" });
    await apasa(butonText(host, "Verifică legătura"));
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("Invalid client");
  });
  it("spune cand seria ceruta nu exista in Oblio", async () => {
    const host = await randeaza();
    await scrie(camp(host, "Seria facturilor"), "XX");
    cheamaOblio.mockResolvedValueOnce({ ok: true, firma: "La Livada SRL", serii: [{ nume: "LL", urmatorul: 1 }], seriaOk: false, cote: [] });
    await apasa(butonText(host, "Verifică legătura"));
    expect(host.querySelector(".oblio-rezultat").textContent).toContain("seria „XX” nu există");
  });
});
```

- [ ] **Step 2: Rulează — pică**

```bash
npx vitest run src/oblio-ecran.test.js
```
Așteptat: FAIL, „Failed to resolve import "./features/facturare/oblio.jsx"".

- [ ] **Step 3: Scrie componenta**

`src/features/facturare/oblio.jsx`:

```jsx
/* FACTURARE / OBLIO — setarile legaturii cu oblio.eu (CIF, seria, pornit /
 * oprit, e-Factura) si verificarea ei. Secretul contului NU trece pe aici:
 * sta doar in secretele functiei edge `oblio-facturare`; de aici se salveaza
 * doar ce nu e secret, in app_state `pms:oblio:v1` (scris doar de admin —
 * politica RLS). Vezi docs/oblio.md.
 */

import { useState, useEffect } from "react";
import { Check, PlugZap } from "lucide-react";
import * as dateOblio from "../../data/oblio.js";
import { mesajEroare } from "../../lib/errors.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";

export function OblioView({ core }) {
  const [salvat, setSalvat] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  /* null | { ruleaza: true } | raspunsul functiei ({ok, ...} / {ok:false, error}) */
  const [verificare, setVerificare] = useState(null);
  const cuiEmitent = (core?.invoiceIssuer?.cui || "").trim().toUpperCase();

  useEffect(() => {
    let viu = true;
    dateOblio.setariOblio().then((s) => {
      if (!viu) return;
      /* CIF-ul e acelasi cu al emitentului de pe factura; il propunem cand
         setarile Oblio n-au inca unul. */
      setSalvat(s);
      setDraft({ ...s, cif: s.cif || cuiEmitent });
    });
    return () => { viu = false; };
  }, [cuiEmitent]);

  if (!draft) return <div className="note">Se încarcă…</div>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(salvat);
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async () => {
    if (draft.activ && (!draft.cif.trim() || !draft.serie.trim())) {
      toaster.show("Ca să pornești Oblio, completează CIF-ul și seria.", { tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      await dateOblio.salveazaSetariOblio(draft);
      const s = await dateOblio.setariOblio();
      setSalvat(s);
      setDraft(s);
      await audit.push(s.activ ? "Facturare prin Oblio pornită" : "Setări Oblio salvate", `${s.cif} · seria ${s.serie || "—"}`);
      toaster.show("Setările Oblio au fost salvate", { tone: "ok" });
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut salva setările Oblio"), { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const verifica = async () => {
    setVerificare({ ruleaza: true });
    setVerificare(await dateOblio.cheamaOblio("verifica", { cif: draft.cif.trim(), serie: draft.serie.trim() }));
  };

  const serie = draft.serie.trim();
  return (
    <div className="panel oblio-panel">
      <div className="section-head oblio-head">Facturare prin Oblio</div>
      <p className="note">
        Facturile se emit în contul Oblio al firmei (serie, număr, PDF, e-Factura), iar PMS-ul păstrează o copie.
        Tokenul contului nu se introduce aici: adminul îl pune în Supabase → Edge Functions → Secrets
        (<code>OBLIO_CLIENT_ID</code>, <code>OBLIO_CLIENT_SECRET</code>).
      </p>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">CIF (ca în Oblio)</span><input value={draft.cif} onChange={set("cif")} placeholder="RO12345678" /></label>
        <label className="field"><span className="fl">Seria facturilor (din Oblio)</span><input value={draft.serie} onChange={set("serie")} placeholder="LL" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Punct de lucru</span><input value={draft.punctLucru} onChange={set("punctLucru")} placeholder="Sediu" /></label>
        <label className="field oblio-check">
          <input type="checkbox" checked={!!draft.trimiteEFactura} onChange={set("trimiteEFactura")} />
          Trimite în SPV (e-Factura) imediat după emitere
        </label>
      </div>
      <label className="field oblio-check oblio-activ">
        <input type="checkbox" checked={!!draft.activ} onChange={set("activ")} />
        Emite facturile prin Oblio
      </label>
      <div className="oblio-actiuni">
        <button className="btn btn-primary btn-lat" onClick={save} disabled={!dirty || saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
        <button className="btn btn-ghost btn-lat" onClick={verifica} disabled={!!verificare?.ruleaza || !draft.cif.trim()}>
          <PlugZap size={15} /> {verificare?.ruleaza ? "Se verifică…" : "Verifică legătura"}
        </button>
        {dirty && <span className="oblio-nesalvat">Modificări nesalvate</span>}
      </div>
      {verificare && !verificare.ruleaza && (
        verificare.ok ? (
          <div className="note oblio-rezultat" data-ok="1">
            <div><strong>{verificare.firma}</strong> — legătura merge.</div>
            <div>
              Serii de facturi în Oblio: {verificare.serii.map((s) => s.nume).join(", ") || "niciuna"}
              {serie && !verificare.seriaOk && <> — <strong>seria „{serie}” nu există</strong></>}
            </div>
            <div>Cote de TVA: {verificare.cote.map((c) => `${c.name} ${c.percentage}%`).join(", ") || "niciuna"}</div>
          </div>
        ) : (
          <div className="note oblio-rezultat" data-ok="0">{verificare.error}</div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 4: Clasele CSS, tabul, poarta, lista de exporturi**

În `src/styles/pms.css`, imediat înainte de linia `/* ---------- Responsive overrides (must stay last: …`:

```css
/* ---------- Oblio (features/facturare/oblio.jsx, factura.jsx) ---------- */
.btn-lat{ width:auto; }
.oblio-panel{ padding:18px; margin-bottom:20px; }
.oblio-head{ padding:0; border:none; margin-bottom:14px; }
.oblio-check{ display:flex; align-items:center; gap:8px; font-size:var(--fs-sm); }
.oblio-check input{ width:auto; margin:0; }
.oblio-activ{ font-weight:600; }
.oblio-actiuni{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px; }
.oblio-nesalvat{ color:var(--text-muted); font-size:13px; }
.oblio-rezultat{ margin-top:12px; margin-bottom:0; }
.oblio-rezultat[data-ok="0"], .oblio-eroare{ color:#B91C1C; }
.oblio-chip{ margin-left:6px; }
```

În `src/features/facturare/financiar.jsx`: importul `CloudUpload` din `lucide-react`, `import { OblioView } from "./oblio.jsx";`, `import { billingPerms } from "../../lib/permisiuni.js";`, iar în `tabs`, între „Permisiuni" și „Export":

```jsx
      {billingPerms.role === "admin" && (
        <button className={tab === "oblio" ? "on" : ""} onClick={() => setTab("oblio")}>
          <CloudUpload size={14} /> Oblio
        </button>
      )}
```
și, înainte de linia cu `tab === "export"`:
```jsx
  if (tab === "oblio") return <div>{tabs}<OblioView core={core} /></div>;
```

În `src/features/facturare.jsx`, după linia cu `BillingPermissionsView`:
```js
export { OblioView } from "./facturare/oblio.jsx";
```

În `src/facturare-poarta.test.js`, în `NUMELE`, după `"BillingPermissionsView",` adaugă `"OblioView",`.

- [ ] **Step 5: Rulează — trece**

```bash
npx vitest run src/oblio-ecran.test.js src/facturare-poarta.test.js src/stiluri-inline.test.js && npm run lint
```
Așteptat: PASS (5 + 2 + 1 teste), lint curat.

- [ ] **Step 6: Commit**

```bash
rm -f s drumul
git add src/features/facturare/oblio.jsx src/features/facturare/financiar.jsx src/features/facturare.jsx src/facturare-poarta.test.js src/styles/pms.css src/oblio-ecran.test.js
git commit -q -m 'Oblio: tabul de setari din Financiar, cu verificarea legaturii' -m 'CIF (propus din datele emitentului), seria din Oblio, punct de lucru, e-Factura la emitere, comutatorul de pornire (refuzat fara serie). „Verifica legatura” arata firma, seriile si cotele de TVA din contul Oblio. Tabul se vede doar adminului; cheia e scrisa doar de admin (RLS).' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 6: Emiterea, anularea și stornarea prin Oblio, în fereastra facturii

**Files:**
- Modify: `src/features/facturare/emitere.jsx:19-45` (`emiteFactura`), `src/features/facturare/factura.jsx` (`InvoicePrint`: încărcare, `emite`, butoane; `InvoiceCancelCreditActions`), `src/lib/constante.js:56` (după `INVOICE_STATUS_CLASS`)
- Test: `src/oblio-emitere.test.js` (nou), `src/oblio-ecran.test.js` (secțiune nouă)

**Interfaces:**
- Consumes: `dateOblio.setariOblio / oblioActiv / cheamaOblio` (Task 4); răspunsurile funcției (Task 3).
- Produces: `OBLIO_EFACTURA_LABEL`, `OBLIO_EFACTURA_CLASS` în `constante.js`; `emiteFactura(invoice)` întoarce factura emisă sau `null` (la eșec, apelantul reîncarcă).

- [ ] **Step 1: Testul unitar pentru alegerea drumului — pică**

`src/oblio-emitere.test.js`:

```js
/* emiteFactura (features/facturare/emitere.jsx) alege drumul dupa setari:
 * Oblio pornit → functia edge, cu factura intoarsa de ea; oprit → drumul
 * vechi (serie locala + emite_factura). Esecul prin Oblio intoarce null si
 * arata mesajul functiei, fara sa arunce. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const toaster = { show: vi.fn() };
vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./ui/primitive.jsx", () => ({ toaster, Dialog: () => null, useModalLock: () => {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}) } }));
const setariOblio = vi.fn();
const cheamaOblio = vi.fn();
vi.mock("./data/oblio.js", async (importOriginal) => ({ ...(await importOriginal()), setariOblio, cheamaOblio }));
const serieActiva = vi.fn(async () => "LL");
const emiteLocal = vi.fn(async () => ({ id: "i", series: "LL", number: 1 }));
vi.mock("./data/facturare.js", async (importOriginal) => ({ ...(await importOriginal()), serieActiva, emiteFactura: emiteLocal }));

const { emiteFactura } = await import("./features/facturare/emitere.jsx");
const FACTURA = { id: "i", total_amount: 100 };

beforeEach(() => { toaster.show.mockClear(); cheamaOblio.mockReset(); emiteLocal.mockClear(); });

describe("emiteFactura", () => {
  it("Oblio oprit: drumul vechi", async () => {
    setariOblio.mockResolvedValue({ activ: false });
    expect(await emiteFactura(FACTURA)).toEqual({ id: "i", series: "LL", number: 1 });
    expect(emiteLocal).toHaveBeenCalledWith("i", "LL");
    expect(cheamaOblio).not.toHaveBeenCalled();
  });
  it("Oblio pornit: functia edge, factura ei, mesaj cu numarul lui Oblio", async () => {
    setariOblio.mockResolvedValue({ activ: true, cif: "RO1", serie: "LL" });
    cheamaOblio.mockResolvedValue({ ok: true, factura: { id: "i", series: "LL", number: 7, oblio_numar: "0007", oblio_stare: "emisa" } });
    const r = await emiteFactura(FACTURA);
    expect(r.oblio_numar).toBe("0007");
    expect(cheamaOblio).toHaveBeenCalledWith("emite", { invoiceId: "i" });
    expect(emiteLocal).not.toHaveBeenCalled();
    expect(toaster.show.mock.calls[0][0]).toContain("LL 0007");
  });
  it("Oblio pornit, dar a refuzat: null si mesajul lor", async () => {
    setariOblio.mockResolvedValue({ activ: true });
    cheamaOblio.mockResolvedValue({ ok: false, error: "Oblio: Cota de TVA 5% nu există" });
    expect(await emiteFactura(FACTURA)).toBeNull();
    expect(toaster.show).toHaveBeenCalledWith("Oblio: Cota de TVA 5% nu există", { tone: "danger" });
  });
});
```

- [ ] **Step 2: Rulează — pică**

```bash
npx vitest run src/oblio-emitere.test.js
```
Așteptat: FAIL la testul 2 („expected cheamaOblio to be called") și 3.

- [ ] **Step 3: `emitere.jsx` alege drumul**

În `src/features/facturare/emitere.jsx`, adaugă importul `import * as dateOblio from "../../data/oblio.js";` și înlocuiește începutul lui `emiteFactura`:

```js
export async function emiteFactura(invoice) {
  /* Cu Oblio pornit (Financiar → Oblio), seria si numarul le da Oblio, prin
     functia edge; altfel drumul vechi: seria locala + emite_factura. */
  let setari = null;
  try { setari = await dateOblio.setariOblio(); } catch { setari = null; }
  if (dateOblio.oblioActiv(setari)) return emiteFacturaOblio(invoice);

  let serie;
  try {
    serie = await dateFacturare.serieActiva();
  // … restul functiei ramane neschimbat …
```

și, după funcție, adaugă (neexportată):

```js
/* La esec draftul ramane, cu oblio_stare = 'eroare' si mesajul lui Oblio;
   apelantul reincarca factura ca sa-l arate (InvoicePrint.emite). */
async function emiteFacturaOblio(invoice) {
  const r = await dateOblio.cheamaOblio("emite", { invoiceId: invoice.id });
  if (!r.ok) {
    toaster.show(r.error || "Emiterea prin Oblio a eșuat", { tone: "danger" });
    return null;
  }
  const updated = r.factura;
  const numar = updated.oblio_numar || updated.number;
  await audit.push("Factură emisă (Oblio)", `${updated.series} ${numar} · ${fmtMoney(invoice.total_amount)}`);
  toaster.show(`Factura ${updated.series} ${numar} a fost emisă în Oblio`, { tone: "ok" });
  return updated;
}
```

- [ ] **Step 4: Rulează — trece**

```bash
npx vitest run src/oblio-emitere.test.js
```
Așteptat: PASS, 3 teste.

- [ ] **Step 5: Testul de ecran pentru anulare/stornare prin Oblio — pică**

În `src/oblio-ecran.test.js`, adaugă (mock-urile de mai jos se pun lângă cele existente, sus în fișier, înainte de `await import`; secțiunea `describe` la final):

```js
const anuleazaFactura = vi.fn(async () => ({ id: "i", status: "cancelled" }));
const storneazaFactura = vi.fn(async () => ({ original: { id: "i", status: "credited" }, serie: "LL", numar: 2 }));
vi.mock("./data/facturare.js", async (importOriginal) => ({
  ...(await importOriginal()), anuleazaFactura, storneazaFactura, serieActiva: vi.fn(async () => "LL"),
}));
vi.mock("./lib/permisiuni.js", () => ({ canBilling: () => true, billingPerms: { role: "admin", set: new Set() } }));
const { InvoiceCancelCreditActions } = await import("./features/facturare/factura.jsx");

async function randeazaActiuni(invoice, onChanged) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(InvoiceCancelCreditActions, { invoice, onChanged })); });
  await act(async () => {});
  return host;
}

describe("InvoiceCancelCreditActions", () => {
  const EMISA_OBLIO = { id: "i", status: "issued", paid_amount: 0, series: "LL", number: 7, oblio_numar: "0007", oblio_stare: "emisa" };
  const EMISA_LOCAL = { id: "i", status: "issued", paid_amount: 0, series: "LL", number: 1, oblio_stare: "neemisa" };

  it("factura emisa prin Oblio se anuleaza prin Oblio", async () => {
    const onChanged = vi.fn();
    cheamaOblio.mockResolvedValueOnce({ ok: true, factura: { ...EMISA_OBLIO, status: "cancelled" } });
    const host = await randeazaActiuni(EMISA_OBLIO, onChanged);
    await apasa(butonText(host, "Anulează factura"));
    await apasa(butonText(host, "Confirmă"));
    expect(cheamaOblio).toHaveBeenCalledWith("anuleaza", { invoiceId: "i" });
    expect(anuleazaFactura).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });
  it("factura emisa prin Oblio se storneaza prin Oblio, cu numarul lui", async () => {
    const onChanged = vi.fn();
    cheamaOblio.mockResolvedValueOnce({ ok: true, stornare: { id: "nc", series: "LL", number: 8, oblio_numar: "0008" }, original: { ...EMISA_OBLIO, status: "credited" } });
    const host = await randeazaActiuni(EMISA_OBLIO, onChanged);
    await apasa(butonText(host, "Stornează"));
    await apasa(butonText(host, "Confirmă"));
    expect(cheamaOblio).toHaveBeenCalledWith("storneaza", { invoiceId: "i" });
    expect(storneazaFactura).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "credited" }));
  });
  it("refuzul lui Oblio nu schimba nimic", async () => {
    const onChanged = vi.fn();
    cheamaOblio.mockResolvedValueOnce({ ok: false, error: "Oblio: documentul nu poate fi anulat" });
    const host = await randeazaActiuni(EMISA_OBLIO, onChanged);
    await apasa(butonText(host, "Anulează factura"));
    await apasa(butonText(host, "Confirmă"));
    expect(onChanged).not.toHaveBeenCalled();
  });
  it("factura emisa local merge pe drumul vechi", async () => {
    const onChanged = vi.fn();
    const host = await randeazaActiuni(EMISA_LOCAL, onChanged);
    await apasa(butonText(host, "Anulează factura"));
    await apasa(butonText(host, "Confirmă"));
    expect(anuleazaFactura).toHaveBeenCalledWith("i");
    expect(cheamaOblio).not.toHaveBeenCalled();
  });
});
```

Rulează `npx vitest run src/oblio-ecran.test.js` — așteptat: FAIL la primele trei teste noi (`cheamaOblio` nechemat).

- [ ] **Step 6: `factura.jsx` și `constante.js`**

În `src/lib/constante.js`, după `INVOICE_STATUS_CLASS`:

```js
/* Codul intors de Oblio la trimiterea in SPV (POST /docs/einvoice; vezi
   docs/oblio.md). Cheile sunt siruri fiindca -1 nu poate fi cheie literala. */
export const OBLIO_EFACTURA_LABEL = { "-1": "SPV: netrimisă", "0": "SPV: în procesare", "1": "SPV: trimisă", "2": "SPV: erori" };
export const OBLIO_EFACTURA_CLASS = { "-1": "st-pending", "0": "st-noshow", "1": "st-checkedin", "2": "st-cancelled" };
```

În `src/features/facturare/factura.jsx`:

1. Importuri: `ExternalLink, Send` în lista din `lucide-react`; `import * as dateOblio from "../../data/oblio.js";`; `OBLIO_EFACTURA_LABEL, OBLIO_EFACTURA_CLASS` în importul din `constante.js`.

2. În `InvoicePrint`, lângă `const [emitere, setEmitere] = useState(false);`:
```js
  const [oblio, setOblio] = useState(null);
  const [spv, setSpv] = useState(false);
```
În `load`, înainte de `setLoading(false);`:
```js
    try { setOblio(await dateOblio.setariOblio()); } catch { setOblio(null); }
```
`emite` devine:
```js
  const emite = async () => {
    if (emitere) return;
    setEmitere(true);
    try {
      const actualizata = await emiteFactura(invoice);
      if (actualizata) {
        setInvoice(actualizata);
        onChanged?.(actualizata);
      } else {
        /* Prin Oblio, un refuz lasa draftul cu mesajul lor in oblio_eroare;
           il recitim ca sa-l aratam sub butoane. */
        await load();
      }
    } finally {
      setEmitere(false);
    }
  };
  const trimiteSpv = async () => {
    if (spv) return;
    setSpv(true);
    const r = await dateOblio.cheamaOblio("efactura-trimite", { invoiceId: invoice.id });
    setSpv(false);
    if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return; }
    setInvoice(r.factura);
    onChanged?.(r.factura);
    await audit.push("e-Factura trimisă în SPV", `${r.factura.series} ${r.factura.oblio_numar || r.factura.number} · cod ${r.cod}`);
    toaster.show(OBLIO_EFACTURA_LABEL[String(r.cod)] || "Trimisă în SPV", { tone: r.cod === 2 ? "danger" : "ok" });
  };
```

3. În antetul ferestrei (blocul `<div className="no-print" style={{ display: "flex", gap: 8, …}}>`), imediat după `<span className={"role-tag " + INVOICE_STATUS_CLASS[invoice.status]}>…</span>`:
```jsx
        {invoice.oblio_efactura_cod != null && (
          <span className={"role-tag oblio-chip " + OBLIO_EFACTURA_CLASS[String(invoice.oblio_efactura_cod)]}>
            {OBLIO_EFACTURA_LABEL[String(invoice.oblio_efactura_cod)]}
          </span>
        )}
```
și după butonul „Emite factura" (înainte de „Printează"):
```jsx
        {invoice.oblio_link && (
          <a className="btn btn-ghost btn-lat" href={invoice.oblio_link} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> PDF din Oblio
          </a>
        )}
        {invoice.oblio_stare === "emisa" && dateOblio.oblioActiv(oblio) && canBilling("issue_invoice")
          && invoice.oblio_efactura_cod !== 0 && invoice.oblio_efactura_cod !== 1 && (
          <button className="btn btn-ghost btn-lat" onClick={trimiteSpv} disabled={spv}>
            <Send size={15} /> {spv ? "Se trimite…" : "Trimite în SPV"}
          </button>
        )}
```
Butonul „Emite factura" își schimbă textul: `{emitere ? "Se emite…" : (dateOblio.oblioActiv(oblio) ? "Emite prin Oblio" : "Emite factura")}`.

4. Nota de sub butoane (blocul `invoice.status === "draft" && canBilling("issue_invoice")`) devine:
```jsx
      {invoice.status === "draft" && canBilling("issue_invoice") && (
        <div className="note no-print" style={{ marginTop: -6, marginBottom: 14 }}>
          {dateOblio.oblioActiv(oblio)
            ? "La emitere, Oblio alocă seria și numărul și generează PDF-ul; factura nu mai poate fi modificată — orice corecție ulterioară se face doar prin stornare."
            : "La emitere se alocă serie și număr, iar factura nu mai poate fi modificată — orice corecție ulterioară se face doar prin stornare."}
        </div>
      )}
      {invoice.status === "draft" && invoice.oblio_stare === "eroare" && (
        <div className="note no-print oblio-eroare">
          Oblio a refuzat emiterea: {invoice.oblio_eroare}. Corectează și apasă din nou „Emite prin Oblio”.
        </div>
      )}
```
(Atributul `style` de pe prima notă există deja; nu se adaugă altul.)

5. În `InvoiceCancelCreditActions`, `cancelInvoice` și `creditInvoice` aleg drumul după factură, nu după setare:
```js
  const cancelInvoice = async () => {
    setBusy(true);
    try {
      let data;
      if (invoice.oblio_stare === "emisa") {
        /* Emisa prin Oblio → se anuleaza intai acolo; baza se schimba doar
           daca Oblio a acceptat. */
        const r = await dateOblio.cheamaOblio("anuleaza", { invoiceId: invoice.id });
        /* Mesajul lui Oblio se arata ca atare, nu prin mesajEroare, care ar
           invalui un text necunoscut in „eroare neasteptata”. */
        if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return; }
        data = r.factura;
      } else {
        data = await dateFacturare.anuleazaFactura(invoice.id);
      }
      await audit.push("Factură anulată", `${invoice.series || "draft"} ${invoice.oblio_numar || invoice.number || ""}`.trim());
      onChanged(data);
      setConfirm(null);
    } catch (e) {
      toaster.show(mesajEroare(e, "Anularea a eșuat"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
```
iar în `creditInvoice`, în locul celor două linii `const serieStorno = …` … `const { original, serie, numar } = …` (păstrând comentariul lung de deasupra lor):
```js
      let original, serie, numar;
      if (invoice.oblio_stare === "emisa") {
        const r = await dateOblio.cheamaOblio("storneaza", { invoiceId: invoice.id });
        if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return; }
        original = r.original;
        serie = r.stornare.series;
        numar = r.stornare.oblio_numar || r.stornare.number;
      } else {
        const serieStorno = await dateFacturare.serieActiva();
        if (!serieStorno) {
          toaster.show("Nu există nicio serie de facturare activă. Configureaz-o în Financiar → Serii.", { tone: "danger" });
          return;
        }
        ({ original, serie, numar } = await dateFacturare.storneazaFactura(invoice, { serie: serieStorno }));
      }
```

- [ ] **Step 7: Rulează tot ce e atins — trece**

```bash
npx vitest run src/oblio-ecran.test.js src/oblio-emitere.test.js src/stiluri-inline.test.js src/facturare-poarta.test.js src/erori-productie.test.js && npm run lint && npm run typecheck
```
Așteptat: PASS peste tot; `stiluri-inline` confirmă că n-a apărut niciun `style={{` nou (PLAFON 366 neatins).

- [ ] **Step 8: Commit**

```bash
rm -f s drumul
git add src/features/facturare/emitere.jsx src/features/facturare/factura.jsx src/lib/constante.js src/oblio-emitere.test.js src/oblio-ecran.test.js
git commit -q -m 'Oblio: emiterea, anularea si stornarea trec prin Oblio cand e pornit' -m 'emiteFactura alege drumul dupa setari; refuzul lui Oblio lasa draftul cu mesajul lor la vedere si reincercarea foloseste aceeasi cheie. Fereastra facturii: „PDF din Oblio”, eticheta SPV, „Trimite in SPV”. Anularea si stornarea unei facturi emise prin Oblio merg prin Oblio indiferent de setare (decide oblio_stare).' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 7: Lista facturilor — PDF-ul din Oblio și eticheta SPV

**Files:**
- Modify: `src/features/facturare/facturi-lista.jsx:9,13,105-127`
- Test: `src/oblio-ecran.test.js` (secțiune nouă)

**Interfaces:**
- Consumes: `OBLIO_EFACTURA_LABEL`, `OBLIO_EFACTURA_CLASS` (Task 6); `listeazaFacturi()` citește `*`, deci coloanele `oblio_*` vin singure.

- [ ] **Step 1: Testul — pică**

În `src/oblio-ecran.test.js`, mock-ul lui `./data/facturare.js` capătă și `listeazaFacturi`:
```js
const listeazaFacturi = vi.fn(async () => [
  { id: "a", status: "issued", series: "LL", number: 7, oblio_numar: "0007", oblio_link: "https://www.oblio.eu/pdf/7", oblio_efactura_cod: 1, total_amount: 100, billing_customer_id: "c1", issue_date: "2026-09-16T10:00:00Z" },
  { id: "b", status: "draft", total_amount: 50, billing_customer_id: "c1" },
]);
vi.mock("./data/facturare.js", async (importOriginal) => ({
  ...(await importOriginal()), anuleazaFactura, storneazaFactura, serieActiva: vi.fn(async () => "LL"), listeazaFacturi,
}));
const { InvoicesListView } = await import("./features/facturare/facturi-lista.jsx");
```
(înlocuiește `vi.mock("./data/facturare.js", …)` din Task 6 cu această formă) și secțiunea:
```js
describe("InvoicesListView", () => {
  it("randul unei facturi emise prin Oblio are linkul la PDF si eticheta SPV; draftul, nu", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    montate.push({ root, host });
    await act(async () => { root.render(React.createElement(InvoicesListView, { core: { billingCustomers: [] } })); });
    await act(async () => {});
    const linkuri = [...host.querySelectorAll('a[aria-label="PDF din Oblio"]')];
    expect(linkuri.map((a) => a.getAttribute("href"))).toEqual(["https://www.oblio.eu/pdf/7"]);
    expect(linkuri[0].getAttribute("target")).toBe("_blank");
    expect(host.textContent).toContain("SPV: trimisă");
    expect(host.textContent).toContain("LL 7");
  });
});
```
`npx vitest run src/oblio-ecran.test.js` → FAIL („expected [] to equal [...]").

- [ ] **Step 2: Rândul**

În `src/features/facturare/facturi-lista.jsx`: importul devine `import { X, Search, Eye, ExternalLink } from "lucide-react";`, iar cel din `constante.js` primește `OBLIO_EFACTURA_LABEL, OBLIO_EFACTURA_CLASS`. În rând, după `<span className={"role-tag " + INVOICE_STATUS_CLASS[inv.status]} …>…</span>`:
```jsx
                  {inv.oblio_efactura_cod != null && (
                    <span className={"role-tag oblio-chip " + OBLIO_EFACTURA_CLASS[String(inv.oblio_efactura_cod)]}>
                      {OBLIO_EFACTURA_LABEL[String(inv.oblio_efactura_cod)]}
                    </span>
                  )}
```
și în `row-actions`, înainte de butonul cu `Eye`:
```jsx
                {inv.oblio_link && (
                  <a className="icon-btn" href={inv.oblio_link} target="_blank" rel="noopener noreferrer" aria-label="PDF din Oblio">
                    <ExternalLink size={14} />
                  </a>
                )}
```

- [ ] **Step 3: Rulează — trece; commit**

```bash
npx vitest run src/oblio-ecran.test.js src/stiluri-inline.test.js && npm run lint
rm -f s drumul
git add src/features/facturare/facturi-lista.jsx src/oblio-ecran.test.js
git commit -q -m 'Oblio: linkul la PDF si eticheta SPV in lista facturilor' -m 'Randul unei facturi emise prin Oblio deschide PDF-ul lor intr-o fila noua si arata starea e-Factura.' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
```

---

### Task 8: Documentația și verificarea cap-coadă

**Files:**
- Create: `docs/oblio.md`
- Modify: `docs/README.md` (tabelul), `README.md:87-94` (secretele funcțiilor edge), `docs/oblio-plan.md` (linia de stare de la final)

- [ ] **Step 1: `docs/oblio.md`**

Structura, în stilul `docs/caldav.md` / `docs/faza2.md` §4:

```markdown
# Facturarea prin Oblio

Facturile se emit în contul Oblio.eu al pensiunii, iar PMS-ul păstrează o
copie. Planul de implementare: [`oblio-plan.md`](oblio-plan.md).

## Cum funcționează

[fluxul din plan: draft în PMS → „Emite prin Oblio” → funcția edge
`oblio-facturare` → Oblio dă serie, număr, PDF → `invoices` primește
`series`, `number`, `oblio_numar`, `oblio_link`; anularea și stornarea, întâi
la Oblio; e-Factura opțional la emitere sau din buton; comutatorul `activ`
din `pms:oblio:v1`, scris doar de admin]

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
```

Textul dintre paranteze drepte se scrie complet, în proză, nu se lasă ca notă.

- [ ] **Step 2: Indexul și README-ul**

În `docs/README.md`, înaintea rândului `oblio-plan.md` (care există deja, pus odată cu planul), rândul nou, cu data livrării în locul lui `[data]`:
```markdown
| [`oblio.md`](oblio.md) | Facturarea prin Oblio.eu: Oblio dă seria, numărul, PDF-ul și e-Factura, PMS-ul păstrează copia; ce se întâmplă la fiecare eșec; configurarea. Implementată pe [data]. |
```
și, pe rândul `oblio-plan.md`, „neimplementat" devine „implementat".
În `README.md`, în paragraful „Funcțiile edge", după `SHELLY_SERVER_URI` (relee)`: `; `OBLIO_CLIENT_ID`, `OBLIO_CLIENT_SECRET` (facturarea prin Oblio, `docs/oblio.md`).`

- [ ] **Step 3: Suita completă, build-urile, commit, push, CI**

```bash
npm run lint && npm run typecheck && npm test -- --run && npm run build && npm run build:booking && npm run build:guest
rm -f s drumul
git add docs/oblio.md docs/README.md README.md docs/oblio-plan.md
git commit -q -m 'Oblio: documentatia integrarii' -m 'docs/oblio.md (cum functioneaza, ce se intampla la esec, configurarea, ce nu s-a schimbat), indexul docs, secretele in README.' -m 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
git status --short
git push
gh run list --commit "$(git rev-parse HEAD)" --json status,conclusion
```
Așteptat: toate testele trec (suita avea 852 de teste înainte; acum cu ~31 în plus), trei build-uri fără eroare, CI `completed / success`.

- [ ] **Step 4: Verificarea cap-coadă, cu Ovidiu**

Nu se poate face din cod (secretele și documentele fiscale sunt ale lui). Pașii, de dat lui Ovidiu:
1. Secretele în Supabase; în PMS → Financiar → Oblio → „Verifică legătura" → apare firma, seriile, cotele. Dacă apare „Cota de TVA 11% nu există", o adaugă în Oblio.
2. Pornește comutatorul, salvează.
3. Emite o factură reală mică (ex. minibar, 1 leu) dintr-un folio: fereastra arată „LL <număr>", „PDF din Oblio" deschide PDF-ul lor, iar în Oblio factura are aceleași linii și total.
4. Stornează-o din fereastra ei: în Oblio apare nota de credit; în PMS originalul e „Stornată", iar stornarea are numărul dat de Oblio.
5. Dacă `trimiteEFactura` e pornit, eticheta „SPV: …" apare pe factură.

Dacă pasul 3 dă un mesaj de la Oblio despre `products` sau `referenceDocument` (documentația lor lasă loc de interpretare la stornare — vezi decizia 4), se corectează `stornoOblio` în `oblio.ts` după mesajul lor exact, cu testul actualizat, înainte de a repeta pasul 4.

---

## Auto-verificare (făcută la scrierea planului)

- **Acoperirea cerinței:** emiterea prin Oblio (T1–T6), anularea și stornarea prin Oblio (T1, T3, T6), PDF-ul lor (T6, T7), e-Factura (T3, T6), setările și verificarea legăturii (T4, T5), documentația (T8). Neacoperit intenționat: încasările în Oblio (plan separat).
- **Nume consecvente între sarcini:** `oblio_incepe_emiterea / oblio_marcheaza_eroare / oblio_finalizeaza_emiterea / oblio_finalizeaza_stornarea / oblio_finalizeaza_anularea / oblio_actualizeaza_efactura` (T1 ↔ T3); `cheamaOblio / setariOblio / salveazaSetariOblio / oblioActiv` (T4 ↔ T5, T6); acțiunile `verifica / emite / storneaza / anuleaza / efactura-trimite` (T2 `PERMISIUNI` ↔ T3 ↔ T5, T6); răspunsurile `{ok, factura}`, `{ok, stornare, original}`, `{ok, factura, cod}` (T3 ↔ T6); `OBLIO_EFACTURA_LABEL / CLASS` cu chei-șir (T6 ↔ T7); clasele `btn-lat`, `oblio-*` (T5 ↔ T6, T7).
- **Fără locuri goale:** fiecare pas are codul, comanda și rezultatul așteptat; singurul text „de completat" e `[data]` din rândul de index (data livrării, necunoscută la scriere) și proza din `docs/oblio.md`, cu conținutul dat.

**Stare:** plan scris și implementat pe 16 septembrie 2026 (commit-urile „Oblio: …” de pe main).
