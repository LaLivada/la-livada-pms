-- ETAPA 2 — serverul devine autoritatea pentru pretul STOCAT.
--
-- Planul initial spunea "JS-ul citeste pretul de la server, se elimina a
-- doua implementare". La verificare, ideea s-a dovedit gresita:
-- reservationTotal e apelata in 13 locuri, majoritatea in bucle de
-- randare (calendar, rapoarte, liste). Transformarea ei intr-un apel de
-- retea ar fi insemnat N+1 cereri la fiecare randare si un refactor async
-- al intregului fisier — exact ce contrazice regula "modificari aditive".
--
-- Varianta de aici atinge acelasi scop fara niciun refactor: JS-ul isi
-- pastreaza calculul sincron pentru PREVIZUALIZARE, dar ce ajunge in baza
-- e recalculat de server. Acelasi tipar ca guard_invoice_update sau
-- recalc_invoice_payment_status — invariantul e impus unde traiesc datele.
--
-- Consecinta directa: un pret trimis din browser nu mai are nicio putere.
-- Verificat: un INSERT cu booked_price = 999 e corectat la valoarea reala.
--
-- Regula de recalculare o oglindeste pe cea din ReservationModal: pretul
-- inghetat ramane neatins pana se schimba ceva ce chiar il afecteaza
-- (camera, datele, ocuparea). O simpla editare de nota, sau un tarif
-- modificat ulterior, nu il ating — altfel o schimbare de tarife ar
-- rescrie retroactiv sume deja acceptate de clienti.
create or replace function pret_server_rezervare()
returns trigger language plpgsql set search_path = public as $$
declare v_recalc boolean;
begin
  -- Blocajele de mentenanta nu au pret.
  if new.source = 'blocaj' then
    return new;
  end if;

  -- Pretul manual are mereu prioritate; cel calculat se goleste, ca sa nu
  -- existe doua surse pentru aceeasi suma.
  if new.price_override is not null then
    new.booked_price := null;
    return new;
  end if;

  v_recalc := (tg_op = 'INSERT')
    or new.room_id  is distinct from old.room_id
    or new.checkin  is distinct from old.checkin
    or new.checkout is distinct from old.checkout
    or new.adults   is distinct from old.adults
    or new.children is distinct from old.children
    -- rezervare veche, fara pret inghetat inca
    or old.booked_price is null;

  if v_recalc then
    new.booked_price := stay_total(
      new.room_id, new.checkin, new.checkout,
      greatest(coalesce(new.adults, 2), 1),
      greatest(coalesce(new.children, 0), 0),
      -- ajustarea pe grad de ocupare doar pentru site-ul propriu,
      -- exact ca in JS
      new.source = 'site');
  end if;

  return new;
end; $$;

create trigger reservations_pret_server
  before insert or update on reservations
  for each row execute function pret_server_rezervare();