-- Plafonul global cadea peste TOTI oaspetii deodata.
--
-- `guest_poarta` e poarta comuna a paginii oaspetelui: `guest_stay_by_cod`,
-- `guest_access_code_by_cod` si `guest_poate_deschide` trec toate prin ea. La
-- 200 de coduri gresite pe ora, ea raspundea „prea-multe" tuturor — pagina se
-- stingea cu totul, inclusiv butonul de deschidere a usii. Cu antetul de IP
-- falsificabil, un singur calculator ajungea; acum ca IP-ul e real (vezi
-- ip_client), plafonul pe IP e apararea care conteaza.
--
-- 5000/ora, nu 200: e o plasa impotriva unui botnet, nu un mecanism de
-- aparare. Spatiul de coduri are 62^5 ≈ 916 milioane de combinatii, deci
-- chiar si 120.000 de incercari pe zi acopera 0,013% din el — plafonul
-- global nu cumpara nimic la 200 pe care sa nu-l cumpere la 5000, dar la 200
-- costa disponibilitatea usilor.
do $$
declare def text; nou text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guest_poarta';

  nou := replace(def,
    'PLAFON_GLOBAL constant int := 200;   -- esecuri pe ora, din orice sursa',
    'PLAFON_GLOBAL constant int := 5000;  -- plasa anti-botnet, nu aparare');

  if nou = def then
    raise exception 'Nu am gasit plafonul global — nu schimb nimic pe orbeste';
  end if;

  execute nou;
end $$;