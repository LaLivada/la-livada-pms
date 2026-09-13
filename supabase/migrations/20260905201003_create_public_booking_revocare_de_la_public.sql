-- Revocarea de la `anon` nu era de ajuns.
--
-- In PostgreSQL, orice functie noua primeste EXECUTE pentru PUBLIC, iar
-- `anon` mosteneste de acolo. O revocare doar de la rol lasa dreptul
-- neatins — verificat pe viu: dupa `revoke ... from anon`, un apel direct
-- cu cheia publica a creat in continuare o rezervare.
--
-- Se revoca de la PUBLIC si se acorda explicit doar celor care au nevoie.
revoke execute on function create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int, text)
  from public, anon, authenticated;

grant execute on function create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int, text)
  to service_role;