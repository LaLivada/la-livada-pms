-- Descoperit de testele de integrare RLS: `revoke execute ... from anon`
-- (asa cum era scris in schema.sql) NU are efect. Postgres acorda
-- implicit EXECUTE catre PUBLIC pentru orice functie noua, iar `anon`
-- mosteneste prin PUBLIC — revocarea nominala nu atinge acel grant.
--
-- In practica nu s-a scurs nimic: functiile sunt `security invoker`, deci
-- citirile lor din rates/seasons/rooms cad tot pe RLS si intorc 0. Dar
-- intentia scrisa in schema ("calculul de pret NU e expus public") nu era
-- de fapt aplicata, iar un viitor `security definer` pus din graba ar fi
-- transformat-o instant in scurgere reala.
revoke execute on function stay_total(text, timestamptz, timestamptz) from public;
revoke execute on function nightly_rate(text, date) from public;
grant execute on function stay_total(text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function nightly_rate(text, date) to authenticated, service_role;

-- Acelasi tipar pentru helperele de permisiuni: sunt folosite doar in
-- politicile RLS pentru utilizatori autentificati si de functiile
-- security definer (care ruleaza ca proprietar, deci nu depind de grant).
-- Un vizitator anonim nu are ce sa faca cu ele.
revoke execute on function is_admin() from public;
revoke execute on function has_billing_permission(text) from public;
revoke execute on function staff_role() from public;
grant execute on function is_admin() to authenticated, service_role;
grant execute on function has_billing_permission(text) to authenticated, service_role;
grant execute on function staff_role() to authenticated, service_role;

-- Numerotarea documentelor: are deja verificare interna de permisiune,
-- dar nu are rost sa fie nici macar apelabila de un anonim.
revoke execute on function next_invoice_number(text) from public;
revoke execute on function next_receipt_number(text) from public;
grant execute on function next_invoice_number(text) to authenticated, service_role;
grant execute on function next_receipt_number(text) to authenticated, service_role;