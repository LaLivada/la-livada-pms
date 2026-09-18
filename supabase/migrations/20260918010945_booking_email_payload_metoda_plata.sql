-- Fix (revizia finala, plata cu cardul): emailul de confirmare spunea
-- „Plata se face la sosire. Nu am reținut niciun card." si pentru
-- rezervarile achitate online cu cardul — netopia-ipn cheama exact aceeasi
-- functie booking-email ca la cash/transfer, iar sabloanele n-aveau de unde
-- sa afle metoda de plata. O intoarcem si pe ea in payload; sablonul HTML si
-- cel text aleg propozitia corecta.
--
-- Semnatura e IDENTICA (p_token text), deci `create or replace` inlocuieste
-- efectiv functia veche — fara al doilea obiect si fara sa se piarda
-- grantul pe service_role (ACL-ul supravietuieste unui replace).
create or replace function booking_email_payload(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'publicToken', b.public_token,
    'email', g.email,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    'checkIn', b.checkin, 'checkOut', b.checkout,
    'nights', b.checkout::date - b.checkin::date,
    'rooms', b.rooms_count, 'total', b.total_amount, 'status', b.status,
    'metodaPlata', b.metoda_plata,
    'alreadySent', b.email_sent_at is not null)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;