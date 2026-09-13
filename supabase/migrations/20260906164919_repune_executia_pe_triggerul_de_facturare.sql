-- REVENIRE DELIBERATA asupra revocarii de acum cateva minute.
--
-- `acorda_permisiuni_facturare_implicite` e functia unui trigger pe `staff`.
-- Revocarea ei era pura curatenie: Postgres refuza oricum apelul direct al
-- unei functii de trigger ("can only be called as a trigger"), deci dreptul
-- nu deschidea nimic.
--
-- Iar in proiectul asta exact zona asta a produs deja o pana de 12 ore:
-- migratia `guest_app_revoca_functia_de_trigger` a taiat EXECUTE pe o
-- functie chemata dintr-un trigger si fiecare creare de rezervare din PMS a
-- inceput sa cada cu 42501. Regula spune ca EXECUTE pe functia de trigger se
-- verifica la CREATE TRIGGER, nu la fiecare declansare — dar am mai crezut o
-- regula despre triggere in proiectul asta si m-a costat o zi de productie.
--
-- Beneficiu zero, risc cunoscut: se pune la loc.
grant execute on function public.acorda_permisiuni_facturare_implicite()
  to authenticated, service_role;