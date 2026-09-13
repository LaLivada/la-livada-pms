-- Anularea de catre client + suportul pentru emailul de confirmare.

alter table public_bookings add column email_sent_at timestamptz;
alter table public_bookings add column cancelled_at  timestamptz;

-- Fereastra de anulare. Nu exista plata in avans, deci putem fi generosi:
-- se poate anula oricand pana la ora sosirii. Dupa aceea, clientul trebuie
-- sa sune — o rezervare din ziua sosirii poate fi deja pregatita.
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
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    -- Interfata are nevoie sa stie daca mai poate arata butonul de
    -- anulare; regula reala e impusa oricum in cancel_public_booking.
    'canCancel', (b.status = 'confirmed' and b.checkin > now()),
    'cancelledAt', b.cancelled_at)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;


-- Anularea. NU sterge nimic: rezervarile trec pe 'cancelled', deci
-- camerele redevin libere (constrangerea de suprapunere le ignora), dar
-- istoricul ramane intact in PMS.
create or replace function cancel_public_booking(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'cancelled' then
    -- Idempotent: un al doilea click, sau un link deschis de doua ori,
    -- nu trebuie sa fie o eroare.
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

  return jsonb_build_object('success', true, 'status', 'cancelled',
    'confirmationNumber', v_b.confirmation_number);
end; $$;

revoke execute on function cancel_public_booking(text) from public;
grant  execute on function cancel_public_booking(text) to anon, authenticated, service_role;


-- Datele necesare emailului. Contine adresa de email a clientului, deci
-- NU e accesibila anonim: o apeleaza doar functia edge, cu service_role.
create or replace function booking_email_payload(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'publicToken', b.public_token,
    'email',     g.email,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    'checkIn',   b.checkin,
    'checkOut',  b.checkout,
    'nights',    b.checkout::date - b.checkin::date,
    'rooms',     b.rooms_count,
    'total',     b.total_amount,
    'status',    b.status,
    'alreadySent', b.email_sent_at is not null)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;

revoke execute on function booking_email_payload(text) from public, anon, authenticated;
grant  execute on function booking_email_payload(text) to service_role;


-- Marcheaza trimiterea, ca sa nu se poata cere acelasi email la nesfarsit.
create or replace function mark_booking_email_sent(p_token text)
returns void language sql volatile security definer set search_path = public as $$
  update public_bookings set email_sent_at = now() where public_token = p_token;
$$;

revoke execute on function mark_booking_email_sent(text) from public, anon, authenticated;
grant  execute on function mark_booking_email_sent(text) to service_role;