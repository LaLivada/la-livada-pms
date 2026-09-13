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
  v_adulti  int[];
  v_copii   int[];
  v_id_pret text;
  v_optiuni jsonb := '[]'::jsonb;
  v_camere  jsonb;
  v_total   numeric;
  v_i int; v_surplus int; v_pus boolean;
  v_rest_ad int; v_rest_cop int;
  v_min_camere int := null;
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
           array_agg(capacity order by rn) filter (where cap_cum - capacity < v_pers),
           min(id) filter (where cap_cum - capacity < v_pers)
      into v_nr, v_ocupari, v_id_pret
      from cumul;

    continue when v_nr is null or v_nr > c_max_camere;
    v_min_camere := least(coalesce(v_min_camere, v_nr), v_nr);
    continue when v_ad < v_nr;

    -- Camerele pornesc pline; scoatem surplusul din cele mai aglomerate,
    -- ca grupul sa fie repartizat echilibrat. Umplerea lacoma ar da 3+1
    -- pentru patru persoane in doua camere de 3, in loc de 2+2.
    v_surplus := (select coalesce(sum(x), 0) from unnest(v_ocupari) x) - v_pers;
    while v_surplus > 0 loop
      select i into v_i
        from generate_subscripts(v_ocupari, 1) i
       where v_ocupari[i] > 1
       order by v_ocupari[i] desc, i
       limit 1;
      exit when v_i is null;
      v_ocupari[v_i] := v_ocupari[v_i] - 1;
      v_surplus := v_surplus - 1;
    end loop;

    -- Repartizare pe rand, cate unul in fiecare camera, intai adultii apoi
    -- copiii. Umplerea camera-cu-camera ar aduna adultii intr-una si ar
    -- lasa copiii cu unul singur in alta: pentru 4 adulti si 2 copii dadea
    -- 3a + 1a2c, in loc de 2a1c + 2a1c.
    v_adulti := array_fill(0, array[v_nr]);
    v_copii  := array_fill(0, array[v_nr]);

    -- Cate un adult in fiecare camera — nicio camera cu copii singuri.
    for v_i in 1 .. v_nr loop
      v_adulti[v_i] := 1;
    end loop;
    v_rest_ad  := v_ad - v_nr;
    v_rest_cop := v_cop;

    while v_rest_ad > 0 loop
      v_pus := false;
      for v_i in 1 .. v_nr loop
        exit when v_rest_ad = 0;
        if v_adulti[v_i] + v_copii[v_i] < v_ocupari[v_i] then
          v_adulti[v_i] := v_adulti[v_i] + 1;
          v_rest_ad := v_rest_ad - 1;
          v_pus := true;
        end if;
      end loop;
      exit when not v_pus;
    end loop;

    while v_rest_cop > 0 loop
      v_pus := false;
      for v_i in 1 .. v_nr loop
        exit when v_rest_cop = 0;
        if v_adulti[v_i] + v_copii[v_i] < v_ocupari[v_i] then
          v_copii[v_i] := v_copii[v_i] + 1;
          v_rest_cop := v_rest_cop - 1;
          v_pus := true;
        end if;
      end loop;
      exit when not v_pus;
    end loop;

    v_camere := '[]'::jsonb;
    for v_i in 1 .. v_nr loop
      v_camere := v_camere || jsonb_build_object(
        'roomType', v_tip, 'adults', v_adulti[v_i], 'children', v_copii[v_i]);
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

  if jsonb_array_length(v_optiuni) = 0 then
    return jsonb_build_object(
      'checkIn', p_checkin, 'checkOut', p_checkout,
      'nights',  p_checkout::date - p_checkin::date,
      'guests',  jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
      'options', v_optiuni,
      'error',
        case
          when v_min_camere is not null and v_ad < v_min_camere then format(
            'Pentru %s persoane sunt necesare %s camere, iar în fiecare trebuie să fie cel puțin un adult. Ai nevoie de cel puțin %s adulți sau de mai puține persoane.',
            v_pers, v_min_camere, v_min_camere)
          else
            'Nu mai sunt camere libere pentru perioada și numărul de persoane alese.'
        end);
  end if;

  return jsonb_build_object(
    'checkIn',  p_checkin,
    'checkOut', p_checkout,
    'nights',   p_checkout::date - p_checkin::date,
    'guests',   jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
    'options',  v_optiuni);
end; $function$;