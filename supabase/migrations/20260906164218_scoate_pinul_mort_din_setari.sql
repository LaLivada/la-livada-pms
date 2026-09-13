-- `pms:core:v3` tinea o lista `users` ramasa din vremea cand aplicatia avea
-- autentificare locala pe PIN: [{"id":"u1","pin":"1234","name":"Radu",
-- "role":"admin"}]. Politica de citire pe `app_state` e `using (true)`,
-- deci PIN-ul era vizibil oricui se logheaza.
--
-- Nu escalada nimic: `pin` nu mai e citit nicaieri in cod (cautat in tot
-- src/ — zero potriviri), autentificarea trece de mult prin Supabase Auth,
-- iar "Radu" nici macar nu mai e in tabelul `staff`. Dar o credentiala in
-- clar lasata la vedere e o invitatie pentru ziua in care cineva o
-- refoloseste altundeva.
update app_state
   set value = value - 'users'
 where key = 'pms:core:v3'
   and value ? 'users';