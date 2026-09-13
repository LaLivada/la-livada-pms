-- Fisa completata de receptie, si ce inseamna atunci o fisa valida.
--
-- Constrangerea de dinainte cerea EXACT UN autor: ori semnatura oaspetelui,
-- ori numele receptionerului. Parea curata, dar era prea rigida pentru
-- fluxul real: receptionerul tasteaza si oaspetele semneaza pe tableta lui —
-- caz in care fisa are nevoie de amandoua.
--
-- Regula noua (hotarata 7 septembrie 2026): o fisa e valida fie cu
-- semnatura, fie fara ea DAR cu motivul scris. `completata_de` inseamna de
-- acum „cine a tastat", independent de semnatura.
alter table fise_cazare drop constraint fisa_are_un_autor;

alter table fise_cazare add column fara_semnatura_motiv text;

alter table fise_cazare add constraint fisa_semnata_sau_motivata check (
  semnatura_svg is not null or fara_semnatura_motiv is not null);

-- Cine vede fisele. `housekeeping` NU: cine face curat n-are ce cauta in
-- seriile de buletin. Acelasi tipar ca la `guests`, unde citirea e deja
-- restransa la admin si receptioner (migratia oaspetii_doar_pentru_receptie,
-- 6 septembrie 2026).
--
-- Tabelul avea `revoke all ... from authenticated`, fiindca pana acum singura
-- cale era prin functiile guest app-ului. Acum receptia are nevoie de el
-- direct, deci grantul se pune inapoi si RLS-ul face selectia.
grant select, insert, update on table fise_cazare to authenticated;

create policy "receptia citeste fise" on fise_cazare
  for select to authenticated
  using ((select is_admin()) or (select staff_role()) = 'receptionist');

create policy "receptia scrie fise" on fise_cazare
  for insert to authenticated
  with check (is_admin() or staff_role() = 'receptionist');

-- UPDATE e deschis doar cat sa treaca anularea: triggerul fise_cazare_imuabila
-- respinge orice alta diferenta intre randul vechi si cel nou. Politica spune
-- CINE poate incerca; triggerul spune CE poate trece.
create policy "receptia anuleaza fise" on fise_cazare
  for update to authenticated
  using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');