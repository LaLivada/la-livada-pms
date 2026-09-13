-- Rezervarea evaluata nu se mai numara pe sine in ocupare.
--
-- JS o excludea dintotdeauna (occupancyForStay primeste res.id), SQL nu.
-- La CREARE nu se vedea, fiindca trigger-ul e BEFORE INSERT si randul inca
-- nu e in tabel — deci comportamentul era, din intamplare, identic. La
-- EDITARE insa randul exista, iar SQL il numara: o camera in plus inseamna
-- 6,25 puncte de ocupare la 16 camere, destul cat sa sara un prag si sa
-- schimbe pretul cu 5%. Rezultatul: pretul reinghetat in baza diferea de
-- cel afisat in PMS pentru aceeasi rezervare.
--
-- Parametrul e optional si implicit null, deci toate apelurile existente
-- (disponibilitate publica, alocare de grup) raman neschimbate — acolo
-- rezervarea nici nu exista inca.

drop function if exists public.stay_total(text, timestamptz, timestamptz, int, int, boolean);
drop function if exists public.online_night_adjustment_pct(date);

create function public.online_night_adjustment_pct(p_zi date, p_exclude_id text default null)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  -- Intervalul [p_zi, p_zi+1) are exact o noapte.
  select online_adjustment_for_occupancy(
           occupancy_for_stay(p_zi::timestamptz, (p_zi + 1)::timestamptz, p_exclude_id));
$function$;

create function public.stay_total(
  p_room_id text,
  p_checkin timestamp with time zone,
  p_checkout timestamp with time zone,
  p_adults integer default 2,
  p_children integer default 0,
  p_online boolean default false,
  p_exclude_id text default null)
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
  -- care pastreaza exacte valorile de tip ".5" in virgula mobila.
  select coalesce(sum(
           nightly_rate(v_tip, d::date, p_adults, p_children)
             * (100 + online_night_adjustment_pct(d::date, p_exclude_id)) / 100
         ), 0)
    into v_online
    from generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day') d;

  return round(v_online);
end; $function$;

revoke execute on function public.online_night_adjustment_pct(date, text) from public, anon;
grant  execute on function public.online_night_adjustment_pct(date, text) to authenticated, service_role;
revoke execute on function public.stay_total(text, timestamptz, timestamptz, int, int, boolean, text) from public, anon;
grant  execute on function public.stay_total(text, timestamptz, timestamptz, int, int, boolean, text) to authenticated, service_role;

-- Trigger-ul trimite acum id-ul rezervarii, ca aceasta sa nu se numere pe
-- sine la recalculare.
do $outer$
declare v_def text; v_nou text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pret_server_rezervare';

  v_nou := replace(v_def,
    E'      -- ajustarea pe grad de ocupare doar pentru site-ul propriu,\n      -- exact ca in JS\n      new.source = ''site'');',
    E'      -- ajustarea pe grad de ocupare doar pentru site-ul propriu,\n      -- exact ca in JS\n      new.source = ''site'',\n      -- rezervarea nu se numara pe sine in ocupare (la editare ea exista\n      -- deja in tabel); JS o exclude la fel, prin res.id\n      new.id);');

  if v_nou = v_def then
    raise exception 'Nu s-a schimbat nimic in pret_server_rezervare.';
  end if;

  execute v_nou;
end $outer$;