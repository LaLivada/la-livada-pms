-- Crearea unei rezervari de pe site. O singura tranzactie: ori se creeaza
-- tot, ori nimic.
--
-- Ordinea pasilor nu e arbitrara:
--   · idempotenta e PRIMA, ca un retry legitim sa nu consume din rate-limit;
--   · lock-ul vine inainte de alocare, ca doua cereri sa nu vada aceeasi
--     camera libera;
--   · pretul NU se calculeaza aici — il pune triggerul pret_server_rezervare
--     la insert, si il citim inapoi cu RETURNING. Asa exista o singura
--     formula, nu doua care pot diverge.
create or replace function create_public_booking(
  p_idempotency_key uuid,
  p_checkin  timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ex        public_bookings;
  v_cerere    jsonb;
  v_tip       text;   v_ad int;  v_cop int;
  v_room_id   text;   v_guest_id text;  v_group_id text := null;
  v_res_ids   text[] := '{}';   v_total numeric := 0;  v_pret numeric;
  v_nr        text;   v_res_id text;   v_ip text;  v_token text;
  v_nr_camere int := coalesce(jsonb_array_length(p_rooms), 0);
begin
  -- 1. IDEMPOTENTA
  if p_idempotency_key is null then
    raise exception 'Lipsește cheia de idempotență.';
  end if;
  select * into v_ex from public_bookings where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('success', true, 'repeat', true,
      'confirmationNumber', v_ex.confirmation_number,
      'publicToken', v_ex.public_token, 'status', v_ex.status,
      'total', v_ex.total_amount, 'rooms', v_ex.rooms_count);
  end if;

  -- 2. VALIDARI
  if v_nr_camere < 1 or v_nr_camere > 5 then
    raise exception 'Se pot rezerva între 1 și 5 camere odată.';
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

  -- 3. RATE-LIMIT
  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for',''),',',1),'');
  exception when others then v_ip := null; end;

  delete from booking_attempts where created_at < now() - interval '1 day';
  if (select count(*) from booking_attempts
       where fingerprint = 'phone:' || lower(trim(p_phone))
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Prea multe cereri cu acest număr de telefon. Sună recepția.';
  end if;
  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mai târziu.';
  end if;
  insert into booking_attempts (fingerprint) values ('phone:' || lower(trim(p_phone)));
  if v_ip is not null then
    insert into booking_attempts (fingerprint) values ('ip:' || v_ip);
  end if;

  -- 4. SERIALIZARE. Tine pana la COMMIT. La 16 camere costul e neglijabil,
  --    iar alternativa (reincercare la exclusion_violation) ar complica
  --    alocarea multi-camera fara castig real.
  perform pg_advisory_xact_lock(hashtext('lalivada:booking'));

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

  -- 6. GRUP, doar la mai multe camere. Numele vine din campul "Nume" al
  --    formularului — nu se ghiceste din despicarea unui string.
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

    -- Camera cea mai potrivita, nu cea mai mare: ordonarea dupa capacitate
    -- evita risipa unei camere de 3 locuri pentru doua persoane.
    select r.id into v_room_id
      from rooms r
     where r.active and r.type = v_tip and r.capacity >= v_ad + v_cop
       and not exists (
         select 1 from reservations res
          where res.room_id = r.id
            and res.status not in ('cancelled','noshow')
            and tstzrange(res.checkin, res.checkout, '[)')
                && tstzrange(p_checkin, p_checkout, '[)')
       )
     order by r.capacity, r.sort_order
     limit 1;

    if v_room_id is null then
      -- Anuleaza TOT: grupul, oaspetele nou, camerele deja alocate.
      raise exception 'Nu mai sunt camere disponibile pentru perioada aleasă.'
        using errcode = 'P0002';
    end if;

    v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');
    insert into reservations (id, room_id, guest_id, group_id, checkin, checkout,
                              status, adults, children, source, notes)
    values (v_res_id, v_room_id, v_guest_id, v_group_id, p_checkin, p_checkout,
            'confirmed', v_ad, v_cop, 'site', nullif(trim(p_notes),''))
    returning booked_price into v_pret;   -- pretul pus de trigger

    v_total   := v_total + coalesce(v_pret, 0);
    v_res_ids := v_res_ids || v_res_id;
  end loop;

  -- 8. CONFIRMARE
  v_nr := next_confirmation_number();
  insert into public_bookings (id, idempotency_key, confirmation_number, guest_id,
                               group_id, reservation_ids, checkin, checkout,
                               rooms_count, total_amount, request_ip)
  values ('pb-' || encode(gen_random_bytes(6),'hex'), p_idempotency_key, v_nr,
          v_guest_id, v_group_id, v_res_ids, p_checkin, p_checkout,
          v_nr_camere, v_total, v_ip)
  returning public_token into v_token;

  return jsonb_build_object('success', true, 'confirmationNumber', v_nr,
    'publicToken', v_token, 'status', 'confirmed',
    'total', v_total, 'rooms', v_nr_camere);

exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă perioadă.'
      using errcode = 'P0002';
end; $$;

revoke execute on function create_public_booking(uuid,timestamptz,timestamptz,text,text,
  text,text,text,text,text,jsonb,text) from public;
grant  execute on function create_public_booking(uuid,timestamptz,timestamptz,text,text,
  text,text,text,text,text,jsonb,text) to anon, authenticated, service_role;


-- Pagina de confirmare. Tokenul e singura cheie; id-urile interne nu apar
-- niciodata in URL si nu se pot enumera.
create or replace function public_booking_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'status',   b.status,
    'checkIn',  b.checkin,
    'checkOut', b.checkout,
    'nights',   b.checkout::date - b.checkin::date,
    'rooms',    b.rooms_count,
    'total',    b.total_amount,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')))
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;

revoke execute on function public_booking_by_token(text) from public;
grant  execute on function public_booking_by_token(text) to anon, authenticated, service_role;


-- Un singur drum public de scriere. create_booking (o camera) e complet
-- acoperita de create_public_booking (array de o camera), iar doua
-- endpointuri publice care creeaza rezervari inseamna doua locuri unde se
-- poate strecura o regula diferita. Ramane definita, dar nu mai e
-- apelabila din exterior.
revoke execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) from anon;