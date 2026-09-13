-- staff_role() se foloseste doar in politicile RLS pentru utilizatori
-- autentificati; un vizitator anonim nu are ce sa faca cu ea.
revoke execute on function staff_role() from anon;