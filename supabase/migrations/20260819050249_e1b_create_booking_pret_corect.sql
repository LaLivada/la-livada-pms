-- Completarea etapei 1 pe calea reala de rezervare.
--
-- Doua probleme, ambele legate de pret:
--
-- 1. create_booking apela stay_total cu 3 argumente, deci ocuparea cadea
--    pe valorile implicite (2 adulti, 0 copii) si ajustarea online nu se
--    aplica. Adica exact divergenta reparata mai devreme, doar mutata.
--
-- 2. Nu scria booked_price. Rezervarea intra cu pret NULL, iar PMS-ul il
--    completa la urmatoarea incarcare cu propriul calcul. Chiar si acum,
--    cu formulele identice, pretul trebuie inghetat la creare: altfel o
--    modificare de tarife intre rezervare si sosire ar rescrie retroactiv
--    suma pe care clientul a acceptat-o.
create or replace function create_booking(
  p_room_id     text,
  p_checkin     timestamptz,
  p_checkout    timestamptz,
  p_last_name   text,
  p_first_name  text,
  p_phone       text,
  p_email       text,
  p_city        text,
  p_county      text,
  p_country     text,
  p_adults      int default 2,
  p_children    int default 0,
  p_notes       text default null
) returns table (reservation_id text, total numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_guest_id    text;
  v_res_id      text;
  v_phone_key   text;
  v_ip          text;
  v_count_phone int;
  v_count_ip    int;
  v_adults      int := greatest(coalesce(p_adults, 2), 1);
  v_children    int := greatest(coalesce(p_children, 0), 0);
  v_total       numeric;
begin
  if coalesce(trim(p_last_name),'') = '' or coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nume, prenume și telefon sunt obligatorii.';
  end if;

  v_phone_key := lower(trim(p_phone));
  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for', ''
    ), ',', 1), '');
  exception when others then
    v_ip := null;
  end;

  delete from booking_attempts where created_at < now() - interval '1 day';

  select count(*) into v_count_phone from booking_attempts
    where fingerprint = 'phone:' || v_phone_key and created_at > now() - interval '1 hour';
  if v_count_phone >= 5 then
    raise exception 'Prea multe cereri de rezervare cu acest număr de telefon. Sună recepția pentru asistență.';
  end if;

  if v_ip is not null then
    select count(*) into v_count_ip from booking_attempts
      where fingerprint = 'ip:' || v_ip and created_at > now() - interval '1 hour';
    if v_count_ip >= 20 then
      raise exception 'Prea multe cereri de rezervare de la această adresă. Încearcă mai târziu sau sună recepția.';
    end if;
  end if;

  insert into booking_attempts (fingerprint) values ('phone:' || v_phone_key);
  if v_ip is not null then
    insert into booking_attempts (fingerprint) values ('ip:' || v_ip);
  end if;

  if p_checkout <= p_checkin then
    raise exception 'Data de plecare trebuie să fie după data sosirii.';
  end if;
  if p_checkin < now() - interval '1 day' then
    raise exception 'Nu se pot face rezervări în trecut.';
  end if;

  select id into v_guest_id from guests
   where lower(phone) = v_phone_key limit 1;

  if v_guest_id is null then
    v_guest_id := 'g-' || encode(gen_random_bytes(6),'hex');
    insert into guests (id, last_name, first_name, phone, email, city, county, country)
    values (v_guest_id, trim(p_last_name), trim(p_first_name), trim(p_phone),
            nullif(trim(p_email),''), trim(p_city), trim(p_county), trim(p_country));
  end if;

  -- Pretul, cu ocuparea reala si ajustarea pentru site. Calculat inainte
  -- de insert, ca sa fie si inghetat in rand, si intors clientului —
  -- aceeasi valoare in ambele locuri, prin constructie.
  v_total := stay_total(p_room_id, p_checkin, p_checkout, v_adults, v_children, true);

  v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');

  insert into reservations (id, room_id, guest_id, checkin, checkout, status,
                            adults, children, source, notes, booked_price)
  values (v_res_id, p_room_id, v_guest_id, p_checkin, p_checkout, 'confirmed',
          v_adults, v_children, 'site', nullif(trim(p_notes),''), v_total);

  return query select v_res_id, v_total;
exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă cameră sau altă perioadă.';
end;
$$;