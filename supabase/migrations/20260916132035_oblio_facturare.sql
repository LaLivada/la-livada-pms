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