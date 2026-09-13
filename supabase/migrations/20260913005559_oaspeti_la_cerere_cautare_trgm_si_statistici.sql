-- Faza 1 (docs/faza1.md, §2.4): oaspetii nu se mai incarca toti in browser.
-- Cautarea, lista paginata si sumarul pe oaspete se fac pe server.

-- pg_trgm: cautarea „contine" (like '%pop%') pe 40.000 de oaspeti costa
-- 131 ms fara index si 9 ms cu GIN trigram (masurat, docs/faza1.md §1.2).
-- Expresiile indexate sunt EXACT cele din cauta_oaspeti — altfel indexul
-- nu se foloseste.
create extension if not exists pg_trgm with schema extensions;
create index if not exists guests_nume_trgm on guests
  using gin ((lower(coalesce(last_name, '') || ' ' || coalesce(first_name, ''))) extensions.gin_trgm_ops);
create index if not exists guests_telefon_trgm on guests
  using gin ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) extensions.gin_trgm_ops);
create index if not exists guests_oras_trgm on guests
  using gin ((lower(coalesce(city, ''))) extensions.gin_trgm_ops);

-- Aceeasi regula ca filtrul din browser de pana acum (formularul de
-- rezervare): nume complet „Nume Prenume", telefon doar pe cifre, oras.
-- Telefonul se cauta doar daca textul are macar 3 cifre — altfel „%%"
-- ar fi potrivit pe toata lumea. SECURITY INVOKER: RLS pe guests se
-- aplica (camerista nu vede nimic).
create or replace function cauta_oaspeti(p_text text, p_limita int default 20)
returns setof guests
language sql stable security invoker
set search_path = public
as $$
  with t as (
    select lower(trim(replace(replace(p_text, '%', '\%'), '_', '\_'))) as txt,
           regexp_replace(p_text, '[^0-9]', '', 'g') as cifre
  )
  select g.* from guests g, t
  where t.txt <> '' and (
       lower(coalesce(g.last_name, '') || ' ' || coalesce(g.first_name, '')) like '%' || t.txt || '%'
    or lower(coalesce(g.city, '')) like '%' || t.txt || '%'
    or (length(t.cifre) >= 3 and regexp_replace(coalesce(g.phone, ''), '[^0-9]', '', 'g') like '%' || t.cifre || '%')
  )
  order by g.last_name, g.first_name
  limit least(greatest(coalesce(p_limita, 20), 1), 100);
$$;
revoke execute on function cauta_oaspeti(text, int) from public, anon;
grant execute on function cauta_oaspeti(text, int) to authenticated, service_role;

-- Sumarul pe oaspete pe care lista de clienti il arata pe fiecare rand
-- (sejururi, nopti, incasat) si istoricul in antet. Aceeasi definitie ca
-- in browser: sejururi = rezervarile vii (nu anulate/no-show), nopti pe
-- zile calendaristice (Europe/Bucharest), incasat = pretul real
-- (suprascriere manuala, altfel cel inghetat) fara protocol.
-- security_invoker: RLS pe reservations se aplica, deci camerista nu
-- primeste randuri. Filtrata pe guest_id (in (...)) foloseste indexul
-- reservations_guest — masurat 0,3 ms pentru 30 de oaspeti la 100.000.
create or replace view oaspeti_statistici
with (security_invoker = true) as
select guest_id,
       count(*) filter (where status not in ('cancelled', 'noshow')) as sejururi,
       coalesce(sum(greatest(1, (checkout at time zone 'Europe/Bucharest')::date
                                - (checkin at time zone 'Europe/Bucharest')::date))
                filter (where status not in ('cancelled', 'noshow')), 0) as nopti,
       coalesce(sum(coalesce(price_override, booked_price, 0))
                filter (where status not in ('cancelled', 'noshow', 'protocol')), 0) as incasat,
       max(checkin) filter (where status not in ('cancelled', 'noshow')) as ultima_sosire
from reservations
where guest_id is not null
group by guest_id;
revoke all on oaspeti_statistici from public, anon;
grant select on oaspeti_statistici to authenticated;