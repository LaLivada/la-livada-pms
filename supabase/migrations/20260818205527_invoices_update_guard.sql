-- Politica "modifica factura" are doar USING, fara WITH CHECK — orice
-- utilizator cu permisiune de facturare (oricare dintre cele 5:
-- create_invoice/issue_invoice/cancel_invoice/create_credit_note/
-- record_payment) poate in prezent rescrie orice coloana a oricarei
-- facturi printr-un request direct, ocolind complet regulile de business
-- din UI (ex. schimba suma unei facturi deja emise, sau ii schimba
-- clientul dupa emitere). RLS nu poate exprima usor "ce valori noi sunt
-- valide" printr-un simplu boolean pe using/with check cand regulile
-- depind de starea veche a rândului (masina de stari pe status) — un
-- trigger, ca la invoice_item_links_guard, e mult mai clar si poate da
-- mesaje de eroare explicite.
create or replace function guard_invoice_update()
returns trigger language plpgsql as $$
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

create trigger invoices_update_guard
  before update on invoices
  for each row execute function guard_invoice_update();