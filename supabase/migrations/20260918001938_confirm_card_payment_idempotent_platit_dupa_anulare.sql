-- Fix (review Task 4, finding 2): confirm_card_payment întorcea necondiționat
-- platitDupaAnulare=true pe ramura cancelled/expired, la fiecare apel — inclusiv
-- la un IPN dublu pentru o plată deja consemnată. netopia-ipn reacționează la
-- acest flag trimițând avizul intern de rambursare (netopia-refund-notice),
-- deci un IPN dublu retrimitea avizul de fiecare dată. Acum flagul e true doar
-- prima dată când plata e consemnată pentru acel token (plata_status trecea
-- de la altceva la 'platit' chiar în acest apel).
create or replace function confirm_card_payment(p_token text, p_ntp_id text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings; v_nou boolean;
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
    --
    -- Doar prima dată contează ca "descoperire" — un IPN dublu pentru o
    -- plată deja consemnată nu mai trebuie să retrimită avizul de rambursare.
    v_nou := v_b.plata_status is distinct from 'platit';
    if v_nou then
      update public_bookings
         set plata_status = 'platit', netopia_ntp_id = p_ntp_id, suma_platita = p_amount
       where id = v_b.id;
    end if;
    return jsonb_build_object('success', false, 'status', v_b.status,
      'confirmationNumber', v_b.confirmation_number, 'platitDupaAnulare', v_nou);
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
