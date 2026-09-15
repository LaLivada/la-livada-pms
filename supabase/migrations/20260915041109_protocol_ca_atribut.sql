-- Protocol ca atribut al rezervarii, nu doar ca stare (15 septembrie 2026).
--
-- „Protocol" era doar o stare (status), folosita si ca marcaj „nu se
-- incaseaza" in Azi, in rapoarte (raport_luna, oaspeti_statistici) si in
-- fisele de client. O asemenea rezervare nu putea face check-in (canCheckIn
-- cerea „confirmed"), iar daca ar fi facut, ar fi devenit „checkedin" si ar
-- fi intrat in venit ca una platita. Coloana `protocol` tine marcajul
-- separat de stare: o pune triggerul cand starea e 'protocol', ramane la
-- check-in / check-out / no-show / anulare si se sterge cand starea e pusa
-- explicit pe 'pending' sau 'confirmed' (o reclasificare comerciala).
-- Interfata n-o scrie niciodata — o citeste (camelRes) si atat.
alter table public.reservations add column if not exists protocol boolean not null default false;
update public.reservations set protocol = true where status = 'protocol' and not protocol;

create or replace function public.reservations_protocol_din_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'protocol' then
    new.protocol := true;
  elsif new.status in ('pending', 'confirmed') then
    new.protocol := false;
  end if;
  return new;
end $$;
drop trigger if exists reservations_protocol_din_status on public.reservations;
create trigger reservations_protocol_din_status
  before insert or update of status on public.reservations
  for each row execute function public.reservations_protocol_din_status();

-- Raportul lunar: „protocol" e acum atributul, nu starea (un sejur protocol
-- cazat sau plecat ramane la statistica lui, nu intra in venit).
create or replace function raport_luna(p_an int, p_luna int)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_de       date := make_date(p_an, p_luna, 1);
  v_pana     date := (make_date(p_an, p_luna, 1) + interval '1 month')::date;
  v_zile     int;
  v_de_ts    timestamptz;
  v_pana_ts  timestamptz;
  v_rezultat jsonb;
begin
  v_zile    := v_pana - v_de;
  v_de_ts   := v_de::timestamp   at time zone 'Europe/Bucharest';
  v_pana_ts := v_pana::timestamp at time zone 'Europe/Bucharest';

  with r as (
    select res.id, res.status, (res.protocol or res.status = 'protocol') as protocol,
           coalesce(nullif(res.source, ''), 'direct') as sursa,
           (res.checkin  at time zone 'Europe/Bucharest')::date as zi_sosire,
           (res.checkout at time zone 'Europe/Bucharest')::date as zi_plecare,
           case when res.price_override is not null then greatest(res.price_override, 0)
                when res.booked_price   is not null then greatest(res.booked_price, 0)
                else 0 end as total,
           rm.id is not null as are_camera,
           rm.type as tip_camera
    from reservations res
    left join rooms rm on rm.id = res.room_id
    where res.status not in ('cancelled', 'noshow')
      and res.source is distinct from 'blocaj'
      and res.checkin < v_pana_ts and res.checkout > v_de_ts
  ), rn as (
    select r.*, greatest(1, r.zi_plecare - r.zi_sosire) as nopti from r
  ), zile as (
    select d::date as zi, (d::date - v_de + 1) as nr
    from generate_series(v_de, v_pana - 1, interval '1 day') d
  ), pe_zi as (
    select z.nr,
           count(rn.id) filter (where not rn.protocol) as occ,
           coalesce(sum(rn.total / rn.nopti) filter (where not rn.protocol and rn.are_camera), 0) as rev,
           count(rn.id) filter (where not rn.protocol and rn.are_camera and rn.tip_camera = 'tiny') as tiny,
           count(rn.id) filter (where not rn.protocol and rn.are_camera and rn.tip_camera = 'loft') as loft,
           count(rn.id) filter (where rn.protocol) as prot_nopti,
           coalesce(sum(rn.total / rn.nopti) filter (where rn.protocol), 0) as prot_valoare
    from zile z
    left join rn on rn.zi_sosire <= z.zi and rn.zi_plecare > z.zi
    group by z.nr
  )
  select jsonb_build_object(
    'zile',       v_zile,
    'roomNights', (select coalesce(sum(occ), 0) from pe_zi),
    'revenue',    (select coalesce(sum(rev), 0) from pe_zi),
    'capacity',   (select count(*) from rooms) * v_zile,
    'perDay',     (select jsonb_agg(jsonb_build_object('day', nr, 'occ', occ, 'rev', rev) order by nr) from pe_zi),
    'byType',     jsonb_build_array(
                    jsonb_build_object('type', 'tiny',
                      'nights', (select coalesce(sum(tiny), 0) from pe_zi),
                      'cap',    (select count(*) from rooms where type = 'tiny') * v_zile),
                    jsonb_build_object('type', 'loft',
                      'nights', (select coalesce(sum(loft), 0) from pe_zi),
                      'cap',    (select count(*) from rooms where type = 'loft') * v_zile)),
    'bySource',   coalesce((select jsonb_agg(jsonb_build_object('key', sursa, 'count', n, 'rev', rev) order by n desc, sursa)
                    from (select sursa, count(*) as n, sum(total) as rev
                          from rn where not protocol group by sursa) s), '[]'::jsonb),
    'protocol',   jsonb_build_object(
                    'count',  (select count(*) from rn where protocol),
                    'nights', (select coalesce(sum(prot_nopti), 0) from pe_zi),
                    'value',  (select coalesce(sum(prot_valoare), 0) from pe_zi))
  ) into v_rezultat;
  return v_rezultat;
end $$;

-- Sumarul pe oaspete: incasatul sare peste protocol dupa atribut.
create or replace view public.oaspeti_statistici
with (security_invoker = true) as
select guest_id,
       count(*) filter (where status not in ('cancelled', 'noshow')) as sejururi,
       coalesce(sum(greatest(1, (checkout at time zone 'Europe/Bucharest')::date
                                - (checkin at time zone 'Europe/Bucharest')::date))
                filter (where status not in ('cancelled', 'noshow')), 0) as nopti,
       coalesce(sum(coalesce(price_override, booked_price, 0))
                filter (where status not in ('cancelled', 'noshow') and not protocol), 0) as incasat,
       max(checkin) filter (where status not in ('cancelled', 'noshow')) as ultima_sosire
from reservations
where guest_id is not null
group by guest_id;
