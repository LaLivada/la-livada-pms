-- ETAPA 1 — un singur adevar pentru pret.
--
-- Pana acum existau doua formule: SQL (nightly_rate) si JS
-- (nightlyRate din src/lib/pricing.js). Cea din SQL nici nu primea
-- ocuparea ca parametru, deci structural nu putea aplica tariful single,
-- suplimentele de adult/copil sau ajustarea pe grad de ocupare.
-- Masurat inainte de aceasta migrare: 22 din 24 de combinatii difereau,
-- intre -220 si +50 lei pe noapte. Doar ocuparea standard (2 adulti,
-- 0 copii) coincidea — de aceea divergenta a trecut neobservata.
--
-- Semnaturile se schimba, deci functiile vechi se sterg si se recreeaza.
-- Parametrii noi au valori implicite, ca apelurile existente cu 3
-- argumente sa ramana valide.

drop function if exists available_rooms(timestamptz, timestamptz, int);
drop function if exists stay_total(text, timestamptz, timestamptz);
drop function if exists nightly_rate(text, date);


-- Tariful unei nopti. Oglindeste exact nightlyRate() din
-- src/lib/pricing.js, inclusiv regula ca tariful single INLOCUIESTE
-- standardul (nu se adauga peste el) si se aplica strict la 1 adult
-- si 0 copii.
create function nightly_rate(
  p_room_type text, p_date date,
  p_adults int default 2, p_children int default 0
) returns numeric language sql stable set search_path = public as $$
  with t as (
    select
      coalesce(
        (select s.price from seasons s
          where s.room_type = p_room_type
            and case when s.start_md <= s.end_md
                     then to_char(p_date,'MM-DD') between s.start_md and s.end_md
                     else to_char(p_date,'MM-DD') >= s.start_md
                       or to_char(p_date,'MM-DD') <= s.end_md
                end
          order by s.priority desc limit 1),
        (select r.base_price from rates r where r.room_type = p_room_type),
        0) as standard,
      (select coalesce(r.single_price, 0)      from rates r where r.room_type = p_room_type) as single,
      (select coalesce(r.adult_supplement, 0)  from rates r where r.room_type = p_room_type) as sup_a,
      (select coalesce(r.child_supplement, 0)  from rates r where r.room_type = p_room_type) as sup_c
  )
  select case
           when coalesce(p_adults,2) = 1 and coalesce(p_children,0) = 0 and t.single > 0
           then t.single
           else t.standard
              + greatest(0, coalesce(p_adults,2) - 2) * t.sup_a
              + coalesce(p_children,0) * t.sup_c
         end
  from t;
$$;


-- Ocuparea medie a proprietatii, in procente, pe durata unui sejur.
-- Oglindeste occupancyForStay() din src/lib/availability.js: media pe
-- nopti, nu pe zile-camera. Numitorul e numarul TOTAL de camere (ca in
-- JS, unde core.rooms nu e filtrat dupa active).
create function occupancy_for_stay(
  p_checkin timestamptz, p_checkout timestamptz, p_exclude_id text default null
) returns numeric language sql stable set search_path = public as $$
  with nopti as (
    select generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day')::date as zi
  ), total as (
    select nullif(count(*), 0)::numeric as n from rooms
  )
  select coalesce(avg(
    (select count(*) from reservations r
      where r.status not in ('cancelled','noshow')
        and (p_exclude_id is null or r.id <> p_exclude_id)
        and r.checkin::date <= nopti.zi
        and r.checkout::date > nopti.zi
    )::numeric / (select n from total) * 100
  ), 0)
  from nopti;
$$;


-- Totalul unui sejur. p_online aplica ajustarea pe grad de ocupare,
-- exact ca liveReservationTotalOnline() din JS — doar rezervarile facute
-- prin site-ul propriu o primesc.
create function stay_total(
  p_room_id text, p_checkin timestamptz, p_checkout timestamptz,
  p_adults int default 2, p_children int default 0, p_online boolean default false
) returns numeric language plpgsql stable set search_path = public as $$
declare
  v_tip text; v_baza numeric; v_occ numeric; v_max numeric; v_eff numeric; v_pct numeric;
begin
  select type into v_tip from rooms where id = p_room_id;
  if v_tip is null then return 0; end if;

  select coalesce(sum(nightly_rate(v_tip, d::date, p_adults, p_children)), 0)
    into v_baza
    from generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day') d;
  v_baza := round(v_baza, 2);

  if not coalesce(p_online, false) then
    return v_baza;
  end if;

  if not exists (select 1 from online_pricing_tiers) then
    return v_baza;
  end if;

  v_occ := occupancy_for_stay(p_checkin, p_checkout, null);
  -- Ca in JS: ultimul prag e inclusiv la capatul de sus, altfel 100%
  -- n-ar cadea in niciun prag.
  select max(max_occ) into v_max from online_pricing_tiers;
  v_eff := least(v_occ, v_max - 0.0001);
  select t.adjustment_pct into v_pct from online_pricing_tiers t
   where v_eff >= t.min_occ and v_eff < t.max_occ limit 1;

  return round(v_baza * (1 + coalesce(v_pct, 0) / 100));
end; $$;


-- Camerele libere intr-un interval, cu pretul total. Singura functie de
-- citire folosita de site-ul public. p_guests se interpreteaza ca numar
-- de adulti (nu se stie defalcarea la acest nivel) — site-ul public
-- foloseste public_availability, care primeste adulti si copii separat.
create function available_rooms(p_checkin timestamptz, p_checkout timestamptz, p_guests int default 1)
returns table (room_id text, room_name text, room_type text, capacity int, total numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.type, r.capacity,
         stay_total(r.id, p_checkin, p_checkout, greatest(1, p_guests), 0, true)
  from rooms r
  where r.active
    and r.capacity >= p_guests
    and not exists (
      select 1 from reservations res
      where res.room_id = r.id
        and res.status not in ('cancelled','noshow')
        and (res.status <> 'pending' or res.hold_expires_at > now())
        and tstzrange(res.checkin, res.checkout, '[)')
            && tstzrange(p_checkin, p_checkout, '[)')
    )
  order by r.sort_order, r.name;
$$;


-- Drepturile se pierd la drop; se reacorda explicit.
revoke execute on function nightly_rate(text, date, int, int) from public, anon;
revoke execute on function occupancy_for_stay(timestamptz, timestamptz, text) from public, anon;
revoke execute on function stay_total(text, timestamptz, timestamptz, int, int, boolean) from public, anon;
grant execute on function nightly_rate(text, date, int, int) to authenticated, service_role;
grant execute on function occupancy_for_stay(timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function stay_total(text, timestamptz, timestamptz, int, int, boolean) to authenticated, service_role;

revoke execute on function available_rooms(timestamptz, timestamptz, int) from public;
grant execute on function available_rooms(timestamptz, timestamptz, int) to anon, authenticated, service_role;