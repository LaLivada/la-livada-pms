-- Trei schimbari cerute pe 21 august 2026:
-- 1. Recepția are drept de facturare, ca politică standard.
-- 2. Recepția nu mai poate șterge oaspeți/firme/grupuri (doar editează/adaugă).
-- 3. (jurnalul de activitate e doar o schimbare de rută in front-end, fara
--    nimic de facut aici — citirea din app_state e deja "using (true)")

-- --- 1. Permisiuni de facturare implicite pentru recepționer ---
create or replace function acorda_permisiuni_facturare_implicite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'receptionist'
     and (tg_op = 'INSERT' or old.role is distinct from 'receptionist') then
    insert into billing_permissions (user_id, permission)
    select new.user_id, p
    from unnest(array['view_invoices','create_invoice','issue_invoice','record_payment','cancel_invoice']) as p
    on conflict (user_id, permission) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_permisiuni_facturare_implicite on staff;
create trigger staff_permisiuni_facturare_implicite
  after insert or update of role on staff
  for each row execute function acorda_permisiuni_facturare_implicite();

-- Backfill: recepționerii deja existenți primesc aceleași permisiuni acum,
-- nu doar cei creați de acum înainte.
insert into billing_permissions (user_id, permission)
select s.user_id, p
from staff s, unnest(array['view_invoices','create_invoice','issue_invoice','record_payment','cancel_invoice']) as p
where s.role = 'receptionist'
on conflict (user_id, permission) do nothing;

-- --- 2. Stergere restransa la admin: oaspeti, grupuri, clienti de facturare ---
drop policy if exists "sterge oaspeti" on guests;
create policy "sterge oaspeti" on guests
  for delete to authenticated using (is_admin());

drop policy if exists "sterge grupuri" on res_groups;
create policy "sterge grupuri" on res_groups
  for delete to authenticated using (is_admin());

drop policy if exists "sterge clienti facturare" on billing_customers;
create policy "sterge clienti facturare" on billing_customers for delete to authenticated
  using (is_admin());
