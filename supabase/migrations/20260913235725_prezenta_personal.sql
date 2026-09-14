-- Prezența personalului (faza 3, C7): când a fost fiecare utilizator ultima
-- dată în aplicație, ca rezervările intrate între timp să poarte eticheta
-- „nouă de la ultima deschidere".
--
-- Două ștampile, nu una. `ultima_prezenta` e bătaia de inimă: se împinge la
-- deschidere și apoi la câteva minute cât timp aplicația e pe ecran.
-- `vazut_pana_la` e reperul etichetei: se mută pe vechea `ultima_prezenta`
-- doar când între două bătăi a trecut o pauză adevărată (30 de minute) —
-- adică o DESCHIDERE, nu o reîncărcare de pagină. Cu o singură ștampilă, un
-- F5 din greșeală ar fi șters toate etichetele („ai deschis-o acum 2 minute").
--
-- Per utilizator, nu per dispozitiv: Răzvan de pe telefon și Răzvan de la
-- birou sunt același om, care a văzut aceleași lucruri.
create table staff_prezenta (
  user_id         uuid primary key references staff(user_id) on delete cascade,
  ultima_prezenta timestamptz not null default now(),
  vazut_pana_la   timestamptz              -- null = prima deschidere, nimic nu e „nou"
);

alter table staff_prezenta enable row level security;
revoke all on staff_prezenta from public, anon;
grant select, insert, update on staff_prezenta to authenticated;

-- Fiecare își vede și își scrie DOAR rândul lui. Nimeni nu citește prezența
-- altcuiva — nu e un ecran de supraveghere, e un reper pentru etichetă.
create policy "vede prezenta proprie" on staff_prezenta
  for select to authenticated using (user_id = (select auth.uid()));
create policy "scrie prezenta proprie" on staff_prezenta
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "modifica prezenta proprie" on staff_prezenta
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Aplicația o cheamă la deschidere și apoi periodic; întoarce reperul
-- `vazut_pana_la` de folosit pentru etichete (null la prima deschidere).
-- `p_pauza` e pauza care face dintr-un apel o „deschidere" — parametru doar
-- ca să poată fi verificată fără să aștepți 30 de minute.
-- `for update`: două file deschise în aceeași clipă nu-și calcă reperul.
create or replace function marcheaza_prezenta(p_pauza interval default interval '30 minutes')
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rand  staff_prezenta%rowtype;
  v_vazut timestamptz;
begin
  select * into v_rand from staff_prezenta where user_id = (select auth.uid()) for update;
  if not found then
    insert into staff_prezenta (user_id, ultima_prezenta, vazut_pana_la)
      values ((select auth.uid()), now(), null);
    return null;
  end if;
  v_vazut := case
    when v_rand.ultima_prezenta < now() - p_pauza then v_rand.ultima_prezenta
    else v_rand.vazut_pana_la
  end;
  update staff_prezenta
     set ultima_prezenta = now(), vazut_pana_la = v_vazut
   where user_id = v_rand.user_id;
  return v_vazut;
end;
$$;
revoke execute on function marcheaza_prezenta(interval) from public, anon;
grant execute on function marcheaza_prezenta(interval) to authenticated, service_role;
