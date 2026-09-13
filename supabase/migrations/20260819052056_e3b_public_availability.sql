-- Ce vede site-ul public la cautarea de disponibilitate.
--
-- Agregat pe TIP de camera, nu pe camere individuale: site-ul vinde
-- "Tiny house", nu camera 1004. Alocarea camerei fizice o face serverul
-- la creare — clientul nu are ce face cu un room_id si nu trebuie sa-l
-- primeasca.
--
-- Filtrarea pe capacitate se face inainte de agregare, fiindca la aceeasi
-- proprietate capacitatea variaza IN INTERIORUL aceluiasi tip (unele
-- camere tiny au 2 locuri, altele 3). Fara asta, un grup de 3 persoane ar
-- vedea 14 camere disponibile si ar putea rezerva una de 2 locuri.
--
-- Nu expune: id-uri de camera, nume de oaspeti, rezervari, note interne.
create or replace function public_availability(
  p_checkin timestamptz, p_checkout timestamptz,
  p_adults int default 2, p_children int default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ad   int := greatest(coalesce(p_adults, 2), 1);
  v_cop  int := greatest(coalesce(p_children, 0), 0);
  v_pers int := v_ad + v_cop;
begin
  -- Limite: fereastra rezonabila de cautare, nu un instrument de scraping.
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
  if v_pers > 6 then
    return jsonb_build_object('error', 'Pentru grupuri mari, contactează recepția.');
  end if;

  return jsonb_build_object(
    'checkIn',  p_checkin,
    'checkOut', p_checkout,
    'nights',   p_checkout::date - p_checkin::date,
    'roomTypes', coalesce((
      select jsonb_agg(x order by x->>'roomType')
      from (
        select jsonb_build_object(
                 'roomType',  r.type,
                 'available', count(*),
                 'maxGuests', max(r.capacity),
                 -- pretul celei mai potrivite camere libere de acest tip
                 'price',     min(stay_total(r.id, p_checkin, p_checkout, v_ad, v_cop, true))
               ) as x
          from rooms r
         where r.active
           and r.capacity >= v_pers
           and not exists (
             select 1 from reservations res
              where res.room_id = r.id
                and res.status not in ('cancelled','noshow')
                and (res.status <> 'pending' or res.hold_expires_at > now())
                and tstzrange(res.checkin, res.checkout, '[)')
                    && tstzrange(p_checkin, p_checkout, '[)')
           )
         group by r.type
      ) s
    ), '[]'::jsonb)
  );
end; $$;

revoke execute on function public_availability(timestamptz, timestamptz, int, int) from public;
grant  execute on function public_availability(timestamptz, timestamptz, int, int) to anon, authenticated, service_role;