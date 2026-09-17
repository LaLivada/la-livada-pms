-- Unitatea de masura pe linia de factura.
--
-- Pana acum unitatea se citea din produs in clipa in care era nevoie de ea
-- (la trimiterea in Oblio), iar factura din PMS nu o arata deloc. Doua
-- neajunsuri: o factura e un instantaneu, deci unitatea nu are voie sa se
-- schimbe cand cineva editeaza produsul dupa emitere; si linia „Doar totalul"
-- a unei facturi de grup nu are un produs al ei — mostenea „noapte" de la
-- cazare, adica „1 noapte" pentru tot sejurul a zece camere.
--
-- Coloana e nullable: liniile fara valoare cad in continuare pe unitatea
-- produsului (formeazaLinie din functia edge, unitateLinie in client).
alter table invoice_items add column if not exists unit text;

-- Liniile existente primesc unitatea pe care ar fi avut-o oricum: intai a
-- produsului propriu, apoi a produsului primei pozitii de folio legate.
update invoice_items ii
   set unit = p.unit
  from products p
 where ii.product_id = p.id and ii.unit is null;

update invoice_items ii
   set unit = s.unit
  from (
    select distinct on (l.invoice_item_id) l.invoice_item_id, p.unit
      from invoice_item_links l
      join folio_items fi on fi.id = l.folio_item_id
      join products p on p.id = fi.product_id
     order by l.invoice_item_id, fi.occurred_at
  ) s
 where ii.id = s.invoice_item_id and ii.unit is null;

-- Stornarea copiaza liniile cu lista explicita de coloane, deci unitatea
-- trebuie numita si aici — altfel nota de credit ar pierde-o.
create or replace function storneaza_factura(p_id text, p_series text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_orig   invoices;
  v_noua   invoices;
  v_number int;
begin
  if not has_billing_permission('create_credit_note') then
    raise exception 'Nu ai permisiunea de a storna facturi.';
  end if;
  select * into v_orig from invoices where id = p_id for update;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  if v_orig.status not in ('issued', 'partially_paid', 'paid') then
    raise exception 'Factura % este % — se pot storna doar facturi emise.', p_id, v_orig.status;
  end if;
  update invoice_series set next_number = next_number + 1
    where invoice_series.series = p_series and active
    returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'Serie de facturare inexistentă sau inactivă: %', p_series;
  end if;
  insert into invoices (id, series, number, folio_id, billing_customer_id, status, issue_date,
                        service_date_start, service_date_end,
                        subtotal_net, subtotal_vat, total_amount, credit_note_of, created_by, issued_by)
  values ('nc-' || encode(gen_random_bytes(6), 'hex'), p_series, v_number,
          v_orig.folio_id, v_orig.billing_customer_id, 'issued', now(),
          v_orig.service_date_start, v_orig.service_date_end,
          -v_orig.subtotal_net, -v_orig.subtotal_vat, -v_orig.total_amount,
          v_orig.id, auth.uid(), auth.uid())
  returning * into v_noua;
  insert into invoice_items (id, invoice_id, product_id, name, unit, quantity, unit_price, vat_rate,
                             net_amount, vat_amount, total_amount, sort_order)
  select 'nci-' || encode(gen_random_bytes(6), 'hex'), v_noua.id, product_id, name, unit, -quantity,
         unit_price, vat_rate, -net_amount, -vat_amount, -total_amount, sort_order
    from invoice_items
   where invoice_id = v_orig.id;
  update invoices set status = 'credited' where id = v_orig.id returning * into v_orig;
  return jsonb_build_object('stornare', to_jsonb(v_noua), 'original', to_jsonb(v_orig));
end;
$$;

create or replace function oblio_finalizeaza_stornarea(
  p_id text, p_serie text, p_numar text, p_link text, p_de uuid
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_orig invoices; v_noua invoices; v_nr int;
begin
  v_nr := nullif(regexp_replace(coalesce(p_numar, ''), '\D', '', 'g'), '')::int;
  if p_serie is null or p_serie = '' or v_nr is null then
    raise exception 'Răspuns Oblio fără serie sau număr (% %).', p_serie, p_numar;
  end if;
  -- La fel ca la emitere: nota de credit consumă un număr din seria Oblio.
  update invoice_series set next_number = greatest(next_number, v_nr + 1) where series = p_serie;
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
  insert into invoice_items (id, invoice_id, product_id, name, unit, quantity, unit_price, vat_rate,
                             net_amount, vat_amount, total_amount, sort_order)
  select 'nci-' || encode(gen_random_bytes(6), 'hex'), v_noua.id, product_id, name, unit, -quantity,
         unit_price, vat_rate, -net_amount, -vat_amount, -total_amount, sort_order
    from invoice_items
   where invoice_id = v_orig.id;
  update invoices set status = 'credited', oblio_la = now() where id = v_orig.id returning * into v_orig;
  return jsonb_build_object('stornare', to_jsonb(v_noua), 'original', to_jsonb(v_orig));
end $$;