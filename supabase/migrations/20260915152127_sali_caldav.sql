-- Sălile de evenimente și serverul CalDAV propriu (etapa 1, 15 septembrie 2026).
-- Serverul e funcția edge `caldav` (supabase/functions/caldav): telefonul
-- adaugă un cont CalDAV cu emailul de login și o parolă generată din
-- „Contul tău”; calendarele sălilor stau aici, evenimentele exact în forma
-- în care le trimite clientul (coloana ics), plus câmpuri de indexare.

create table caldav_calendare (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  nume          text not null,
  culoare       text check (culoare is null or culoare ~ '^#[0-9A-Fa-f]{6}$'),
  ordine        integer not null default 0,
  -- getctag-ul CalDAV: crește la orice scriere într-un obiect al calendarului
  -- (trigger mai jos). Tot el e și sync-token-ul (sync-collection).
  ctag          bigint not null default 1,
  activ         boolean not null default true,
  creat_la      timestamptz not null default now(),
  actualizat_la timestamptz not null default now()
);

create table caldav_obiecte (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references caldav_calendare(id) on delete cascade,
  href          text not null,            -- numele resursei (ex. 1F2E...ics), ales de client
  uid           text,                     -- UID-ul VEVENT-ului (unul per resursă)
  etag          text not null default '', -- md5(ics), pus de trigger
  ics           text not null,            -- textul iCalendar, neatins
  rezumat       text,                     -- SUMMARY, pentru ecranele PMS
  incepe        timestamptz,
  se_termina    timestamptz,
  toata_ziua    boolean not null default false,
  recurent      boolean not null default false,
  -- Ștergerea lasă rândul (sters = true) cu sync_seq-ul ștergerii: așa
  -- sync-collection poate spune telefonului ce a dispărut de la ultimul token.
  sters         boolean not null default false,
  sync_seq      bigint not null default 0,
  creat_la      timestamptz not null default now(),
  actualizat_la timestamptz not null default now(),
  unique (calendar_id, href)
);
create index caldav_obiecte_sync on caldav_obiecte (calendar_id, sync_seq);
create index caldav_obiecte_incepe on caldav_obiecte (calendar_id, incepe) where not sters;
create unique index caldav_obiecte_uid_viu on caldav_obiecte (calendar_id, uid) where uid is not null and not sters;

-- Contul CalDAV al fiecărui user din PMS: doar hash-ul SHA-256 al parolei
-- generate (o parolă aleatoare de 20 de caractere; hash-ul rapid ajunge).
create table caldav_conturi (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  utilizator      text not null unique,
  email           text,
  parola_hash     text not null check (parola_hash ~ '^[0-9a-f]{64}$'),
  creat_la        timestamptz not null default now(),
  ultima_folosire timestamptz
);

create or replace function caldav_obiect_schimbat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.etag := md5(new.ics);
  new.actualizat_la := now();
  update caldav_calendare
     set ctag = ctag + 1, actualizat_la = now()
   where id = new.calendar_id
   returning ctag into new.sync_seq;
  return new;
end;
$$;

create trigger caldav_obiecte_schimbare
  before insert or update on caldav_obiecte
  for each row execute function caldav_obiect_schimbat();

alter table caldav_calendare enable row level security;
alter table caldav_obiecte   enable row level security;
alter table caldav_conturi   enable row level security;

-- Calendarele și evenimentele: le vede tot personalul (și camerista, ca să
-- știe zilele cu evenimente); le administrează doar adminul. Scrierea în
-- obiecte vine numai prin funcția edge (service_role), nu din browser.
create policy "citeste calendarele salilor" on caldav_calendare
  for select to authenticated using ((select staff_role()) is not null);
create policy "admin adauga calendare de sali" on caldav_calendare
  for insert to authenticated with check ((select is_admin()));
create policy "admin modifica calendarele salilor" on caldav_calendare
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin sterge calendarele salilor" on caldav_calendare
  for delete to authenticated using ((select is_admin()));

create policy "citeste evenimentele salilor" on caldav_obiecte
  for select to authenticated using ((select staff_role()) is not null);

-- Contul CalDAV: fiecare doar pe al lui.
create policy "citeste contul caldav propriu" on caldav_conturi
  for select to authenticated using (user_id = (select auth.uid()));
create policy "creeaza contul caldav propriu" on caldav_conturi
  for insert to authenticated with check (user_id = (select auth.uid()) and (select staff_role()) is not null);
create policy "schimba contul caldav propriu" on caldav_conturi
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sterge contul caldav propriu" on caldav_conturi
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on caldav_calendare to authenticated;
grant select on caldav_obiecte to authenticated;
grant select, insert, update, delete on caldav_conturi to authenticated;
revoke all on caldav_calendare, caldav_obiecte, caldav_conturi from anon;

comment on table caldav_calendare is 'Calendarele sălilor de evenimente, servite prin CalDAV (funcția edge caldav). ctag = getctag și sync-token.';
comment on table caldav_obiecte  is 'Evenimentele sălilor, un rând per resursă CalDAV (un UID), cu textul iCalendar neatins; sters = piatră de mormânt pentru sync-collection.';
comment on table caldav_conturi  is 'Contul CalDAV al fiecărui user din PMS: utilizatorul (emailul) și hash-ul SHA-256 al parolei generate din „Contul tău”.';
