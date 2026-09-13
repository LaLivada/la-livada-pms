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
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_guest_id    text;
  v_res_id      text;
  v_phone_key   text;
  v_ip          text;
  v_count_phone int;
  v_count_ip    int;
begin
  if coalesce(trim(p_last_name),'') = '' or coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nume, prenume și telefon sunt obligatorii.';
  end if;
  -- Validare de format — site-ul public nu trece prin PMS, deci nu are
  -- validarea din front-end (PhoneDialPicker); e nevoie de ea aici,
  -- înainte de orice scriere. Aceeași regulă generală ca la nivel de
  -- tabel (guests_format_contact), verificată devreme ca să iasă cu un
  -- mesaj clar, nu cu eroarea brută de constraint.
  if not (p_phone ~ '^[+]?[0-9 ()-]+$'
          and length(regexp_replace(p_phone, '[^0-9]', '', 'g')) between 6 and 15) then
    raise exception 'Numărul de telefon nu pare valid.';
  end if;
  if p_email is not null and trim(p_email) <> '' and p_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Adresa de email nu are un format valid.';
  end if;

  -- Telefonul e mereu disponibil (obligatoriu mai sus). IP-ul vine din
  -- X-Forwarded-For, expus de PostgREST prin GUC-ul request.headers; dacă
  -- acel GUC lipsește sau are alt format, IP-ul rămâne necunoscut și doar
  -- limita pe telefon se aplică — funcția nu eșuează din cauza asta.
  v_phone_key := lower(trim(p_phone));
  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for', ''
    ), ',', 1), '');
  exception when others then
    v_ip := null;
  end;

  -- Auto-curățare, fără job separat: volumul e mic la scara unei pensiuni.
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

  v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');

  insert into reservations (id, room_id, guest_id, checkin, checkout, status,
                            adults, children, source, notes, booked_price)
  values (v_res_id, p_room_id, v_guest_id, p_checkin, p_checkout, 'confirmed',
          greatest(coalesce(p_adults,2),1), greatest(coalesce(p_children,0),0),
          'site', nullif(trim(p_notes),''),
          stay_total(p_room_id, p_checkin, p_checkout,
                     greatest(coalesce(p_adults,2),1),
                     greatest(coalesce(p_children,0),0), true));

  return query select v_res_id, stay_total(p_room_id, p_checkin, p_checkout,
                                           greatest(coalesce(p_adults,2),1),
                                           greatest(coalesce(p_children,0),0), true);
exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă cameră sau altă perioadă.';
end;
$$;
