-- Revocarea din migrarea anterioara n-a avut efect: scosesem dreptul de
-- la `anon`, dar PUBLIC il pastra, iar anon il mostenea pe acolo. Exact
-- capcana descoperita mai devreme de testele de integrare, si exact
-- motivul pentru care fiecare revocare trebuie verificata, nu presupusa.
--
-- create_booking ramane definita (o camera, apelabila intern), dar nu mai
-- e un al doilea drum public de creare a rezervarilor — acela e acum doar
-- create_public_booking, care acopera si cazul cu o singura camera.
revoke execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) from public, anon;
grant execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) to authenticated, service_role;