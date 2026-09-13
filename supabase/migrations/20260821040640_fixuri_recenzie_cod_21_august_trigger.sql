alter table staff add column if not exists permisiuni_implicite_acordate boolean not null default false;

update staff set permisiuni_implicite_acordate = true where role = 'receptionist';

create or replace function acorda_permisiuni_facturare_implicite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'receptionist' and not new.permisiuni_implicite_acordate then
    insert into billing_permissions (user_id, permission)
    select new.user_id, p
    from unnest(array['view_invoices','create_invoice','issue_invoice','record_payment','cancel_invoice','create_credit_note']) as p
    on conflict (user_id, permission) do nothing;
    update staff set permisiuni_implicite_acordate = true where user_id = new.user_id;
  end if;
  return new;
end;
$$;
