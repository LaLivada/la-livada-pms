-- Storno (create_credit_note) adaugat explicit la setul implicit al
-- recepționerului, la cerere — inițial fusese exclus deliberat.
create or replace function acorda_permisiuni_facturare_implicite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'receptionist'
     and (tg_op = 'INSERT' or old.role is distinct from 'receptionist') then
    insert into billing_permissions (user_id, permission)
    select new.user_id, p
    from unnest(array['view_invoices','create_invoice','issue_invoice','record_payment','cancel_invoice','create_credit_note']) as p
    on conflict (user_id, permission) do nothing;
  end if;
  return new;
end;
$$;

-- Backfill: recepționerii deja existenți primesc si storno acum.
insert into billing_permissions (user_id, permission)
select user_id, 'create_credit_note' from staff where role = 'receptionist'
on conflict (user_id, permission) do nothing;
