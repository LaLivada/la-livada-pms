-- Alocarea unui grup pe camere libere.
--
-- p_type null inseamna "orice tip" — varianta amestecata, folosita cand
-- grupul nu incape intr-un singur tip. Fara ea, maximul rezervabil ar fi
-- fost cel mai mare tip (31 locuri in 14 casute Tiny), nu toata pensiunea.
--
-- Intoarce fie o propunere completa, fie motivul pentru care nu se poate,
-- ca interfata sa poata spune omului ce anume sa schimbe.
create or replace function public.allocate_group(
  p_checkin timestamp with time zone,
  p_checkout timestamp with time zone,
  p_adults integer,
  p_children integer,
  p_type text default null)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_pers int := p_adults + p_children;
  v_nr int; v_ocupari int[]; v_tipuri text[]; v_id_pret text;
  v_adulti int[]; v_copii int[];
  v_i int; v_surplus int; v_pus boolean;
  v_rest_ad int; v_rest_cop int;
  v_camere jsonb := '[]'::jsonb;
  v_total numeric;
begin
  -- Camerele libere, cele mari intai: asa ies cele mai putine camere.
  with libere as (
    select r.id, r.type, r.capacity,
           row_number() over (order by r.capacity desc, r.type, r.sort_order) as rn
      from rooms r
     where r.active
       and (p_type is null or r.type = p_type)
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
         array_agg(type     order by rn) filter (where cap_cum - capacity < v_pers),
         min(id)            filter (where cap_cum - capacity < v_pers)
    into v_nr, v_ocupari, v_tipuri, v_id_pret
    from cumul;

  if v_nr is null then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;
  -- Fiecare camera are nevoie de cel putin un adult; altfel ar ramane
  -- copii singuri intr-o camera.
  if p_adults < v_nr then
    return jsonb_build_object('ok', false, 'reason', 'adulti', 'roomsNeeded', v_nr);
  end if;

  -- Camerele pornesc pline; scoatem surplusul din cele mai aglomerate, ca
  -- grupul sa fie repartizat echilibrat (4 persoane in doua camere de 3
  -- inseamna 2+2, nu 3+1).
  v_surplus := (select coalesce(sum(x), 0) from unnest(v_ocupari) x) - v_pers;
  while v_surplus > 0 loop
    select i into v_i from generate_subscripts(v_ocupari, 1) i
     where v_ocupari[i] > 1 order by v_ocupari[i] desc, i limit 1;
    exit when v_i is null;
    v_ocupari[v_i] := v_ocupari[v_i] - 1;
    v_surplus := v_surplus - 1;
  end loop;

  -- Repartizare pe rand, cate unul in fiecare camera: intai adultii, apoi
  -- copiii. Umplerea camera-cu-camera ar aduna adultii intr-una si ar lasa
  -- copiii cu unul singur in alta.
  v_adulti := array_fill(0, array[v_nr]);
  v_copii  := array_fill(0, array[v_nr]);
  for v_i in 1 .. v_nr loop v_adulti[v_i] := 1; end loop;
  v_rest_ad := p_adults - v_nr;
  v_rest_cop := p_children;

  while v_rest_ad > 0 loop
    v_pus := false;
    for v_i in 1 .. v_nr loop
      exit when v_rest_ad = 0;
      if v_adulti[v_i] + v_copii[v_i] < v_ocupari[v_i] then
        v_adulti[v_i] := v_adulti[v_i] + 1; v_rest_ad := v_rest_ad - 1; v_pus := true;
      end if;
    end loop;
    exit when not v_pus;
  end loop;

  while v_rest_cop > 0 loop
    v_pus := false;
    for v_i in 1 .. v_nr loop
      exit when v_rest_cop = 0;
      if v_adulti[v_i] + v_copii[v_i] < v_ocupari[v_i] then
        v_copii[v_i] := v_copii[v_i] + 1; v_rest_cop := v_rest_cop - 1; v_pus := true;
      end if;
    end loop;
    exit when not v_pus;
  end loop;

  for v_i in 1 .. v_nr loop
    v_camere := v_camere || jsonb_build_object(
      'roomType', v_tipuri[v_i], 'adults', v_adulti[v_i], 'children', v_copii[v_i]);
  end loop;

  -- Pretul depinde de tip, data si ocupare — nu de camera individuala.
  select coalesce(sum(stay_total(
           (select id from rooms where active and type = c->>'roomType' limit 1),
           p_checkin, p_checkout,
           (c->>'adults')::int, (c->>'children')::int, true)), 0)
    into v_total
    from jsonb_array_elements(v_camere) c;

  return jsonb_build_object(
    'ok', true,
    'roomType',    coalesce(p_type, 'mixt'),
    'roomsNeeded', v_nr,
    'rooms',       v_camere,
    'total',       v_total);
end; $function$;

revoke execute on function public.allocate_group(timestamptz, timestamptz, int, int, text) from public, anon;
grant  execute on function public.allocate_group(timestamptz, timestamptz, int, int, text) to authenticated, service_role;


-- Plafoanele fizice: tot ce exista, nu o limita aleasa de noi.
create or replace function public.public_capacity()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'maxPerRoom', coalesce(max(capacity), 0),
    'maxRooms',   count(*),
    'maxGuests',  coalesce(sum(capacity), 0)
  ) from rooms where active;
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
  v_ad   int := greatest(coalesce(p_adults, 2), 1);
  v_cop  int := greatest(coalesce(p_children, 0), 0);
  v_pers int;
  v_max_online int;
  v_tip text;
  v_rez jsonb;
  v_optiuni jsonb := '[]'::jsonb;
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
      'Pensiunea are %s locuri în total. Pentru grupuri mai mari, sună-ne.', v_max_online));
  end if;

  -- Intai fiecare tip pe rand: asa ramane alegerea intre Tiny house si Loft
  -- atunci cand grupul incape in oricare.
  for v_tip in select distinct type from rooms where active order by 1 loop
    v_rez := allocate_group(p_checkin, p_checkout, v_ad, v_cop, v_tip);
    if (v_rez->>'ok')::boolean then
      v_optiuni := v_optiuni || (v_rez - 'ok');
    elsif v_rez->>'reason' = 'adulti' then
      v_min_camere := least(coalesce(v_min_camere, (v_rez->>'roomsNeeded')::int),
                            (v_rez->>'roomsNeeded')::int);
    end if;
  end loop;

  -- Daca niciun tip singur nu incape grupul, incercam amestecat — altfel
  -- maximul rezervabil ar fi cel mai mare tip, nu toata pensiunea.
  if jsonb_array_length(v_optiuni) = 0 then
    v_rez := allocate_group(p_checkin, p_checkout, v_ad, v_cop, null);
    if (v_rez->>'ok')::boolean then
      v_optiuni := v_optiuni || (v_rez - 'ok');
    elsif v_rez->>'reason' = 'adulti' then
      v_min_camere := least(coalesce(v_min_camere, (v_rez->>'roomsNeeded')::int),
                            (v_rez->>'roomsNeeded')::int);
    end if;
  end if;

  if jsonb_array_length(v_optiuni) = 0 then
    return jsonb_build_object(
      'checkIn', p_checkin, 'checkOut', p_checkout,
      'nights',  p_checkout::date - p_checkin::date,
      'guests',  jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
      'options', v_optiuni,
      'error',
        case when v_min_camere is not null then format(
          'Pentru %s persoane sunt necesare %s camere, iar în fiecare trebuie să fie cel puțin un adult. Ai nevoie de cel puțin %s adulți sau de mai puține persoane.',
          v_pers, v_min_camere, v_min_camere)
        else 'Nu mai sunt camere libere pentru perioada și numărul de persoane alese.'
        end);
  end if;

  return jsonb_build_object(
    'checkIn',  p_checkin,
    'checkOut', p_checkout,
    'nights',   p_checkout::date - p_checkin::date,
    'guests',   jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
    'options',  v_optiuni);
end; $function$;