-- Faza 1 (docs/faza1.md, §2.5): raportul lunar se calculeaza in baza.
--
-- Pana acum ecranul Rapoarte trecea prin toate rezervarile din browser
-- (statisticiLuna / statisticiProtocol din src/lib/rapoarte.js). Cu
-- fereastra de timp (§2.1) browserul are doar ultimele 30 de zile, iar luna
-- trecuta incepe cu pana la 61 de zile in urma — raportul ei ar fi iesit
-- trunchiat. Functia de aici intoarce EXACT agregatele pe care le producea
-- JS-ul, cifra cu cifra (paritate verificata pe datele reale si pe o luna
-- de fixture — vezi scripts/paritate-raport.mjs); JS-ul ramane referinta.
--
-- Regulile, aceleasi ca in JS:
--   - zilele se taie la miezul noptii in Europe/Bucharest (browserul
--     receptiei e in acelasi fus);
--   - „ziua plecarii nu e noapte vanduta": o noapte = zi_sosire <= zi < zi_plecare;
--   - anulate / no-show nu conteaza nicaieri; protocolul are statistica lui;
--   - pretul real: suprascrierea manuala, altfel cel inghetat; fara snapshot
--     (backfill-ul de la pornire il completeaza) contează 0, iar negativ 0;
--   - cota pe noapte = pretul real / numarul TOTAL de nopti al sejurului
--     (minim 1), si se aduna doar pe noptile din luna; venitul cere camera
--     existenta, ocuparea nu (in baza FK-ul o garanteaza oricum);
--   - „pe sursa": rezervarile care ating luna dupa timpul brut (nu pe zile),
--     cu totalul intreg al fiecareia;
--   - capacitatea: toate camerele x zilele lunii; pe tip doar tiny/loft.
-- Procentele, ADR/RevPAR, maxOcc si etichetele surselor se pun in JS
-- (statisticiDinSql), ca sa existe o singura definitie a lor.
--
-- SECURITY INVOKER: RLS pe reservations se aplica; camerista n-are ecranul,
-- si daca l-ar chema ar primi o luna goala.
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
    select res.id, res.status,
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
           count(rn.id) filter (where rn.status <> 'protocol') as occ,
           coalesce(sum(rn.total / rn.nopti) filter (where rn.status <> 'protocol' and rn.are_camera), 0) as rev,
           count(rn.id) filter (where rn.status <> 'protocol' and rn.are_camera and rn.tip_camera = 'tiny') as tiny,
           count(rn.id) filter (where rn.status <> 'protocol' and rn.are_camera and rn.tip_camera = 'loft') as loft,
           count(rn.id) filter (where rn.status = 'protocol') as prot_nopti,
           coalesce(sum(rn.total / rn.nopti) filter (where rn.status = 'protocol'), 0) as prot_valoare
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
                          from rn where status <> 'protocol' group by sursa) s), '[]'::jsonb),
    'protocol',   jsonb_build_object(
                    'count',  (select count(*) from rn where status = 'protocol'),
                    'nights', (select coalesce(sum(prot_nopti), 0) from pe_zi),
                    'value',  (select coalesce(sum(prot_valoare), 0) from pe_zi))
  ) into v_rezultat;
  return v_rezultat;
end $$;

revoke execute on function raport_luna(int, int) from public, anon;
grant execute on function raport_luna(int, int) to authenticated, service_role;