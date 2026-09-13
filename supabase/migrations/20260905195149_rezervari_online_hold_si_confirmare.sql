-- ---------------------------------------------------------------------
-- REZERVARE TINUTA, NU OCUPATA
--
-- Pana acum o rezervare de pe site intra direct 'confirmed', deci ocupa
-- camera din prima secunda. Un script care trece de limite umple
-- calendarul, iar curatarea se face rand cu rand, de mana.
--
-- Mecanismul de mai jos foloseste ce exista deja in schema: statusul
-- 'pending' cu `hold_expires_at`, pe care allocate_group il ignora daca a
-- trecut. Rezervarea tine camera un timp limitat si devine ferma doar
-- dupa un pas pe care un bot nu-l poate face. Daca nu vine confirmarea,
-- holdul expira singur si camera se elibereaza fara interventie.
-- ---------------------------------------------------------------------

-- 1. Statusuri noi pe rezervarea online.
do $$
declare v_nume text;
begin
  select conname into v_nume from pg_constraint
   where conrelid = 'public_bookings'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%' limit 1;
  if v_nume is not null then
    execute format('alter table public_bookings drop constraint %I', v_nume);
  end if;
end $$;

alter table public_bookings
  add constraint public_bookings_status_check
  check (status in ('pending','confirmed','cancelled','expired'));

-- Cat tine camera pana la confirmare. NULL = rezervare ferma din prima
-- clipa, adica exact comportamentul de pana acum.
alter table public_bookings add column if not exists hold_expires_at timestamptz;

create index if not exists public_bookings_hold
  on public_bookings (hold_expires_at) where status = 'pending';


-- 2. Eliberarea holdurilor trecute.
--
-- Fara job separat: se apeleaza din functiile publice, care oricum sunt
-- singurele cai prin care se ajunge la aceste randuri. Nu e doar pentru
-- disponibilitate — acolo allocate_group ignora deja holdurile expirate —
-- ci si pentru calendarul din PMS, care altfel s-ar umple cu rezervari
-- moarte pe care le-ar vedea receptia.
create or replace function expira_rezervari_neconfirmate()
returns int language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  update public_bookings
     set status = 'expired'
   where status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at <= now();
  get diagnostics v_n = row_count;

  -- Rezervarile PMS ale acelor rezervari online, nu orice 'pending':
  -- receptia poate avea propriile rezervari in asteptare, care nu au
  -- nicio legatura cu site-ul.
  update reservations r
     set status = 'cancelled'
    from public_bookings b
   where r.id = any(b.reservation_ids)
     and b.status = 'expired'
     and r.status = 'pending';

  return v_n;
end;
$fn$;


-- 3. Confirmarea de catre client.
--
-- Idempotenta: un link deschis de doua ori nu e o eroare. Nu primeste
-- nimic in afara de token — nu se poate schimba nimic din rezervare pe
-- calea asta.
create or replace function confirm_public_booking(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_b public_bookings;
begin
  perform expira_rezervari_neconfirmate();

  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'confirmed' then
    return jsonb_build_object('success', true, 'repeat', true, 'status', 'confirmed',
      'confirmationNumber', v_b.confirmation_number);
  end if;
  if v_b.status = 'cancelled' then
    raise exception 'Rezervarea a fost anulată.' using errcode = 'P0003';
  end if;
  if v_b.status = 'expired' then
    -- Nu e o eroare tehnica, e un rezultat: interfata trebuie sa spuna
    -- omului ca poate relua cautarea.
    return jsonb_build_object('success', false, 'status', 'expired',
      'confirmationNumber', v_b.confirmation_number);
  end if;

  update reservations set status = 'confirmed', hold_expires_at = null
   where id = any(v_b.reservation_ids) and status = 'pending';

  update public_bookings set status = 'confirmed', hold_expires_at = null
   where id = v_b.id;

  return jsonb_build_object('success', true, 'status', 'confirmed',
    'confirmationNumber', v_b.confirmation_number);
end;
$fn$;

grant execute on function confirm_public_booking(text) to anon, authenticated, service_role;


-- 4. Crearea, cu hold optional.
--
-- Se sterge intai vechea semnatura: `create or replace` cu un parametru
-- in plus ar lasa doua functii, iar un apel cu argumentele vechi n-ar mai
-- putea alege intre ele.
drop function if exists create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text);

create function create_public_booking(
  p_idempotency_key uuid,
  p_checkin timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null,
  -- 0 = rezervare ferma pe loc, ca pana acum. >0 = camera e doar tinuta
  -- atatea minute, pana la confirmare.
  p_hold_minutes int default 0
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $fn$
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

  -- 1. IDEMPOTENTA
  if p_idempotency_key is null then
    raise exception 'Lipsește cheia de idempotență.';
  end if;
  select * into v_ex from public_bookings where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('success', true, 'repeat', true,
      'confirmationNumber', v_ex.confirmation_number,
      'publicToken', v_ex.public_token, 'status', v_ex.status,
      'holdExpiresAt', v_ex.hold_expires_at,
      'total', v_ex.total_amount, 'rooms', v_ex.rooms_count);
  end if;

  -- 2. VALIDARI
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

  -- 3. RATE-LIMIT, pe trei paliere. Vezi comentariul lung din schema.sql:
  --    telefonul se inventeaza, IP-ul se roteste, plafonul pe toata
  --    pensiunea nu se poate ocoli.
  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for',''),',',1),'');
  exception when others then v_ip := null; end;

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
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mai târziu.';
  end if;
  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 day') >= 30 then
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

  -- 4. SERIALIZARE. Tine pana la COMMIT.
  perform pg_advisory_xact_lock(hashtext('lalivada:booking'));

  -- Holdurile trecute se elibereaza INAINTE de a cauta camere, altfel o
  -- rezervare abandonata acum o ora ar bloca una reala.
  perform expira_rezervari_neconfirmate();

  -- 5. OASPETE: recunoscut dupa telefon, ca in restul PMS-ului
  select id into v_guest_id from guests
   where lower(phone) = lower(trim(p_phone)) limit 1;
  if v_guest_id is null then
    v_guest_id := 'g-' || encode(gen_random_bytes(6),'hex');
    insert into guests (id, last_name, first_name, phone, email, city, county, country)
    values (v_guest_id, trim(p_last_name), trim(p_first_name), trim(p_phone),
            nullif(trim(p_email),''), coalesce(nullif(trim(p_city),''),'-'),
            coalesce(nullif(trim(p_county),''),'-'),
            coalesce(nullif(trim(p_country),''),'România'));
  end if;

  -- 6. GRUP, doar la mai multe camere.
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
            -- Un hold trecut nu mai blocheaza. Expresia e IDENTICA cu cea
            -- din allocate_group intentionat: cautarea de disponibilitate
            -- si crearea trebuie sa raspunda la fel, altfel site-ul ofera
            -- o camera pe care functia asta o refuza.
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
                               status, hold_expires_at)
  values ('pb-' || encode(gen_random_bytes(6),'hex'), p_idempotency_key, v_nr,
          v_guest_id, v_group_id, v_res_ids, p_checkin, p_checkout,
          v_nr_camere, v_total, v_ip, v_status, v_hold)
  returning public_token into v_token;

  return jsonb_build_object('success', true, 'confirmationNumber', v_nr,
    'publicToken', v_token, 'status', v_status, 'holdExpiresAt', v_hold,
    'total', v_total, 'rooms', v_nr_camere);

exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă perioadă.'
      using errcode = 'P0002';
end;
$fn$;

grant execute on function create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int)
  to anon, authenticated, service_role;