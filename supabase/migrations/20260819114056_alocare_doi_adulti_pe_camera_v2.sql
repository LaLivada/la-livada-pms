-- Alocarea unui grup pe camere libere.
--
-- STRATEGIA: cate DOI adulti pe camera, raspanditi pe cat mai multe camere.
-- Al treilea adult apare abia cand nu mai sunt camere — adica peste doua
-- ori numarul de camere libere. Al treilea loc e tinut pentru copii.
--
-- Nu e doar preferinta de confort, e si mai bine vandut: sase adulti in
-- trei camere de doi fac 900 lei/noapte, iar impachetati in doua camere de
-- trei doar 760. Suplimentul de adult (80) nu acopera niciodata tariful
-- unei camere in plus (300).
--
-- Alegerea camerelor:
--   · fara copii — intai cele mici, fiindca o camera de 2 e exact o pereche
--     de adulti, iar cele de 3 raman libere pentru familii;
--   · cu copii — intai cele mari, ca al treilea loc sa fie disponibil.
--
-- Restul regulilor:
--   · fiecare camera primeste cel putin un adult, altfel ar ramane copii
--     singuri intr-o camera;
--   · adultii si copiii se aseaza pe rand, cate unul in fiecare camera —
--     asa toate camerele ajung la doi adulti inainte ca vreuna sa primeasca
--     al treilea, si nu se aduna adultii intr-o camera si copiii in alta.
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
  v_cap_toate int[]; v_tip_toate text[];
  v_n_libere int; v_k_min int := null; v_cum int := 0;
  v_nr int; v_cap_alese int;
  v_adulti int[]; v_copii int[];
  v_i int; v_pus boolean;
  v_rest_ad int; v_rest_cop int;
  v_camere jsonb := '[]'::jsonb;
  v_total numeric;
begin
  if p_adults < 1 then
    return jsonb_build_object('ok', false, 'reason', 'adulti', 'roomsNeeded', 1);
  end if;

  select array_agg(capacity order by rn), array_agg(type order by rn), count(*)
    into v_cap_toate, v_tip_toate, v_n_libere
  from (
    select r.type, r.capacity,
           row_number() over (
             order by case when p_children > 0 then -r.capacity else r.capacity end,
                      r.type, r.sort_order) as rn
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
  ) l;

  if coalesce(v_n_libere, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;

  -- Cate camere sunt strict necesare ca sa incapa toata lumea.
  for v_i in 1 .. v_n_libere loop
    v_cum := v_cum + v_cap_toate[v_i];
    if v_cum >= v_pers then v_k_min := v_i; exit; end if;
  end loop;
  if v_k_min is null then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;

  -- Cate camere vindem: una la fiecare doi adulti, dar cel putin cat cere
  -- capacitatea, si niciodata mai multe decat camerele libere sau decat
  -- numarul de adulti.
  v_nr := greatest(ceil(p_adults / 2.0)::int, v_k_min);
  v_nr := least(v_nr, v_n_libere, p_adults);

  select coalesce(sum(v_cap_toate[i]), 0) into v_cap_alese
    from generate_series(1, v_nr) i;
  if v_cap_alese < v_pers then
    -- Locuri ar fi, dar nu si adulti cati camere ar trebui deschise.
    return jsonb_build_object('ok', false, 'reason', 'adulti', 'roomsNeeded', v_k_min);
  end if;

  v_adulti := array_fill(0, array[v_nr]);
  v_copii  := array_fill(0, array[v_nr]);
  v_rest_ad := p_adults;
  v_rest_cop := p_children;

  while v_rest_ad > 0 loop
    v_pus := false;
    for v_i in 1 .. v_nr loop
      exit when v_rest_ad = 0;
      if v_adulti[v_i] + v_copii[v_i] < v_cap_toate[v_i] then
        v_adulti[v_i] := v_adulti[v_i] + 1; v_rest_ad := v_rest_ad - 1; v_pus := true;
      end if;
    end loop;
    exit when not v_pus;
  end loop;

  while v_rest_cop > 0 loop
    v_pus := false;
    for v_i in 1 .. v_nr loop
      exit when v_rest_cop = 0;
      if v_adulti[v_i] + v_copii[v_i] < v_cap_toate[v_i] then
        v_copii[v_i] := v_copii[v_i] + 1; v_rest_cop := v_rest_cop - 1; v_pus := true;
      end if;
    end loop;
    exit when not v_pus;
  end loop;

  if v_rest_ad > 0 or v_rest_cop > 0 then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;

  for v_i in 1 .. v_nr loop
    v_camere := v_camere || jsonb_build_object(
      'roomType', v_tip_toate[v_i], 'adults', v_adulti[v_i], 'children', v_copii[v_i]);
  end loop;

  select coalesce(sum(stay_total(
           (select id from rooms where active and type = c->>'roomType' limit 1),
           p_checkin, p_checkout,
           (c->>'adults')::int, (c->>'children')::int, true)), 0)
    into v_total
    from jsonb_array_elements(v_camere) c;

  return jsonb_build_object(
    'ok', true, 'roomType', coalesce(p_type, 'mixt'),
    'roomsNeeded', v_nr, 'rooms', v_camere, 'total', v_total);
end; $function$;