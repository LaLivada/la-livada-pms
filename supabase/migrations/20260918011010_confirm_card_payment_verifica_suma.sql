-- Fix (revizia finala, plata cu cardul): netopia-ipn pasa suma procesata de
-- NETOPIA direct in confirm_card_payment, care confirma rezervarea fara sa
-- verifice vreodata ca s-a plătit exact cat se datora. O plata partiala ar
-- fi confirmat o rezervare intreaga.
--
-- Verificarea sta AICI, nu in functia edge: `total_amount` e sursa unica de
-- adevar pentru cat se datoreaza, iar functia edge n-ar face decat o a doua
-- interogare care poate rămâne in urma. Toleranta de 0.01 acopera rotunjirea
-- reprezentarii sumei in XML-ul NETOPIA (banii vin ca zecimale, nu ca int).
--
-- La nepotrivire NU confirmam nimic: rezervarea rămâne `pending` (deci
-- camera se elibereaza singura la expirarea holdului) si nu pleaca niciun
-- email de confirmare — netopia-ipn trimite emailul doar pe status
-- 'confirmed'. Cazul se consemneaza ca eroare in netopia_ipn_log, ca sa
-- ajunga la un om.
--
-- Semnatura e IDENTICA (text, text, numeric) — un singur obiect, ACL
-- neschimbat (service_role).
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
    -- Suma nu se verifică pe ramura asta: orice bani ajunși la noi pentru o
    -- rezervare care nu mai există trebuie găsiți și returnați, fie că sunt
    -- cât trebuia, fie că nu.
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

  -- Suma trebuie să fie exact cea datorată. Altfel nu confirmăm nimic:
  -- rezervarea rămâne ținută și cazul ajunge la un om prin netopia_ipn_log.
  if p_amount is null or abs(v_b.total_amount - p_amount) > 0.01 then
    return jsonb_build_object('success', false, 'status', 'suma_incorecta',
      'confirmationNumber', v_b.confirmation_number);
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