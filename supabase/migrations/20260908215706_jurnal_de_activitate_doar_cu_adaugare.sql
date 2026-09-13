-- Jurnalul de activitate — tabel propriu, doar cu adăugare.
create table activity_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  user_id   uuid references auth.users(id) on delete set null,
  user_name text not null default '?',
  user_role text not null default '?',
  action    text not null check (length(action) <= 200),
  detail    text check (length(detail) <= 1000)
);

create index activity_log_moment on activity_log (at desc);

-- Semnătura nu vine din browser, se pune aici.
create or replace function activity_log_semneaza()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  new.at      := now();
  new.user_id := auth.uid();
  select s.name, s.role into new.user_name, new.user_role
    from staff s where s.user_id = auth.uid();
  new.user_name := coalesce(new.user_name, '?');
  new.user_role := coalesce(new.user_role, '?');
  return new;
end $$;

create trigger activity_log_semnatura
  before insert on activity_log
  for each row execute function activity_log_semneaza();

alter table activity_log enable row level security;

create policy "citeste jurnal" on activity_log
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

create policy "scrie jurnal" on activity_log
  for insert to authenticated with check (staff_role() is not null);
