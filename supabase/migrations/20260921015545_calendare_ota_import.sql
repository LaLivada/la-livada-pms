create table camere_calendare_ota (
  id                  bigint generated always as identity primary key,
  room_id             text not null references rooms(id) on delete cascade,
  ota                 text not null
                        check (ota ~ '^[a-z0-9][a-z0-9._-]{0,31}$' and ota <> 'eveniment'),
  eticheta            text not null check (length(eticheta) between 1 and 40),
  url_ics             text not null
                        check (url_ics ~ '^https?://' and length(url_ics) between 12 and 500),
  activ               boolean not null default true,
  ultima_sincronizare timestamptz,
  ultima_eroare       text check (length(ultima_eroare) <= 500),
  erori_consecutive   int not null default 0,
  creat_la            timestamptz not null default now(),
  unique (room_id, ota)
);

alter table camere_calendare_ota enable row level security;

create policy "citeste calendare ota" on camere_calendare_ota
  for select to authenticated using ((select is_admin()) or (select staff_role()) = 'receptionist');
create policy "admin adauga calendare ota" on camere_calendare_ota
  for insert to authenticated with check ((select is_admin()));
create policy "admin modifica calendare ota" on camere_calendare_ota
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin sterge calendare ota" on camere_calendare_ota
  for delete to authenticated using ((select is_admin()));

comment on table camere_calendare_ota is
  'Adresele .ics de import, una per camera per OTA. Citite de functia edge ical-import, chemata de pg_cron la 15 minute. ultima_eroare/erori_consecutive: un feed picat NU e un feed gol — se sare peste rand, nu se anuleaza rezervarile camerei.';

create or replace function activity_log_semneaza()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  new.at := now();
  new.user_id := auth.uid();
  if new.user_id is null then
    new.user_name := coalesce(nullif(btrim(new.user_name), ''), '?');
    new.user_role := 'sistem';
    return new;
  end if;
  select s.name, s.role into new.user_name, new.user_role
    from staff s where s.user_id = auth.uid();
  new.user_name := coalesce(new.user_name, '?');
  new.user_role := coalesce(new.user_role, '?');
  return new;
end $$;

revoke execute on function activity_log_semneaza() from public, anon, authenticated;