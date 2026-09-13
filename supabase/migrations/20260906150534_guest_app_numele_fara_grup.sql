-- Numele afisat in pagina oaspetelui: regula, scrisa ca doua cazuri, nu ca
-- o cascada de rezerve.
--
-- CE S-A SCHIMBAT. Inainte, campurile de ocupant al camerei aveau
-- intaietate mereu, iar numele clientului era ultima rezerva. La o
-- rezervare FARA GRUP asta e gresit: cine e trecut pe rezervare e chiar
-- cel care doarme in camera. In plus, campurile de ocupant se pot edita
-- doar din ecranul de grup, deci pe o rezervare fara grup ele nu se vad si
-- nu se pot corecta din aplicatie — un nume ramas acolo ar fi lipit pentru
-- totdeauna pe ecranul oaspetelui.
--
-- CU GRUP ramane exact cum era, si din acelasi motiv ca inainte: ocupantul
-- camerei, iar daca lipseste, eticheta grupului. NICIODATA titularul —
-- intr-un grup el e o persoana straina de camera asta, iar datele lui n-au
-- ce cauta pe ecranul altcuiva.
--
-- Verificat inainte de aplicare pe toate rezervarile din baza: niciuna
-- nu-si schimba numele afisat. Schimbarea inchide cazul, nu repara un
-- ecran gresit de azi.
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
    -- Fara grup: numele de pe rezervare e si al ocupantului.
    select nullif(trim(concat_ws(' ', gu.first_name, gu.last_name)), '') into v_nume
      from guests gu where gu.id = (v_p.rezervare).guest_id;
    v_nume := coalesce(v_nume, v_ocupant);
  else
    -- Cu grup: camera isi are ocupantul ei, altfel eticheta grupului.
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
      'children',  (v_p.rezervare).children
    ));
end $$;

-- Grantul se pastreaza: `create or replace` nu-l pierde, dar il rescriem ca
-- fisierul sa fie complet daca cineva ruleaza doar bucata asta.
revoke execute on function guest_stay_by_cod(text) from public, authenticated;
grant  execute on function guest_stay_by_cod(text) to anon, service_role;