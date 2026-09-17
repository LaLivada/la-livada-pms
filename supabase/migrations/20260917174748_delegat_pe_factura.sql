-- Delegatul facturii: cine a ridicat documentul si cu ce act de identitate.
--
-- Rubrica exista pe orice factura tiparita din Romania, iar pana acum lipsea
-- de pe coala noastra. Trei coloane, nu un text liber, ca sa se poata
-- precompleta din fisa de cazare (numele celui cazat, seria si numarul CI) si
-- ca sa plece structurat mai departe.
--
-- Nullable: o factura fara delegat e legala, iar draftul se poate emite si cu
-- rubrica goala.
alter table invoices add column if not exists delegat_nume     text;
alter table invoices add column if not exists delegat_ci_serie text;
alter table invoices add column if not exists delegat_ci_numar text;

-- Aceleasi plafoane ca la `notes`: campuri de coala, nu de depozitare.
alter table invoices drop constraint if exists invoices_lungimi_delegat;
alter table invoices add constraint invoices_lungimi_delegat check (
  length(coalesce(delegat_nume, '')) <= 200
  and length(coalesce(delegat_ci_serie, '')) <= 20
  and length(coalesce(delegat_ci_numar, '')) <= 40
);

-- Garda de editare: delegatul se ingheata odata cu restul documentului.
create or replace function guard_invoice_update()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Draft: editare libera (linii, sume, client) — dar tranzitia de status
  -- e permisa doar spre 'issued', ca sa nu se ocoleasca alocarea
  -- serie+numar din next_invoice_number.
  if old.status = 'draft' then
    if new.status not in ('draft', 'issued') then
      raise exception 'Tranziție de status invalidă: draft -> %.', new.status;
    end if;
    return new;
  end if;

  -- Stari terminale — nicio actiune posibila dupa anulare/stornare.
  if old.status in ('cancelled', 'credited') and new.status is distinct from old.status then
    raise exception 'Factura % este % — nu mai poate schimba status.', old.id, old.status;
  end if;

  -- O factura emisa nu se mai "redefineste" — orice corectie trece prin
  -- stornare. Coloanele astea raman fixe indiferent cine scrie (UI sau
  -- un request direct catre API).
  if new.series is distinct from old.series
    or new.number is distinct from old.number
    or new.folio_id is distinct from old.folio_id
    or new.billing_customer_id is distinct from old.billing_customer_id
    -- Delegatul e parte din documentul tiparit: cine a ridicat factura si cu
    -- ce act. Dupa emitere nu se mai schimba, ca si clientul sau sumele; daca
    -- a ramas necompletat, corectia trece tot prin stornare.
    or new.delegat_nume is distinct from old.delegat_nume
    or new.delegat_ci_serie is distinct from old.delegat_ci_serie
    or new.delegat_ci_numar is distinct from old.delegat_ci_numar
    or new.subtotal_net is distinct from old.subtotal_net
    or new.subtotal_vat is distinct from old.subtotal_vat
    or new.total_amount is distinct from old.total_amount
    or new.issue_date is distinct from old.issue_date
    or new.service_date_start is distinct from old.service_date_start
    or new.service_date_end is distinct from old.service_date_end
    or new.credit_note_of is distinct from old.credit_note_of
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.issued_by is distinct from old.issued_by
  then
    raise exception 'Factura % este emisă — datele ei nu mai pot fi modificate (doar stornare).', old.id;
  end if;

  if new.status is distinct from old.status then
    -- issued/partially_paid/paid circula liber intre ele in ambele
    -- directii — asa functioneaza recalcularea automata la inregistrarea
    -- SAU stergerea unei plati (vezi recalc_invoice_payment_status), care
    -- poate impinge statusul si inapoi (ex. paid -> partially_paid daca
    -- se sterge o plata gresit introdusa).
    if old.status in ('issued','partially_paid','paid') and new.status in ('issued','partially_paid','paid') then
      null;
    elsif new.status = 'cancelled' then
      if old.status <> 'issued' or old.paid_amount <> 0 then
        raise exception 'O factură se poate anula doar din stadiul "emisă" și fără plăți înregistrate.';
      end if;
    elsif new.status = 'credited' then
      null; -- stornare, permisa din orice stare activa (issued/partially_paid/paid)
    else
      raise exception 'Tranziție de status invalidă: % -> %.', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

-- Amprenta pentru Oblio: delegatul pleaca in `mentions`, deci o schimbare a
-- lui inseamna alt document — reincercarea dupa un esec necunoscut trebuie
-- refuzata, la fel ca la schimbarea clientului sau a liniilor.
create or replace function oblio_amprenta_factura(p_id text)
returns text language sql stable set search_path = public as $$
  select md5(f.billing_customer_id || '|' || f.total_amount::text || '|' ||
             coalesce(f.delegat_nume, '') || '~' || coalesce(f.delegat_ci_serie, '') || '~' ||
             coalesce(f.delegat_ci_numar, '') || '|' ||
             coalesce((select string_agg(i.name || '~' || i.quantity::text || '~' || i.unit_price::text || '~' || i.vat_rate::text,
                                         '|' order by i.sort_order, i.id)
                         from invoice_items i where i.invoice_id = f.id), ''))
    from invoices f where f.id = p_id;
$$;