-- Guest app, pasul 1: codul de sejur si poarta de acces.
-- Plan: docs/guest-app.md, sectiunile 4.1-4.4.

-- ---------------------------------------------------------------------
-- Generatorul de coduri
-- ---------------------------------------------------------------------
create or replace function guest_code_nou()
returns text language plpgsql volatile
set search_path = public as $$
declare
  ALFABET constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  v_cod   text;
  v_octet int;
begin
  loop
    v_cod := '';
    while length(v_cod) < 5 loop
      -- gen_random_bytes, nu random(): random() e previzibil daca ii afli
      -- starea, iar un cod ghicibil din context ar anula toata socoteala
      -- din 4.1 — acolo se presupune ca singura cale e ghicirea oarba.
      --
      -- Calificat cu `extensions.`, fiindca acolo sta pgcrypto in Supabase,
      -- iar functia asta isi fixeaza search_path la public (intarire
      -- obisnuita). Defaulturile din schema il gasesc fara calificare doar
      -- fiindca ele se evalueaza cu search_path-ul sesiunii.
      v_octet := get_byte(extensions.gen_random_bytes(1), 0);
      -- Respingere, nu modulo pe tot intervalul: 256 nu se imparte la 62,
      -- deci un `% 62` aplicat oricarui octet ar face primele 8 litere ale
      -- alfabetului mai probabile decat restul. Aruncam octetii de la 248
      -- in sus (4 x 62 = 248) si pastram o distributie uniforma.
      if v_octet < 248 then
        v_cod := v_cod || substr(ALFABET, 1 + (v_octet % 62), 1);
      end if;
    end loop;
    -- Coliziunile sunt rare la un spatiu de 916 milioane, dar nu imposibile;
    -- se reia, nu se presupune ca nu se intampla.
    exit when not exists (select 1 from reservations where guest_code = v_cod);
  end loop;
  return v_cod;
end $$;

-- ---------------------------------------------------------------------
-- Coloana, indexul, backfill-ul
-- ---------------------------------------------------------------------
alter table reservations add column if not exists guest_code text;
create unique index if not exists reservations_guest_code
  on reservations (guest_code);

-- Backfill fara sa atinga `updated_at`. Triggerul de concurenta optimista
-- il duce la now() la orice update, iar asta ar fi facut ca fiecare client
-- cu aplicatia deschisa sa primeasca „rezervarea a fost modificata de
-- altcineva" la urmatoarea salvare, pe toate cele 130 de randuri deodata.
-- Dezactivat doar pe durata backfill-ului, in aceeasi tranzactie.
alter table reservations disable trigger reservations_stamp_updated_at;
do $$
declare r record;
begin
  for r in select id from reservations where guest_code is null loop
    update reservations set guest_code = guest_code_nou() where id = r.id;
  end loop;
end $$;
alter table reservations enable trigger reservations_stamp_updated_at;

-- Rezervarile noi isi primesc codul singure. Trigger, nu `default`: un
-- insert care trimite explicit null ar ocoli un default, nu si triggerul.
create or replace function pune_guest_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.guest_code is null then
    new.guest_code := guest_code_nou();
  end if;
  return new;
end $$;

drop trigger if exists reservations_pune_guest_code on reservations;
create trigger reservations_pune_guest_code
  before insert on reservations
  for each row execute function pune_guest_code();