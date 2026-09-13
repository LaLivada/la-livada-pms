-- =====================================================================
-- CĂUTARE GLOBALĂ — o singură cerere pentru „unde e rezervarea lui X".
-- Faza 3, C1 din docs/audit-2026-09.md; docs/faza3.md §1.
--
-- Caseta din antet (Ctrl+K sau /) întreabă funcția de mai jos cu ce a
-- scris recepția și primește REZERVĂRI, nu oaspeți: rezultatul se deschide
-- direct în calendar. Se caută în același timp după:
--   · numele titularului (guests, indexul trigram guests_nume_trgm),
--   · telefonul titularului (doar cifre, de la 3 în sus, guests_telefon_trgm),
--   · numele și telefonul OCUPANTULUI de pe rezervare (cel diferit de
--     titularul grupului — indexurile trigram de mai jos),
--   · numele camerei, exact („1005" — nu „100", care ar aduce nouă camere),
--   · codul de oaspete din linkul aplicației de oaspete, exact, cu
--     majusculele lui.
-- Fiecare cale își folosește indexul ei (UNION ALL de id-uri, nu un OR
-- peste un join — un OR peste două tabele n-ar putea folosi BitmapOr);
-- `potrivire` spune ecranului DE CE a ieșit rândul (cod, cameră, telefon,
-- nume, ocupant), ca recepția să nu se întrebe de ce apare un Popescu la
-- căutarea „1005" (are 1005 în telefon).
--
-- Ordinea: sejurul în curs primul, apoi cea mai apropiată sosire de azi —
-- „Popescu de săptămâna viitoare" iese înaintea lui Popescu de anul trecut.
-- Rândul întors are rezervarea ca valoare compusă (`rezervare`), deci
-- orice coloană adăugată mai târziu tabelului ajunge automat în browser,
-- unde trece prin același `camelRes` ca restul.
--
-- SECURITY INVOKER: RLS pe reservations și guests se aplică — camerista
-- primește 0 rânduri (verificat cu roluri impersonate, în tranzacție
-- anulată).
-- =====================================================================
create index if not exists reservations_ocupant_trgm on reservations
  using gin ((lower(coalesce(occupant_last_name, '') || ' ' || coalesce(occupant_first_name, ''))) extensions.gin_trgm_ops);
create index if not exists reservations_ocupant_telefon_trgm on reservations
  using gin ((regexp_replace(coalesce(occupant_phone, ''), '[^0-9]', '', 'g')) extensions.gin_trgm_ops);

create or replace function cauta_rezervari(p_text text, p_limita int default 12)
returns table (
  rezervare        reservations,
  room_name        text,
  guest_last_name  text,
  guest_first_name text,
  guest_phone      text,
  group_name       text,
  potrivire        text
)
language sql stable security invoker
set search_path = public
as $$
  with t as (
    select lower(trim(replace(replace(p_text, '%', '\%'), '_', '\_'))) as txt,
           trim(p_text) as brut,
           regexp_replace(p_text, '[^0-9]', '', 'g') as cifre
  ),
  candidate as (
    select distinct on (id) id, potrivire from (
      select r.id, 'cod' as potrivire, 0 as prio
        from reservations r, t
       where t.brut <> '' and r.guest_code = t.brut
      union all
      select r.id, 'camera', 1
        from reservations r, t
       where t.txt <> '' and r.room_id in (select ro.id from rooms ro where lower(ro.name) = t.txt)
      union all
      select r.id, 'telefon', 2
        from reservations r, t
       where length(t.cifre) >= 3 and r.guest_id in (
               select g.id from guests g
                where regexp_replace(coalesce(g.phone, ''), '[^0-9]', '', 'g') like '%' || t.cifre || '%')
      union all
      select r.id, 'telefon', 2
        from reservations r, t
       where length(t.cifre) >= 3
         and regexp_replace(coalesce(r.occupant_phone, ''), '[^0-9]', '', 'g') like '%' || t.cifre || '%'
      union all
      select r.id, 'nume', 3
        from reservations r, t
       where t.txt <> '' and r.guest_id in (
               select g.id from guests g
                where lower(coalesce(g.last_name, '') || ' ' || coalesce(g.first_name, '')) like '%' || t.txt || '%')
      union all
      select r.id, 'ocupant', 3
        from reservations r, t
       where t.txt <> ''
         and lower(coalesce(r.occupant_last_name, '') || ' ' || coalesce(r.occupant_first_name, '')) like '%' || t.txt || '%'
    ) x
    order by id, prio
  )
  select r as rezervare, ro.name, g.last_name, g.first_name, g.phone, gr.name, c.potrivire
    from candidate c
    join reservations r on r.id = c.id
    join rooms ro on ro.id = r.room_id
    left join guests g on g.id = r.guest_id
    left join res_groups gr on gr.id = r.group_id
   order by (r.checkin <= now() and r.checkout > now()) desc,
            abs(extract(epoch from (r.checkin - now()))),
            r.id
   limit least(greatest(coalesce(p_limita, 12), 1), 50);
$$;
revoke execute on function cauta_rezervari(text, int) from public, anon;
grant execute on function cauta_rezervari(text, int) to authenticated, service_role;
