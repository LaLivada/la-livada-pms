-- Faza 1, docs/faza1.md §2.4 — completare la oaspeti_la_cerere_cautare_trgm_si_statistici.
--
-- 1. ORDER BY pe lower(): cu `order by last_name, first_name` planificatorul
--    prefera indexul de ordine (mai jos) si parcurgea tabela in ordine,
--    filtrand rand cu rand — 100 ms la o cautare fara rezultate pe 40.000 de
--    oaspeti (bench). Pe o expresie fara index e obligat sa ia intai
--    potrivirile (BitmapOr pe cele trei indexuri trigram) si abia apoi sa
--    sorteze: 18 ms cu 4.000 de potriviri, sub 1 ms cu putine.
-- 2. Indexul de ordine pentru lista paginata din Clienti (PostgREST,
--    `order by last_name, first_name, id` + `range`): offset 30.000 costa
--    13 ms cu el, 200 ms fara (bench).
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
  order by lower(g.last_name), lower(g.first_name), g.id
  limit least(greatest(coalesce(p_limita, 20), 1), 100);
$$;

create index if not exists guests_ordine_nume on guests (last_name, first_name, id);