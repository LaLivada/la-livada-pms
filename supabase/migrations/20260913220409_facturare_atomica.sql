-- =====================================================================
-- FACTURARE ATOMICĂ — emitere, stornare, încasare într-o singură tranzacție
-- Faza 2, B7 din docs/audit-2026-09.md; designul în docs/faza2.md §4.
--
-- Până pe 14 septembrie 2026 numărul de factură se aloca dintr-un apel
-- (next_invoice_number), iar factura se marca emisă din ALT apel: dacă al
-- doilea pica (rețea, RLS, trigger), numărul era consumat — gol în seria
-- fiscală, de justificat la control. S-a văzut la prima stornare eșuată din
-- august (numărul 7, repus fiindcă erau date de test). La fel la stornare
-- (număr, apoi nota de credit, apoi marcarea originalului) și la încasările
-- în numerar (număr de chitanță, apoi inserarea plății). Acum fiecare e o
-- funcție Postgres: ori se întâmplă tot, ori nimic.
--
-- Toate trei sunt SECURITY DEFINER (seria e modificabilă doar de admin prin
-- RLS, dar numărul trebuie să-l poată lua orice recepționer cu permisiune)
-- și verifică ele însele permisiunea de facturare — aceeași pe care o cer
-- politicile RLS pe drumul vechi. Rândul facturii se blochează (FOR UPDATE)
-- ca două emiteri simultane ale aceluiași draft să nu ia două numere.
-- Trigger-ele (guard_invoice_update, recalc_invoice_payment_status) rulează
-- ca înainte.
--
-- next_invoice_number și next_receipt_number rămân, pentru filele cu
-- bundle-ul vechi; de revocat de la `authenticated` după ce s-au reîncărcat
-- toate.
-- =====================================================================

-- Draft -> emisă, cu numărul din serie, în aceeași tranzacție.
create or replace function emite_factura(p_id text, p_series text)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_row    invoices;
  v_number int;
begin
  if not has_billing_permission('issue_invoice') then
    raise exception 'Nu ai permisiunea de a emite facturi.';
  end if;
  select * into v_row from invoices where id = p_id for update;
  if not found then
    raise exception 'Factura % nu există.', p_id;
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Factura % nu mai e draft (%) — nu se poate emite a doua oară.', p_id, v_row.status;
  end if;
  update invoice_series set next_number = next_number + 1
    where invoice_series.series = p_series and active
    returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'Serie de facturare inexistentă sau inactivă: %', p_series;
  end if;
  update invoices
     set series = p_series, number = v_number, status = 'issued',
         issue_date = now(), issued_by = auth.uid()
   where id = p_id
   returning * into v_row;
  return v_row;
end;
$$;

-- Stornare: nota de credit (sume și cantități negate, aceeași perioadă de
-- servicii) + originalul marcat „stornată", cu numărul alocat în aceeași
-- tranzacție. Seria vine de la apelant — o stornare poate avea, legal, altă
-- serie decât factura pe care o anulează; alegerea pensiunii e numerotarea
-- continuă (vezi features/facturare.jsx).
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
  insert into invoice_items (id, invoice_id, product_id, name, quantity, unit_price, vat_rate,
                             net_amount, vat_amount, total_amount, sort_order)
  select 'nci-' || encode(gen_random_bytes(6), 'hex'), v_noua.id, product_id, name, -quantity,
         unit_price, vat_rate, -net_amount, -vat_amount, -total_amount, sort_order
    from invoice_items
   where invoice_id = v_orig.id;
  update invoices set status = 'credited' where id = v_orig.id returning * into v_orig;
  return jsonb_build_object('stornare', to_jsonb(v_noua), 'original', to_jsonb(v_orig));
end;
$$;

-- Încasare: plata + (la numerar) numărul de chitanță, în aceeași tranzacție.
-- Se încasează doar facturi emise cu sold (issued / partially_paid) — un
-- draft, o factură anulată sau una stornată n-au ce încasa. Soldul și
-- statusul facturii le recalculează trigger-ul de pe `payments`; factura
-- întoarsă e cea de după el.
create or replace function inregistreaza_plata(
  p_invoice_id     text,
  p_amount         numeric,
  p_method         text,
  p_reference      text default null,
  p_cu_chitanta    boolean default false,
  p_serie_chitanta text default null,
  p_bon_card       text default null,
  p_data_bon       date default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_factura invoices;
  v_plata   payments;
  v_number  int;
  v_serie   text;
begin
  if not has_billing_permission('record_payment') then
    raise exception 'Nu ai permisiunea de a înregistra încasări.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Suma încasată trebuie să fie pozitivă.';
  end if;
  select * into v_factura from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Factura % nu există.', p_invoice_id;
  end if;
  if v_factura.status not in ('issued', 'partially_paid') then
    raise exception 'Factura % este % — se încasează doar facturi emise, cu sold.', p_invoice_id, v_factura.status;
  end if;
  if p_cu_chitanta then
    v_serie := coalesce(p_serie_chitanta,
                        (select series from receipt_series where active order by series limit 1));
    update receipt_series set next_number = next_number + 1
      where receipt_series.series = v_serie and active
      returning next_number - 1 into v_number;
    if v_number is null then
      raise exception 'Serie de chitanțe inexistentă sau inactivă: %', v_serie;
    end if;
  end if;
  insert into payments (id, invoice_id, amount, method, reference, created_by,
                        receipt_series, receipt_number, card_receipt_number, card_receipt_date)
  values ('p-' || encode(gen_random_bytes(6), 'hex'), p_invoice_id, p_amount, p_method,
          nullif(p_reference, ''), auth.uid(),
          case when p_cu_chitanta then v_serie end, v_number,
          nullif(p_bon_card, ''), p_data_bon)
  returning * into v_plata;
  select * into v_factura from invoices where id = p_invoice_id;
  return jsonb_build_object('plata', to_jsonb(v_plata), 'factura', to_jsonb(v_factura));
end;
$$;

revoke execute on function emite_factura(text, text)                                              from public, anon;
revoke execute on function storneaza_factura(text, text)                                          from public, anon;
revoke execute on function inregistreaza_plata(text, numeric, text, text, boolean, text, text, date) from public, anon;
grant  execute on function emite_factura(text, text)                                              to authenticated, service_role;
grant  execute on function storneaza_factura(text, text)                                          to authenticated, service_role;
grant  execute on function inregistreaza_plata(text, numeric, text, text, boolean, text, text, date) to authenticated, service_role;
