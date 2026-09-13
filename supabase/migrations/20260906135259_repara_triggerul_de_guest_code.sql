-- REPARATIE: crearea de rezervari din PMS era blocata.
--
-- Migratia `guest_app_revoca_functia_de_trigger` a revocat EXECUTE pe
-- `guest_code_nou` de la toata lumea, ca sa nu poata fi chemata direct din
-- API. Numai ca ea e chemata si din trigger-ul `pune_guest_code`, iar acela
-- nu era SECURITY DEFINER — deci apelul rula cu drepturile celui care
-- insereaza. Rezultatul: orice INSERT in `reservations` facut de un om
-- logat in PMS pica cu 42501, „permission denied for function
-- guest_code_nou", tradus in interfata drept „Nu ai dreptul sa faci
-- aceasta modificare".
--
-- De ce nu se vedea: Postgres verifica EXECUTE pe functia de trigger doar
-- la CREATE TRIGGER, nu la fiecare declansare — deci `pune_guest_code`
-- pornea. Abia apelul dinauntru, catre `guest_code_nou`, era verificat la
-- executie. Verificarile mele de atunci au trecut fiindca le-am facut cu
-- cheia de serviciu, care ocoleste tot.
--
-- Reparatia pastreaza intentia initiala: functiile raman inchise pentru
-- API. Trigger-ul devine SECURITY DEFINER, deci apelul dinauntru ruleaza cu
-- drepturile proprietarului. `set search_path` era deja acolo, si e
-- obligatoriu acum: fara el, un search_path controlat de client ar putea
-- indrepta apelul catre alta functie cu acelasi nume.
create or replace function pune_guest_code()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.guest_code is null then
    new.guest_code := guest_code_nou();
  end if;
  return new;
end $$;

-- Ramane inchisa pentru API, ca inainte. Nu e o contradictie cu cele de
-- mai sus: trigger-ul nu mai are nevoie de dreptul apelantului.
revoke execute on function pune_guest_code() from public, anon, authenticated;