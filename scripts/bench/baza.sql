-- Măsurători pe 100.000 de rezervări în Postgres, pentru faza 1 din
-- docs/audit-2026-09.md. Rulat pe 13 septembrie 2026 în proiectul live,
-- într-o schemă separată `bench` — neexpusă prin API (PostgREST vede doar
-- `public`), fără trigger-e și fără RLS, ștearsă la final cu
-- `drop schema bench cascade`. Rezultatele sunt în docs/faza1.md.
--
-- Tabelele sunt copii de structură ale celor reale (`like ... including all`:
-- aceleași indexuri, aceeași constrângere de suprapunere). Cele 100.000 de
-- rânduri sunt sejururi consecutive pe cele 16 camere reale, 1–3 nopți,
-- pauză 0–1 zile, din 1990 până în 2033 (~20% anulate/no-show), cu 40.000
-- de oaspeți. Nu e realist comercial — contează numărul de rânduri.
--
-- Fără RLS: interogările reale mai plătesc un InitPlan (o căutare în
-- `staff`), sub o milisecundă.

drop schema if exists bench cascade;
create schema bench;
create table bench.reservations (like public.reservations including all);
create table bench.guests (like public.guests including all);

insert into bench.guests (id, last_name, first_name, phone, email, city, county, country, seeded, created_at)
select 'bg' || i,
  (array['Popescu','Ionescu','Pop','Radu','Dumitru','Stan','Stoica','Gheorghe','Matei','Constantin','Marin','Tudor','Munteanu','Lazăr','Rusu','Florea','Moldovan','Șerban','Dinu','Nistor'])[1 + (i*7) % 20],
  (array['Ana','Ion','Maria','Andrei','Elena','Mihai','Ioana','Alexandru','Cristina','George','Diana','Vlad','Raluca','Bogdan','Simona','Radu','Irina','Ștefan','Oana','Cătălin'])[1 + (i*13) % 20],
  '+407' || lpad(((i * 7919) % 100000000)::text, 8, '0'),
  'oaspete' || i || '@exemplu.ro', 'Iași', 'Iași', 'România', true, now() - (i % 4000) * interval '1 day'
from generate_series(1, 40000) i;

with cadre as (
  select r.id as room_id, k,
    1 + (abs(hashtext(r.id || ':' || k)) % 3) as nopti,
    (abs(hashtext(k || ':' || r.id)) % 2) as pauza
  from public.rooms r, generate_series(0, 6249) k
), cu_start as (
  select room_id, k, nopti,
    coalesce(sum(nopti + pauza) over (partition by room_id order by k rows between unbounded preceding and 1 preceding), 0) as decalaj
  from cadre
), gata as (
  select *, timestamptz '1990-01-01 14:00+02' + decalaj * interval '1 day' as ci from cu_start
)
insert into bench.reservations (id, room_id, guest_id, checkin, checkout, status, adults, children, source, booked_price, seeded, created_at, notes)
select 'br' || room_id || '-' || k, room_id,
  'bg' || (1 + abs(hashtext('g' || room_id || k)) % 40000),
  ci, ci + (nopti * interval '1 day') - interval '2 hours',
  case
    when abs(hashtext('s' || room_id || k)) % 100 < 20 then (array['cancelled','noshow'])[1 + k % 2]
    when ci + (nopti * interval '1 day') - interval '2 hours' <= now() then 'checkedout'
    when ci <= now() then 'checkedin'
    when abs(hashtext('p' || k)) % 10 = 0 then 'pending'
    else 'confirmed' end,
  2, k % 3 / 2, (array['direct','direct','direct','site','booking','phone'])[1 + (k % 6)],
  300 + (abs(hashtext('pr' || k)) % 600), true,
  ci - ((1 + abs(hashtext('c' || k)) % 60) * interval '1 day'),
  case when k % 7 = 0 then 'Observație de test' end
from gata;

analyze bench.reservations; analyze bench.guests;

-- Cel mai bun timp din trei rulări (EXPLAIN ANALYZE), în milisecunde.
create or replace function bench.timp(q text) returns numeric language plpgsql as $$
declare j json; best numeric; t numeric;
begin
  for i in 1..3 loop
    execute 'explain (analyze, format json) ' || q into j;
    t := (j->0->>'Execution Time')::numeric;
    if best is null or t < best then best := t; end if;
  end loop;
  return round(best, 1);
end $$;

create or replace function bench.randuri(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') x' into n; return n; end $$;

with q(ce, sql) as (values
  ('tot tabelul (arhitectura de azi)', 'select * from bench.reservations'),
  ('fereastra: deschise + închise în [−30, +400] zile', $q$select * from bench.reservations where status in ('pending','confirmed','protocol','checkedin') or (checkout >= now() - interval '30 days' and checkin <= now() + interval '400 days')$q$),
  ('doar deschise (pending/confirmed/checkedin)', $q$select * from bench.reservations where status in ('pending','confirmed','protocol','checkedin')$q$),
  ('night audit: checkedin cu plecarea depășită', $q$select * from bench.reservations where status = 'checkedin' and checkout < date_trunc('day', now())$q$),
  ('calendar: 21 de zile, toate camerele', $q$select * from bench.reservations where checkin < now() + interval '21 days' and checkout > now() and status not in ('cancelled','noshow')$q$),
  ('istoric oaspete: ultimele 20 de sejururi', $q$select * from bench.reservations where guest_id = 'bg777' order by checkin desc limit 20$q$),
  ('sumar pentru 30 de oaspeți dintr-o pagină', $q$select guest_id, count(*) sejururi, sum(extract(day from checkout - checkin)) nopti, sum(coalesce(price_override, booked_price)) incasat from bench.reservations where guest_id in ('bg1','bg2','bg3','bg4','bg5','bg6','bg7','bg8','bg9','bg10','bg11','bg12','bg13','bg14','bg15','bg16','bg17','bg18','bg19','bg20','bg21','bg22','bg23','bg24','bg25','bg26','bg27','bg28','bg29','bg30') and status not in ('cancelled','noshow','protocol') group by guest_id$q$),
  ('căutare oaspeți după nume/telefon (ilike, fără trgm)', $q$select * from bench.guests where last_name ilike '%pop%' or first_name ilike '%pop%' or phone like '%0722%' order by last_name, first_name limit 30$q$),
  ('raport lună: nopți și venit pe zi (sept 2026)', $q$with luna as (select id, checkin, checkout, coalesce(price_override, booked_price) pret from bench.reservations where checkin < timestamptz '2026-10-01 00:00+03' and checkout > timestamptz '2026-09-01 00:00+03' and status not in ('cancelled','noshow','protocol')) select d::date zi, count(r.id) camere, coalesce(sum(r.pret / greatest(1, ((r.checkout at time zone 'Europe/Bucharest')::date - (r.checkin at time zone 'Europe/Bucharest')::date))), 0) venit from generate_series(date '2026-09-01', date '2026-09-30', interval '1 day') d left join luna r on (r.checkin at time zone 'Europe/Bucharest')::date <= d::date and (r.checkout at time zone 'Europe/Bucharest')::date > d::date group by 1 order by 1$q$),
  ('card „De pe site”: ultimele 5', $q$select * from bench.reservations where source = 'site' order by created_at desc limit 5$q$)
)
select ce, bench.timp(sql) ms, bench.randuri(sql) randuri from q;

-- Căutarea de oaspeți cu index trigram (pg_trgm), varianta propusă în faza 1.
create extension if not exists pg_trgm with schema extensions;
create index bench_guests_nume_trgm on bench.guests using gin ((lower(coalesce(last_name,'') || ' ' || coalesce(first_name,''))) extensions.gin_trgm_ops);
create index bench_guests_telefon_trgm on bench.guests using gin (phone extensions.gin_trgm_ops);
analyze bench.guests;
select 'căutare oaspeți cu trgm' ce,
  bench.timp($q$select * from bench.guests where lower(coalesce(last_name,'') || ' ' || coalesce(first_name,'')) like '%pop%' or phone like '%0722%' order by last_name, first_name limit 30$q$) ms;

-- La final:
-- drop schema bench cascade;
