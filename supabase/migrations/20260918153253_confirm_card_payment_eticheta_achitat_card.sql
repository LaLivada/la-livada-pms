-- Personalul din PMS nu avea cum sa stie, din lista sau fisa rezervarii,
-- ca o rezervare a fost deja platita online cu cardul — campurile de plata
-- (metoda_plata, plata_status) exista doar pe public_bookings, niciodata
-- copiate pe reservations. Gasit direct dupa primul test complet, live, in
-- sandbox NETOPIA: rezervarea aparea confirmata, dar nimic din PMS nu
-- spunea ca fusese si platita.
--
-- Solutia refoloseste mecanismul existent de `tags` (deja afisat ca pastile
-- in lista si in fisa rezervarii, fara cod nou de interfata): la prima
-- confirmare a platii, se adauga eticheta "Achitat cu cardul" pe toate
-- rezervarile din grup. Garda `not (... = any(tags))` e doar defensiva —
-- ramura asta ruleaza o singura data per rezervare (statusul 'confirmed'
-- se intoarce mai devreme la orice IPN ulterior, la inceputul functiei).
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

  update reservations
     set status = 'confirmed', hold_expires_at = null,
         tags = case when 'Achitat cu cardul' = any(tags) then tags
                     else array_append(tags, 'Achitat cu cardul') end
   where id = any(v_b.reservation_ids) and status = 'pending';

  update public_bookings
     set status = 'confirmed', hold_expires_at = null,
         plata_status = 'platit', netopia_ntp_id = p_ntp_id, suma_platita = p_amount
   where id = v_b.id;

  return jsonb_build_object('success', true, 'status', 'confirmed',
    'confirmationNumber', v_b.confirmation_number);
end; $$;