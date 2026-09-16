-- Oblio, după review-ul final (docs/oblio.md): amprenta draftului la
-- încercarea de emitere și seria locală ținută în urma numerotării Oblio.
alter table invoices add column oblio_amprenta text;
comment on column invoices.oblio_amprenta is 'md5 peste client, total și linii la ultima încercare de emitere cu răspuns necunoscut; altă amprentă = draft schimbat între timp.';

-- Amprenta: clientul, totalul și liniile (nume, cantitate, preț, cotă).
create or replace function oblio_amprenta_factura(p_id text)
returns text language sql stable set search_path = public as $$
  select md5(f.billing_customer_id || '|' || f.total_amount::text || '|' ||
             coalesce((select string_agg(i.name || '~' || i.quantity::text || '~' || i.unit_price::text || '~' || i.vat_rate::text,
                                         '|' order by i.sort_order, i.id)
                         from invoice_items i where i.invoice_id = f.id), ''))
    from invoices f where f.id = p_id;
$$;

create or replace function oblio_incepe_emiterea(p_id text)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_f invoices; v_amprenta text;
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
  v_amprenta := oblio_amprenta_factura(p_id);
  -- După un eșec cu răspuns NECUNOSCUT (rețea, 5xx) amprenta rămâne: Oblio
  -- poate să fi emis documentul, iar reîncercarea cu aceeași cheie îl
  -- regăsește. Dacă între timp draftul s-a schimbat, același document ar
  -- ajunge legat de o factură diferită — de aceea se refuză. Un refuz
  -- explicit al lui Oblio șterge amprenta (oblio_marcheaza_eroare), deci
  -- draftul se poate corecta liber.
  if v_f.oblio_amprenta is not null and v_f.oblio_amprenta <> v_amprenta then
    raise exception 'Draftul s-a schimbat de la ultima încercare de emitere, iar Oblio poate să fi emis deja documentul. Verifică în Oblio (clientul și ziua facturii); dacă nu e emis, șterge draftul și fă altul.';
  end if;
  update invoices
     set oblio_stare = 'in_curs', oblio_eroare = null, oblio_la = now(),
         oblio_cheie = coalesce(oblio_cheie, 'pms-' || id),
         oblio_amprenta = v_amprenta
   where id = p_id
   returning * into v_f;
  return v_f;
end $$;

-- p_neemisa = true când e SIGUR că Oblio n-a emis nimic (a refuzat explicit,
-- sau cererea n-a plecat): amprenta se șterge și draftul se poate corecta.
-- false (implicit) = răspuns necunoscut: amprenta rămâne, vezi mai sus.
create or replace function oblio_marcheaza_eroare(p_id text, p_mesaj text, p_neemisa boolean default false)
returns void language sql security definer set search_path = public as $$
  update invoices
     set oblio_stare = 'eroare',
         oblio_eroare = left(coalesce(p_mesaj, 'eroare necunoscută'), 1000),
         oblio_la = now(),
         oblio_amprenta = case when p_neemisa then null else oblio_amprenta end
   where id = p_id and status = 'draft';
$$;
drop function if exists oblio_marcheaza_eroare(text, text);

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
  -- Seria locală cu același nume se ține în urma numerotării Oblio: altfel
  -- prima emitere pe drumul vechi (comutatorul oprit) ar cere un număr deja
  -- folosit de Oblio și ar cădea pe `unique (series, number)`.
  update invoice_series set next_number = greatest(next_number, v_nr + 1) where series = p_serie;
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
  insert into invoice_items (id, invoice_id, product_id, name, quantity, unit_price, vat_rate,
                             net_amount, vat_amount, total_amount, sort_order)
  select 'nci-' || encode(gen_random_bytes(6), 'hex'), v_noua.id, product_id, name, -quantity,
         unit_price, vat_rate, -net_amount, -vat_amount, -total_amount, sort_order
    from invoice_items
   where invoice_id = v_orig.id;
  update invoices set status = 'credited', oblio_la = now() where id = v_orig.id returning * into v_orig;
  return jsonb_build_object('stornare', to_jsonb(v_noua), 'original', to_jsonb(v_orig));
end $$;

revoke execute on function oblio_amprenta_factura(text)                    from public, anon, authenticated;
revoke execute on function oblio_incepe_emiterea(text)                     from public, anon, authenticated;
revoke execute on function oblio_marcheaza_eroare(text, text, boolean)     from public, anon, authenticated;
grant  execute on function oblio_amprenta_factura(text)                    to service_role;
grant  execute on function oblio_incepe_emiterea(text)                     to service_role;
grant  execute on function oblio_marcheaza_eroare(text, text, boolean)     to service_role;