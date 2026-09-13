-- Nopțile unui sejur se numără pe zilele de la Vaslui, nu pe zilele UTC ale
-- sesiunii (faza 2, B6 din docs/audit-2026-09.md). Până acum
-- `p_checkin::date` folosea fusul sesiunii — UTC pe Supabase: o sosire la
-- 01:00 ora României cădea în ziua UTC de dinainte și se taxa o noapte în
-- plus față de PMS. JS-ul (src/lib/timp.js) numără din 14 septembrie 2026
-- pe aceeași zi, deci cele două implementări cad la fel. Semnăturile și
-- drepturile rămân neschimbate (create or replace).

create or replace function occupancy_for_stay(
  p_checkin timestamptz, p_checkout timestamptz, p_exclude_id text default null
) returns numeric language sql stable set search_path = public as $$
  with nopti as (
    select generate_series((p_checkin  at time zone 'Europe/Bucharest')::date,
                           (p_checkout at time zone 'Europe/Bucharest')::date - 1,
                           interval '1 day')::date as zi
  ), total as (
    select nullif(count(*), 0)::numeric as n from rooms
  )
  select coalesce(avg(
    (select count(*) from reservations r
      where r.status not in ('cancelled','noshow')
        and (p_exclude_id is null or r.id <> p_exclude_id)
        and (r.checkin  at time zone 'Europe/Bucharest')::date <= nopti.zi
        and (r.checkout at time zone 'Europe/Bucharest')::date >  nopti.zi
    )::numeric / (select n from total) * 100
  ), 0)
  from nopti;
$$;

create or replace function online_night_adjustment_pct(p_zi date, p_exclude_id text default null)
returns numeric language sql stable set search_path = public as $$
  -- Intervalul [p_zi, p_zi+1) are exact o noapte, între două miezuri de
  -- noapte de la Vaslui.
  select online_adjustment_for_occupancy(
           occupancy_for_stay(p_zi::timestamp at time zone 'Europe/Bucharest',
                              (p_zi + 1)::timestamp at time zone 'Europe/Bucharest',
                              p_exclude_id));
$$;

create or replace function stay_total(
  p_room_id text, p_checkin timestamptz, p_checkout timestamptz,
  p_adults int default 2, p_children int default 0, p_online boolean default false,
  -- Rezervarea care se recalculează, ca să nu se numere pe sine în ocupare.
  -- Implicit null: la disponibilitatea publică rezervarea nici nu există încă.
  p_exclude_id text default null
) returns numeric language plpgsql stable set search_path = public as $$
declare v_tip text; v_baza numeric; v_online numeric;
        v_prima date; v_ultima date;
begin
  select type into v_tip from rooms where id = p_room_id;
  if v_tip is null then return 0; end if;

  -- Zilele de la Vaslui, nu ale sesiunii (UTC): ziua plecării nu e noapte
  -- vândută, de aici '- 1'.
  v_prima  := (p_checkin  at time zone 'Europe/Bucharest')::date;
  v_ultima := (p_checkout at time zone 'Europe/Bucharest')::date - 1;

  select coalesce(sum(nightly_rate(v_tip, d::date, p_adults, p_children)), 0)
    into v_baza
    from generate_series(v_prima, v_ultima, interval '1 day') d;
  v_baza := round(v_baza, 2);

  if not coalesce(p_online, false) then return v_baza; end if;

  -- Fiecare noapte se ajustează după ocuparea EI, nu după media sejurului:
  -- un sejur care prinde un weekend plin și trei zile goale nu trebuie să
  -- dilueze majorarea weekendului într-o medie.
  -- Aceeași regulă e impusă și în JS, în liveReservationTotalOnline.
  --
  -- Scris ca (100 + pct) / 100, aceeași formă ca în JS: acolo e singura
  -- care păstrează exacte valorile de tip „.5" în virgulă mobilă, iar
  -- aici e echivalentă — deci cele două implementări se citesc la fel.
  select coalesce(sum(
           nightly_rate(v_tip, d::date, p_adults, p_children)
             * (100 + online_night_adjustment_pct(d::date, p_exclude_id)) / 100
         ), 0)
    into v_online
    from generate_series(v_prima, v_ultima, interval '1 day') d;

  return round(v_online);
end; $$;