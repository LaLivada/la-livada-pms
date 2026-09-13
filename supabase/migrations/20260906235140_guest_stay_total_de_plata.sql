-- Adauga totalul de plata in raspunsul paginii oaspetelui.
--
-- Aceeasi regula ca in src/lib/pricing.js: suprascrierea manuala bate pretul
-- inghetat la creare. Calculul live (al treilea nivel de acolo) nu are corespondent
-- aici si nici nu-i trebuie: PMS-ul completeaza booked_price la fiecare incarcare,
-- iar in baza nu exista nicio rezervare activa fara pret.
--
-- NULL cand lipsesc amandoua: pagina ascunde randul, nu arata 0 lei.
create or replace function guest_stay_by_cod(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p record;
  v_nume text;
  v_ocupant text;
  v_camera record;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  select r.name, r.type into v_camera from rooms r where r.id = (v_p.rezervare).room_id;

  v_ocupant := nullif(trim(concat_ws(' ',
    (v_p.rezervare).occupant_first_name, (v_p.rezervare).occupant_last_name)), '');

  if (v_p.rezervare).group_id is null then
    select nullif(trim(concat_ws(' ', gu.first_name, gu.last_name)), '') into v_nume
      from guests gu where gu.id = (v_p.rezervare).guest_id;
    -- Ocupantul ramane doar ca rezerva, pentru o rezervare fara client.
    v_nume := coalesce(v_nume, v_ocupant);
  else
    v_nume := v_ocupant;
    if v_nume is null then
      select nullif(trim(g.name), '') into v_nume
        from res_groups g where g.id = (v_p.rezervare).group_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'stay', jsonb_build_object(
      'guestName', v_nume,
      'roomName',  v_camera.name,
      'roomType',  v_camera.type,
      'checkIn',   (v_p.rezervare).checkin,
      'checkOut',  (v_p.rezervare).checkout,
      'nights',    greatest(1, ((v_p.rezervare).checkout::date - (v_p.rezervare).checkin::date)),
      'adults',    (v_p.rezervare).adults,
      'children',  (v_p.rezervare).children,
      'total',     coalesce((v_p.rezervare).price_override, (v_p.rezervare).booked_price)
    ));
end $$;