-- Ajustarea aplicata pentru un grad de ocupare dat.
--
-- Exista ca functie separata ca sa poata fi verificata pe o matrice de
-- valori: online_night_adjustment_pct() isi calculeaza singura ocuparea
-- din rezervarile reale, deci nu se poate fixa intr-un contract.
-- Perechea JS e onlineNightAdjustmentPct() din src/lib/pricing.js.
create or replace function public.online_adjustment_for_occupancy(p_occ numeric)
returns numeric
language plpgsql
stable
set search_path to 'public'
as $function$
declare v_max numeric; v_eff numeric; v_pct numeric;
begin
  if not exists (select 1 from online_pricing_tiers) then return 0; end if;

  -- Ultimul prag e inclusiv la capatul de sus, altfel 100% n-ar cadea in
  -- niciun prag.
  select max(max_occ) into v_max from online_pricing_tiers;
  v_eff := least(coalesce(p_occ, 0), v_max - 0.0001);
  select t.adjustment_pct into v_pct from online_pricing_tiers t
   where v_eff >= t.min_occ and v_eff < t.max_occ limit 1;

  -- Reducerile nu se aplica: ocuparea masoara rezervarile stranse pana
  -- acum, nu cererea.
  return greatest(0, coalesce(v_pct, 0));
end; $function$;

revoke execute on function public.online_adjustment_for_occupancy(numeric) from public, anon;
grant  execute on function public.online_adjustment_for_occupancy(numeric) to authenticated, service_role;

-- Ramane punctul de intrare pentru o zi anume; calculul pragului trece
-- acum prin functia de mai sus, ca sa existe o singura definitie.
create or replace function public.online_night_adjustment_pct(p_zi date)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  -- Intervalul [p_zi, p_zi+1) are exact o noapte.
  select online_adjustment_for_occupancy(
           occupancy_for_stay(p_zi::timestamptz, (p_zi + 1)::timestamptz, null));
$function$;

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
declare v_tip text; v_baza numeric; v_online numeric;
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

  -- Fiecare noapte se ajusteaza dupa ocuparea EI, nu dupa media sejurului.
  -- Scris ca (100 + pct) / 100, aceeasi forma ca in JS: acolo e singura
  -- care pastreaza exacte valorile de tip ".5" in virgula mobila, iar aici
  -- e echivalenta, deci cele doua implementari se citesc la fel.
  select coalesce(sum(
           nightly_rate(v_tip, d::date, p_adults, p_children)
             * (100 + online_night_adjustment_pct(d::date)) / 100
         ), 0)
    into v_online
    from generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day') d;

  return round(v_online);
end; $function$;