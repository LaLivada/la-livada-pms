-- P0.3 din audit. Rolul anon are grant complet de tabel pe tot schema
-- public (implicit la Supabase). Azi e inofensiv fiindca nicio politica
-- RLS nu mentioneaza anon, deci orice cerere anonima e refuzata oricum —
-- dar RLS ramane singurul strat. O singura politica viitoare scrisa din
-- greseala ca using(true) pentru anon ar deschide instant tabelul, fara
-- nimic dedesubt care sa prinda greseala.
revoke all on all tables in schema public from anon;

-- Fara asta, orice tabel creat de aici inainte ar primi din nou grantul
-- complet si problema ar reveni tacut.
--
-- NOTA: se poate seta doar pentru rolul `postgres` (cel cu care se
-- ruleaza migrarile). Acelasi lucru pentru `supabase_admin` cere
-- privilegii pe care conexiunea de migrare nu le are — daca vreodata se
-- creeaza tabele prin acel rol (din Dashboard-ul Supabase), grantul
-- pentru anon trebuie revocat manual dupa.
alter default privileges for role postgres in schema public revoke all on tables from anon;