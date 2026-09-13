-- REGRESIE INTRODUSA IN P0.1, descoperita abia acum, la testarea etapei 3.
--
-- Migrarea p0_1 a fixat `search_path = public` pe create_booking, ca sa
-- inchida vectorul de search-path hijacking. Efect neprevazut:
-- gen_random_bytes() traieste in schema `extensions` (asa o instaleaza
-- Supabase pgcrypto), nu in `public`. Cu search_path fixat doar pe
-- public, functia nu o mai gaseste si CREAREA REZERVARILOR DE PE SITE A
-- ESUAT DE ATUNCI, cu "function gen_random_bytes(integer) does not exist".
--
-- Nu s-a observat fiindca site-ul public nu exista inca si nicio
-- rezervare nu vine pe acest drum (0 randuri cu source='site').
--
-- Fixul pastreaza intentia initiala: search_path ramane fixat, doar ca
-- include si schema in care traiesc functiile de criptografie. Ambele
-- scheme sunt controlate; niciun utilizator nu poate crea obiecte acolo.
--
-- De retinut: `set search_path = public` NU e sigur by default intr-un
-- proiect Supabase. Orice functie care foloseste pgcrypto (gen_random_bytes,
-- crypt, digest) are nevoie de `public, extensions`.
alter function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text)
  set search_path = public, extensions;

alter function create_public_booking(uuid, timestamptz, timestamptz, text, text,
  text, text, text, text, text, jsonb, text)
  set search_path = public, extensions;