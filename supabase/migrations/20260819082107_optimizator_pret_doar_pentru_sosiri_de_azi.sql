create or replace function public.stay_total(
  p_room_id text,
  p_checkin timestamp with time zone,
  p_checkout timestamp with time zone,
  p_adults integer default 2,
  p_children integer default 0,
  p_online boolean default false)
returns numeric
language plpgsql
stable
set search_path to 'public'
as $function$
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

  -- Optimizatorul se aplica numai sosirilor de AZI.
  --
  -- El citeste gradul de ocupare de acum. Pentru o data peste doua luni
  -- acela e aproape zero indiferent de cerere — rezervarile pur si simplu
  -- nu s-au strans inca — deci ar cadea mereu in pragul cel mai de jos si
  -- ar da o reducere nemeritata cuiva care rezerva din timp. E gandit ca
  -- parghie de last-minute: cine cere o camera pentru la noapte plateste
  -- mai mult sau mai putin dupa cat de plina e pensiunea in seara aceea.
  --
  -- Ziua se ia in ora Romaniei, nu a bazei: baza ruleaza pe UTC, iar intre
  -- miezul noptii si ora 3 data UTC e inca cea de ieri — o rezervare facuta
  -- la 1 noaptea pentru chiar acea noapte ar fi ratat regula.
  -- Aceeasi regula e impusa si in JS, in liveReservationTotalOnline.
  if (p_checkin at time zone 'Europe/Bucharest')::date
     <> (now()     at time zone 'Europe/Bucharest')::date then
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
end; $function$;