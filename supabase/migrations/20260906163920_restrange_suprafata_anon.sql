-- `available_rooms` arata exact ce camera e ocupata in ce zile, unei lumi
-- care n-a cerut-o. Site-ul public foloseste `public_availability`, care
-- intoarce optiuni de cazare, nu harta ocuparii. Verificat prin cautare in
-- ambele proiecte (PMS si site): zero apeluri.
revoke execute on function public.available_rooms(timestamptz, timestamptz, integer) from anon;

-- Functie care SCRIE. E chemata dinauntru de `create_public_booking` si de
-- `confirm_public_booking`, amandoua security definer — deci ruleaza ca
-- proprietar si revocarea nu atinge drumul real al rezervarilor.
revoke execute on function public.expira_rezervari_neconfirmate() from anon;

-- Functie de trigger: Postgres refuza oricum apelul direct. Dreptul venea
-- din `grant execute ... to public`, nu dintr-o decizie.
revoke execute on function public.acorda_permisiuni_facturare_implicite() from anon;