create or replace function public.public_capacity()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pe_tip as (
    select type, sum(capacity) as locuri
    from (
      select type, capacity,
             row_number() over (partition by type order by capacity desc) as rn
      from rooms where active
    ) x
    where rn <= 8
    group by type
  )
  select jsonb_build_object(
    'maxPerRoom', coalesce((select max(capacity) from rooms where active), 0),
    'maxRooms',   8,
    'maxGuests',  coalesce((select max(locuri) from pe_tip), 0)
  );
$function$;

revoke execute on function public.public_capacity() from public;
grant  execute on function public.public_capacity() to anon, authenticated, service_role;

create or replace function public.public_availability(
  p_checkin timestamp with time zone,
  p_checkout timestamp with time zone,
  p_adults integer default 2,
  p_children integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c_max_camere constant int := 8;
  v_ad   int := greatest(coalesce(p_adults, 2), 1);
  v_cop  int := greatest(coalesce(p_children, 0), 0);
  v_pers int;
  v_max_online int;
  v_tip  text;
  v_nr   int;
  v_ocupari int[];
  v_id_pret text;
  v_optiuni jsonb := '[]'::jsonb;
  v_camere  jsonb;
  v_total   numeric;
  v_i int; v_loc int; v_a int; v_c int;
  v_rest_ad int; v_rest_cop int;
begin
  v_pers := v_ad + v_cop;

  if p_checkin is null or p_checkout is null or p_checkout <= p_checkin then
    return jsonb_build_object('error', 'Perioadă invalidă.');
  end if;
  if p_checkout::date - p_checkin::date > 30 then
    return jsonb_build_object('error', 'Sejurul nu poate depăși 30 de nopți.');
  end if;
  if p_checkin < now() - interval '1 day' then
    return jsonb_build_object('error', 'Data sosirii este în trecut.');
  end if;
  if p_checkin > now() + interval '400 day' then
    return jsonb_build_object('error', 'Se pot căuta date doar în următoarele 400 de zile.');
  end if;

  select (public_capacity()->>'maxGuests')::int into v_max_online;
  if v_pers > v_max_online then
    return jsonb_build_object('error', format(
      'Online se pot rezerva cel mult %s persoane odată. Pentru grupuri mai mari, sună-ne.',
      v_max_online));
  end if;

  for v_tip in select distinct type from rooms where active order by 1 loop
    with libere as (
      select r.id, r.capacity,
             row_number() over (order by r.capacity desc, r.sort_order) as rn
        from rooms r
       where r.active and r.type = v_tip
         and not exists (
           select 1 from reservations res
            where res.room_id = r.id
              and res.status not in ('cancelled','noshow')
              and (res.status <> 'pending' or res.hold_expires_at > now())
              and tstzrange(res.checkin, res.checkout, '[)')
                  && tstzrange(p_checkin, p_checkout, '[)')
         )
    ), cumul as (
      select *, sum(capacity) over (order by rn) as cap_cum from libere
    )
    select min(rn) filter (where cap_cum >= v_pers),
           array_agg(least(capacity, greatest(0, v_pers - (cap_cum - capacity))) order by rn)
             filter (where cap_cum - capacity < v_pers),
           min(id) filter (where cap_cum - capacity < v_pers)
      into v_nr, v_ocupari, v_id_pret
      from cumul;

    continue when v_nr is null or v_nr > c_max_camere or v_ad < v_nr;

    v_rest_ad  := v_ad - v_nr;
    v_rest_cop := v_cop;
    v_camere   := '[]'::jsonb;

    for v_i in 1 .. v_nr loop
      v_loc := v_ocupari[v_i] - 1;
      v_a   := 1 + least(v_loc, v_rest_ad);
      v_rest_ad := v_rest_ad - (v_a - 1);
      v_loc := v_loc - (v_a - 1);
      v_c   := least(v_loc, v_rest_cop);
      v_rest_cop := v_rest_cop - v_c;
      v_camere := v_camere || jsonb_build_object(
        'roomType', v_tip, 'adults', v_a, 'children', v_c);
    end loop;

    select coalesce(sum(stay_total(v_id_pret, p_checkin, p_checkout,
                                   (c->>'adults')::int, (c->>'children')::int, true)), 0)
      into v_total
      from jsonb_array_elements(v_camere) c;

    v_optiuni := v_optiuni || jsonb_build_object(
      'roomType',    v_tip,
      'roomsNeeded', v_nr,
      'rooms',       v_camere,
      'total',       v_total);
  end loop;

  return jsonb_build_object(
    'checkIn',  p_checkin,
    'checkOut', p_checkout,
    'nights',   p_checkout::date - p_checkin::date,
    'guests',   jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
    'options',  v_optiuni);
end; $function$;