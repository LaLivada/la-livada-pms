-- create_public_booking — semnatura NESCHIMBATA (17 argumente): doar
-- normalizarea telefonului scris pe clientul de facturare, cand exista
-- facturare pe societate.
--
-- `p_phone` vine deja in format international ("+40 722899899" — vezi
-- telefonInternational din booking). Ecranul "Editeaza client de
-- facturare" din PMS nu are selector de prefix — un "0" la inceput e
-- numarul local normal, iar `validatePhone` de-acolo respinge orice "+"
-- ca litera nepermisa. Gasit direct pe o firma reala: telefonul venea cu
-- "+40 " in fata si bloca salvarea clientului de facturare, cu eroarea
-- de format, chiar daca restul campurilor erau corecte.
create or replace function create_public_booking(
  p_idempotency_key uuid,
  p_checkin timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null,
  p_hold_minutes int default 0,
  p_client_ip text default null,
  p_metoda_plata text default 'cash',
  p_plata_status text default null,
  p_firma jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ex        public_bookings;
  v_cerere    jsonb;
  v_tip       text;   v_ad int;  v_cop int;
  v_room_id   text;   v_guest_id text;  v_group_id text := null;
  v_res_ids   text[] := '{}';   v_total numeric := 0;  v_pret numeric;
  v_nr        text;   v_res_id text;   v_ip text;  v_token text;
  v_nr_camere int := coalesce(jsonb_array_length(p_rooms), 0);
  v_hold      timestamptz := null;
  v_status    text := 'confirmed';
  v_billing_id text := null;
  v_billing_phone text;
  v_are_firma  boolean := p_firma is not null and coalesce(trim(p_firma->>'denumire'), '') <> '';
begin
  if coalesce(p_hold_minutes, 0) > 0 then
    v_hold   := now() + make_interval(mins => p_hold_minutes);
    v_status := 'pending';
  end if;

  -- 1. IDEMPOTENȚĂ
  if p_idempotency_key is null then
    raise exception 'Lipsește cheia de idempotență.';
  end if;
  select * into v_ex from public_bookings where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('success', true, 'repeat', true,
      'confirmationNumber', v_ex.confirmation_number,
      'publicToken', v_ex.public_token, 'status', v_ex.status,
      'holdExpiresAt', v_ex.hold_expires_at,
      'total', v_ex.total_amount, 'rooms', v_ex.rooms_count,
      'metodaPlata', v_ex.metoda_plata, 'plataStatus', v_ex.plata_status);
  end if;

  -- 2. VALIDĂRI ȘI LIMITE
  if v_nr_camere < 1 or v_nr_camere > (select count(*) from rooms where active) then
    raise exception 'Se pot rezerva între 1 și % camere odată.', (select count(*) from rooms where active);
  end if;
  if p_checkout <= p_checkin then
    raise exception 'Data de plecare trebuie să fie după data sosirii.';
  end if;
  if p_checkout::date - p_checkin::date > 30 then
    raise exception 'Sejurul nu poate depăși 30 de nopți.';
  end if;
  if p_checkin < now() - interval '1 day' then
    raise exception 'Nu se pot face rezervări în trecut.';
  end if;
  if coalesce(trim(p_last_name),'') = '' or coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nume, prenume și telefon sunt obligatorii.';
  end if;
  if p_email is not null and trim(p_email) <> ''
     and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresa de email nu este validă.';
  end if;
  if coalesce(p_hold_minutes, 0) > 0 and coalesce(trim(p_email),'') = '' then
    raise exception 'Emailul e obligatoriu pentru rezervarea online.';
  end if;
  if v_are_firma and (
       coalesce(trim(p_firma->>'cui'), '') = ''
    or coalesce(trim(p_firma->>'adresa'), '') = ''
    or coalesce(trim(p_firma->>'oras'), '') = ''
    or coalesce(trim(p_firma->>'judet'), '') = ''
  ) then
    raise exception 'Pentru facturare pe societate sunt necesare denumirea, CUI-ul, adresa, orașul și județul firmei.';
  end if;

  -- 3. RATE-LIMIT, pe trei paliere.
  v_ip := nullif(trim(coalesce(p_client_ip, '')), '');
  if v_ip is null then
    begin
      v_ip := ip_client();
    exception when others then v_ip := null; end;
  end if;

  delete from booking_attempts where created_at < now() - interval '2 days';

  if (select count(*) from booking_attempts
       where fingerprint = 'phone:' || lower(trim(p_phone))
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Prea multe cereri cu acest număr de telefon. Sună recepția.';
  end if;
  if (select count(*) from booking_attempts
       where fingerprint = 'phone:' || lower(trim(p_phone))
         and created_at > now() - interval '1 day') >= 8 then
    raise exception 'Prea multe rezervări cu acest număr de telefon astăzi. Sună recepția.';
  end if;

  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mai târziu.';
  end if;
  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 day') >= 12 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mâine sau sună recepția.';
  end if;

  if (select count(*) from booking_attempts
       where fingerprint = 'toate'
         and created_at > now() - interval '1 day') >= 25 then
    raise exception 'Rezervările online sunt oprite temporar. Sună recepția și îți facem rezervarea pe loc.';
  end if;

  insert into booking_attempts (fingerprint) values ('phone:' || lower(trim(p_phone)));
  if v_ip is not null then
    insert into booking_attempts (fingerprint) values ('ip:' || v_ip);
  end if;
  insert into booking_attempts (fingerprint) values ('toate');

  -- 4. SERIALIZARE.
  perform pg_advisory_xact_lock(hashtext('lalivada:booking'));
  perform expira_rezervari_neconfirmate();

  -- 5. OASPETE
  select id into v_guest_id from guests
   where lower(phone) = lower(trim(p_phone))
     and lower(coalesce(last_name,'')) = lower(trim(p_last_name))
   limit 1;
  if v_guest_id is null then
    v_guest_id := 'g-' || encode(gen_random_bytes(6),'hex');
    insert into guests (id, last_name, first_name, phone, email, city, county, country)
    values (v_guest_id, trim(p_last_name), trim(p_first_name), trim(p_phone),
            nullif(trim(p_email),''), coalesce(nullif(trim(p_city),''),'-'),
            coalesce(nullif(trim(p_county),''),'-'),
            coalesce(nullif(trim(p_country),''),'România'));
  end if;

  -- 5b. CLIENT DE FACTURARE (firmă) — o singură dată per cerere, nu per
  -- cameră: o firmă poate plăti pentru tot grupul deodată.
  --
  -- `p_phone` vine deja în format internațional („+40 722899899" —
  -- vezi telefonInternational din booking). Ecranul „Editează client de
  -- facturare" din PMS nu are selector de prefix — un „0" la început e
  -- numărul local normal, iar `validatePhone` de-acolo respinge orice
  -- „+" ca literă nepermisă. Găsit direct pe o firmă reală: telefonul
  -- venea cu „+40 " în față și bloca salvarea clientului de facturare,
  -- cu eroarea de format, chiar dacă restul câmpurilor erau corecte.
  if v_are_firma then
    v_billing_id := 'bc-' || encode(gen_random_bytes(6),'hex');
    v_billing_phone := case
      when trim(p_phone) ~ '^\+40\s'
        then '0' || substring(trim(p_phone) from 5)
      else regexp_replace(trim(p_phone), '^\+', '')
    end;
    insert into billing_customers (id, kind, company_name, cui, reg_com, contact_name,
                                   address, city, county, country, email, phone, guest_id)
    values (v_billing_id, 'company', trim(p_firma->>'denumire'), trim(p_firma->>'cui'),
            nullif(trim(p_firma->>'regCom'), ''), trim(p_first_name || ' ' || p_last_name),
            trim(p_firma->>'adresa'), trim(p_firma->>'oras'), trim(p_firma->>'judet'),
            'România', nullif(trim(p_email),''), nullif(v_billing_phone, ''), v_guest_id);
  end if;

  -- 6. GRUP
  if v_nr_camere > 1 then
    v_group_id := 'gr-' || encode(gen_random_bytes(6),'hex');
    insert into res_groups (id, name, main_guest_id, notes)
    values (v_group_id, 'Rezervare ' || trim(p_last_name), v_guest_id,
            'Rezervare de pe site');
  end if;

  -- 7. ALOCARE + INSERT
  for v_cerere in select * from jsonb_array_elements(p_rooms) loop
    v_tip := v_cerere->>'roomType';
    v_ad  := greatest(coalesce((v_cerere->>'adults')::int, 2), 1);
    v_cop := greatest(coalesce((v_cerere->>'children')::int, 0), 0);

    if v_tip is null or v_tip not in ('tiny','loft') then
      raise exception 'Tip de cameră necunoscut: %.', coalesce(v_tip,'(lipsă)');
    end if;
    if v_ad + v_cop > 6 then
      raise exception 'Prea multe persoane într-o cameră.';
    end if;

    select r.id into v_room_id
      from rooms r
     where r.active and r.type = v_tip and r.capacity >= v_ad + v_cop
       and not exists (
         select 1 from reservations res
          where res.room_id = r.id
            and res.status not in ('cancelled','noshow')
            and (res.status <> 'pending' or res.hold_expires_at > now())
            and tstzrange(res.checkin, res.checkout, '[)')
                && tstzrange(p_checkin, p_checkout, '[)')
       )
     order by r.capacity, r.sort_order
     limit 1;

    if v_room_id is null then
      raise exception 'Nu mai sunt camere disponibile pentru perioada aleasă.'
        using errcode = 'P0002';
    end if;

    v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');
    insert into reservations (id, room_id, guest_id, group_id, checkin, checkout,
                              status, adults, children, source, notes, hold_expires_at,
                              billing_customer_id)
    values (v_res_id, v_room_id, v_guest_id, v_group_id, p_checkin, p_checkout,
            v_status, v_ad, v_cop, 'site', nullif(trim(p_notes),''), v_hold,
            v_billing_id)
    returning booked_price into v_pret;

    v_total   := v_total + coalesce(v_pret, 0);
    v_res_ids := v_res_ids || v_res_id;
  end loop;

  -- 8. CONFIRMARE
  v_nr := next_confirmation_number();
  insert into public_bookings (id, idempotency_key, confirmation_number, guest_id,
                               group_id, reservation_ids, checkin, checkout,
                               rooms_count, total_amount, request_ip,
                               status, hold_expires_at, metoda_plata, plata_status)
  values ('pb-' || encode(gen_random_bytes(6),'hex'), p_idempotency_key, v_nr,
          v_guest_id, v_group_id, v_res_ids, p_checkin, p_checkout,
          v_nr_camere, v_total, v_ip, v_status, v_hold,
          coalesce(p_metoda_plata, 'cash'), p_plata_status)
  returning public_token into v_token;

  return jsonb_build_object('success', true, 'confirmationNumber', v_nr,
    'publicToken', v_token, 'status', v_status, 'holdExpiresAt', v_hold,
    'total', v_total, 'rooms', v_nr_camere,
    'metodaPlata', coalesce(p_metoda_plata, 'cash'), 'plataStatus', p_plata_status);

exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă perioadă.'
      using errcode = 'P0002';
end; $$;
