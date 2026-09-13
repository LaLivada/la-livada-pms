-- Site-ul public de rezervari are nevoie ca available_rooms sa raspunda
-- vizitatorilor nelogati. Fiind `security invoker`, functia rula cu
-- drepturile apelantului: RLS ii bloca lui `anon` citirea din rooms si
-- reservations, deci intorcea lista goala — iar dupa revocarea
-- granturilor, eroare de permisiune. Adica era nefunctionala oricum.
--
-- `security definer` o face sa ruleze cu drepturile proprietarului, deci
-- poate citi tabelele. Ce se expune public ramane exact ce intoarce
-- semnatura ei: id-ul camerei, denumirea, tipul, capacitatea si pretul
-- total pe intervalul cerut. Niciun nume de oaspete, niciun telefon,
-- nicio rezervare — acelea raman inaccesibile prin RLS, care nu e atins.
--
-- Parametrii sunt tipati (timestamptz/int), deci nu exista suprafata de
-- injectie, iar search_path e deja fixat pe public.
--
-- Efect secundar acceptat, inerent oricarui site de rezervari: cineva
-- poate deduce gradul de ocupare interogand multe intervale.
create or replace function available_rooms(p_checkin timestamptz, p_checkout timestamptz, p_guests int default 1)
returns table (room_id text, room_name text, room_type text, capacity int, total numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.type, r.capacity, stay_total(r.id, p_checkin, p_checkout)
  from rooms r
  where r.active
    and r.capacity >= p_guests
    and not exists (
      select 1 from reservations res
      where res.room_id = r.id
        and res.status not in ('cancelled','noshow')
        and (res.status <> 'pending' or res.hold_expires_at > now())
        and tstzrange(res.checkin, res.checkout, '[)')
            && tstzrange(p_checkin, p_checkout, '[)')
    )
  order by r.sort_order, r.name;
$$;