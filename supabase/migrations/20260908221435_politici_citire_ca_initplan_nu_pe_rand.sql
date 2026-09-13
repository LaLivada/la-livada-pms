-- ALTER, nu DROP + CREATE: între cele două comenzi tabelul ar rămâne fără
-- nicio politică de SELECT, deci gol pentru toată lumea.
--
-- `(select ...)` în loc de apelul direct: altfel Postgres tratează funcția ca
-- volatilă față de rând și o reevaluează O DATĂ PE RÂND. `reservations` e
-- citit întreg la fiecare pornire, deci diferența e reală.
alter policy "staff citeste" on reservations
  using ((select is_admin()) or (select staff_role()) = 'receptionist');
alter policy "staff citeste" on res_groups
  using ((select is_admin()) or (select staff_role()) = 'receptionist');