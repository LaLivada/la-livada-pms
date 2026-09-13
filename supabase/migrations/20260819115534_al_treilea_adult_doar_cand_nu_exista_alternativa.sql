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
  v_max_camere_tip int := 0;
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

  for v_tip in select distinct type from rooms where active order by 1 loop
    v_rez := allocate_group(p_checkin, p_checkout, v_ad, v_cop, v_tip);
    if (v_rez->>'ok')::boolean then
      v_optiuni := v_optiuni || (v_rez - 'ok');
      v_max_camere_tip := greatest(v_max_camere_tip, (v_rez->>'roomsNeeded')::int);
    elsif v_rez->>'reason' = 'adulti' then
      v_min_camere := least(coalesce(v_min_camere, (v_rez->>'roomsNeeded')::int),
                            (v_rez->>'roomsNeeded')::int);
    end if;
  end loop;

  -- Varianta amestecata se ofera cand niciun tip singur nu incape grupul,
  -- sau cand deschide mai multe camere decat oricare tip separat. A doua
  -- conteaza pentru grupuri mari: peste 28 de adulti, cele 14 casute Tiny
  -- ar trebui sa primeasca al treilea adult, in timp ce toate cele 16
  -- camere ii tin cate doi.
  v_rez := allocate_group(p_checkin, p_checkout, v_ad, v_cop, null);
  if (v_rez->>'ok')::boolean
     and (jsonb_array_length(v_optiuni) = 0
          or (v_rez->>'roomsNeeded')::int > v_max_camere_tip) then
    v_optiuni := v_optiuni || (v_rez - 'ok');
  elsif not (v_rez->>'ok')::boolean and v_rez->>'reason' = 'adulti'
        and jsonb_array_length(v_optiuni) = 0 then
    v_min_camere := least(coalesce(v_min_camere, (v_rez->>'roomsNeeded')::int),
                          (v_rez->>'roomsNeeded')::int);
  end if;

  -- Daca vreo varianta reuseste cu cel mult doi adulti pe camera, le scoatem
  -- pe cele care ar pune un al treilea. Altfel varianta inghesuita ar sta
  -- alaturi, mai ieftina, si ar fi aleasa tocmai fiindca e mai ieftina —
  -- adica exact ce nu vrem. Al treilea adult e ultima solutie, nu o
  -- alternativa.
  if exists (
    select 1 from jsonb_array_elements(v_optiuni) o
     where (select max((x->>'adults')::int) from jsonb_array_elements(o->'rooms') x) <= 2)
  then
    select coalesce(jsonb_agg(o), '[]'::jsonb) into v_optiuni
      from jsonb_array_elements(v_optiuni) o
     where (select max((x->>'adults')::int) from jsonb_array_elements(o->'rooms') x) <= 2;
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