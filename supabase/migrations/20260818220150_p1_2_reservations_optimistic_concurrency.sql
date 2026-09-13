-- P1.2 — pana acum doi utilizatori care editau aceeasi rezervare isi
-- suprascriau tacut modificarile: syncTable trimite randul INTREG din
-- starea locala, deci al doilea salvat readucea valorile vechi ale
-- primului, fara nicio eroare.
--
-- Coloana updated_at + triggerul de mai jos transforma asta intr-un
-- refuz explicit: clientul trimite inapoi valoarea pe care a citit-o,
-- iar daca intre timp randul s-a schimbat in baza, scrierea e respinsa
-- si aplicatia reincarca datele reale.
alter table reservations add column updated_at timestamptz not null default now();

create or replace function stamp_reservation_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Valoarea trimisa de client la inserare e ignorata: randul e nou.
    new.updated_at := now();
    return new;
  end if;

  -- Un client care NU trimite updated_at (null) nu e blocat — verificarea
  -- se aplica doar celor care participa la protocol. Asa raman posibile
  -- scripturile de intretinere/backfill, fara sa slabeasca protectia
  -- pentru aplicatie, care trimite mereu valoarea citita.
  if new.updated_at is not null and old.updated_at is not null
     and new.updated_at < old.updated_at then
    raise exception 'Rezervarea a fost modificata de altcineva intre timp. Datele se reincarca — reia modificarea.'
      using errcode = '40001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger reservations_stamp_updated_at
  before insert or update on reservations
  for each row execute function stamp_reservation_updated_at();