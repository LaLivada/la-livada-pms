-- Plata cu cardul prin NETOPIA (API v1, redirect complet — vezi
-- docs/netopia-plan.md). Cash și transfer bancar rămân neschimbate; doar
-- cardul capătă o stare de așteptare, între trimitere și IPN.

alter table public_bookings
  add column metoda_plata  text check (metoda_plata in ('cash','transfer','card')),
  add column plata_status  text check (plata_status in ('asteapta','platit','esuat')),
  add column netopia_ntp_id text,
  add column suma_platita  numeric;

comment on column public_bookings.metoda_plata is
  'Cum a ales oaspetele să plătească. NULL doar pentru rezervările vechi, de dinainte de această coloană.';
comment on column public_bookings.plata_status is
  'Doar pentru card: ''asteapta'' până la IPN, ''platit''/''esuat'' după. NULL pentru cash/transfer — nu se aplică.';

-- Auditul brut al notificărilor NETOPIA, scris ÎNAINTE de orice procesare —
-- același model ca access_audit / aiosell_webhook_log din planul Aiosell:
-- o plată reală nu se pierde niciodată, chiar dacă restul logicii eșuează.
create table netopia_ipn_log (
  id           bigint generated always as identity primary key,
  payload      text not null,
  rezultat     text not null default 'eroare' check (rezultat in ('ok','eroare')),
  public_token text,
  detaliu      text,
  created_at   timestamptz not null default now()
);
alter table netopia_ipn_log enable row level security;
-- RLS activat, fără politici: inaccesibil prin API pentru orice rol, la fel
-- ca public_bookings. Se scrie și se citește doar din netopia-ipn (service_role).

-- =====================================================================
-- create_public_booking — semnătură extinsă cu metoda de plată.
--
-- Doar ULTIMELE DOUĂ argumente sunt noi (cu valori implicite — nimic din
-- ce apelează funcția azi se schimbă fără să fie atins explicit). Restul
-- corpului e IDENTIC cu versiunea din schema.sql; se schimbă doar
-- INSERT-ul final, care acum scrie și cele două coloane noi, și
-- răspunsul idempotent, care acum le întoarce și pe ele.
-- =====================================================================
create or replace function create_public_booking(
  p_idempotency_key uuid,
  p_checkin timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null,
  p_hold_minutes int default 0,
  p_client_ip text default null,
  -- 'cash' | 'transfer' | 'card'. Card ține mereu hold >0 (vezi netopia-start) —
  -- nu se confirmă niciodată direct din funcția asta.
  p_metoda_plata text default 'cash',
  -- Doar pentru card: 'asteapta' la creare. NULL pentru cash/transfer.
  p_plata_status text default null
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
                              status, adults, children, source, notes, hold_expires_at)
    values (v_res_id, v_room_id, v_guest_id, v_group_id, p_checkin, p_checkout,
            v_status, v_ad, v_cop, 'site', nullif(trim(p_notes),''), v_hold)
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

-- =====================================================================
-- public_booking_by_token — acum expune și metoda/starea plății, ca
-- pagina de confirmare (reîncărcată după redirectul NETOPIA) să știe ce
-- text să arate, fără alt apel.
-- =====================================================================
create or replace function public_booking_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'status', b.status, 'checkIn', b.checkin, 'checkOut', b.checkout,
    'nights', b.checkout::date - b.checkin::date,
    'rooms', b.rooms_count, 'total', b.total_amount,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    'canCancel', (b.status = 'confirmed' and b.checkin > now()),
    'cancelledAt', b.cancelled_at,
    'metodaPlata', b.metoda_plata, 'plataStatus', b.plata_status)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;

-- =====================================================================
-- Suma primei nopți pentru o rezervare online — folosită doar ca să
-- calculăm cât se reține la anulare (politica: prima noapte integral).
-- Sumează nightly_rate pe fiecare cameră a grupului, la data sosirii —
-- consistent cu cum se calculează prețul peste tot (stay_total).
-- =====================================================================
create or replace function public_booking_first_night(p_id text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(
    nightly_rate(rm.type, (b.checkin at time zone 'Europe/Bucharest')::date, r.adults, r.children)
  ), 0)
  from public_bookings b
  join reservations r on r.id = any(b.reservation_ids)
  join rooms rm on rm.id = r.room_id
  where b.id = p_id;
$$;

-- =====================================================================
-- cancel_public_booking — neschimbată ca interfață (tot apelabilă direct
-- de `anon`), doar întoarce acum suma de rambursat când plata a fost cu
-- cardul. Rambursarea propriu-zisă rămâne manuală — vezi netopia-plan.md.
-- =====================================================================
create or replace function cancel_public_booking(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings; v_refund numeric := null;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'cancelled' then
    return jsonb_build_object('success', true, 'repeat', true,
      'status', 'cancelled', 'confirmationNumber', v_b.confirmation_number);
  end if;

  if v_b.checkin <= now() then
    raise exception 'Rezervarea nu mai poate fi anulată online — sună recepția.'
      using errcode = 'P0003';
  end if;

  update reservations
     set status = 'cancelled'
   where id = any(v_b.reservation_ids)
     and status not in ('checkedin','checkedout');

  update public_bookings
     set status = 'cancelled', cancelled_at = now()
   where id = v_b.id;

  if v_b.plata_status = 'platit' then
    v_refund := greatest(v_b.total_amount - public_booking_first_night(v_b.id), 0);
  end if;

  return jsonb_build_object('success', true, 'status', 'cancelled',
    'confirmationNumber', v_b.confirmation_number, 'refundSuggerat', v_refund);
end; $$;

-- =====================================================================
-- confirm_card_payment — chemată doar de netopia-ipn (service_role), la
-- succesul plății. Face ce face confirm_public_booking, plus scrie
-- datele plății. Idempotentă: un IPN dublu nu strică nimic.
--
-- CURSA cancel/IPN. Oaspetele poate anula ținerea (cancel_public_booking)
-- SAU camera poate expira (expira_rezervari_neconfirmate) chiar în
-- fereastra dintre „a plătit pe pagina NETOPIA” și „IPN-ul a ajuns la noi”.
-- Cardul a fost totuși taxat — banii sunt reali, chiar dacă rezervarea nu
-- mai există. De-asta scriem `plata_status='platit'` ȘI în aceste două
-- cazuri (fără să reînviem rezervarea): altfel booking_refund_payload n-ar
-- găsi niciodată nimic de rambursat, iar plata ar rămâne needetectată.
-- netopia-ipn răspunde la `already_paid_but` din răspuns trimițând avizul
-- de rambursare mai departe — vezi Task 4.
-- =====================================================================
create or replace function confirm_card_payment(p_token text, p_ntp_id text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'confirmed' then
    return jsonb_build_object('success', true, 'repeat', true, 'status', 'confirmed',
      'confirmationNumber', v_b.confirmation_number);
  end if;
  if v_b.status in ('cancelled', 'expired') then
    -- Rezervarea nu mai există, dar plata a reușit — consemnăm suma, ca să
    -- poată fi găsită de booking_refund_payload. Nu atingem reservations:
    -- camera rămâne eliberată, exact ce s-a întâmplat deja.
    if v_b.plata_status is distinct from 'platit' then
      update public_bookings
         set plata_status = 'platit', netopia_ntp_id = p_ntp_id, suma_platita = p_amount
       where id = v_b.id;
    end if;
    return jsonb_build_object('success', false, 'status', v_b.status,
      'confirmationNumber', v_b.confirmation_number, 'platitDupaAnulare', true);
  end if;

  update reservations set status = 'confirmed', hold_expires_at = null
   where id = any(v_b.reservation_ids) and status = 'pending';

  update public_bookings
     set status = 'confirmed', hold_expires_at = null,
         plata_status = 'platit', netopia_ntp_id = p_ntp_id, suma_platita = p_amount
   where id = v_b.id;

  return jsonb_build_object('success', true, 'status', 'confirmed',
    'confirmationNumber', v_b.confirmation_number);
end; $$;

-- =====================================================================
-- mark_card_payment_failed — la refuz/anulare pe partea NETOPIA. Camera
-- rămâne ținută până expiră singură (expira_rezervari_neconfirmate) —
-- oaspetele poate reîncerca plata din aceeași pagină de confirmare.
-- =====================================================================
create or replace function mark_card_payment_failed(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;
  if v_b.status = 'pending' then
    update public_bookings set plata_status = 'esuat' where id = v_b.id;
  end if;
  return jsonb_build_object('success', true, 'status', v_b.status);
end; $$;

-- =====================================================================
-- booking_refund_payload — datele pentru emailul intern de rambursare.
-- Doar service_role (netopia-refund-notice), la fel ca booking_email_payload:
-- conține adresa clientului.
-- Întoarce NULL dacă rezervarea nu e într-o stare cu ceva de rambursat —
-- funcția care o cheamă tratează asta ca „nimic de făcut”, nu ca eroare.
--
-- SUMA DE RAMBURSAT depinde de CINE a pierdut camera:
--   · 'cancelled' — anulare cerută (de oaspete sau de recepție): se aplică
--     politica publicată, prima noapte se reține integral;
--   · 'expired' — plata a reușit DUPĂ ce holdul expirase deja (cursa
--     descrisă la confirm_card_payment); oaspetele nu a ales nimic, a
--     plătit o cameră care s-a eliberat singură fără vina lui — se
--     rambursează tot.
-- =====================================================================
create or replace function booking_refund_payload(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_b public_bookings; v_email text; v_nume text; v_refund numeric;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found or v_b.status not in ('cancelled', 'expired') or v_b.plata_status <> 'platit' then
    return null;
  end if;

  v_refund := case
    when v_b.status = 'expired' then v_b.total_amount
    else greatest(v_b.total_amount - public_booking_first_night(v_b.id), 0)
  end;

  select g.email, trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,''))
    into v_email, v_nume
    from guests g where g.id = v_b.guest_id;

  return jsonb_build_object(
    'email', v_email, 'guestName', v_nume,
    'confirmationNumber', v_b.confirmation_number, 'status', v_b.status,
    'netopiaNtpId', v_b.netopia_ntp_id, 'sumaPlatita', v_b.suma_platita,
    'refundSuggerat', v_refund, 'cancelledAt', v_b.cancelled_at);
end; $$;

-- =====================================================================
-- PERMISIUNI. La fel ca restul funcțiilor din suprafața publică:
-- interfața cu care lucrează oaspetele rămâne pe anon; tot ce citește
-- date personale sau scrie stare de plată rămâne strict pe service_role.
-- Revocarea e de la PUBLIC, nu doar de la anon — vezi comentariul din
-- schema.sql de la expira_rezervari_neconfirmate (default privileges dau
-- EXECUTE direct fiecărui rol).
-- =====================================================================
revoke execute on function confirm_card_payment(text, text, numeric) from public, anon, authenticated;
grant  execute on function confirm_card_payment(text, text, numeric) to service_role;

revoke execute on function mark_card_payment_failed(text) from public, anon, authenticated;
grant  execute on function mark_card_payment_failed(text) to service_role;

revoke execute on function booking_refund_payload(text) from public, anon, authenticated;
grant  execute on function booking_refund_payload(text) to service_role;

revoke execute on function public_booking_first_night(text) from public, anon, authenticated;
-- Fără grant explicit: e chemată doar dinăuntrul altor funcții security
-- definer (cancel_public_booking, booking_refund_payload), care rulează
-- ca proprietar — la fel ca expira_rezervari_neconfirmate.

-- Corectare: `create or replace function` cu o lista de argumente diferita
-- de a functiei vechi nu o inlocuieste -- creeaza un obiect nou, distinct,
-- care intra sub ALTER DEFAULT PRIVILEGES si primeste EXECUTE direct pentru
-- public, anon si authenticated (exact capcana descrisa deja in
-- create_public_booking_doar_prin_functia_edge, repetata aici cu cele doua
-- argumente noi). Functia veche, cu 14 argumente, ramanea si ea alaturi --
-- la fel ca in 20260905195820_create_public_booking_primeste_ip_ul_clientului
-- -- iar apelul din booking-create (14 argumente numite) ar fi nimerit-o pe
-- ea, fara metoda de plata, pana la actualizarea functiei edge.
revoke execute on function create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int, text, text, text)
  from public, anon, authenticated;
grant  execute on function create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int, text, text, text)
  to service_role;

drop function if exists create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int, text);