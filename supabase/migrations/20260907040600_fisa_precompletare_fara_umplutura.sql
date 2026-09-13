-- Precompletarea nu mai trece valoarea de umplutura „-".
--
-- `snakeGuest` (src/data/mapari.js) scrie "-" cand lipsesc last_name,
-- first_name sau city. Trecuta in formular, umplutura ARATA completata:
-- oaspetele nu mai scrie nimic acolo, validarea o accepta ca valoare, si "-"
-- ajunge ca localitate pe o fisa de cazare — un act oficial.
--
-- Aceeasi regula e aplicata si la receptie, in precompletareDinOaspete
-- (src/lib/fisa.js). Doua precompletari diferite ar fi insemnat ca aceeasi
-- rezervare arata altfel dupa cine deschide fisa.
--
-- Golul se scrie ca sir vid, nu ca null: pagina oaspetelui pune valoarea
-- direct in `value` al unui input, iar null ar fi facut campul necontrolat.
create or replace function public.guest_fisa_precompletare(p_cod text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p     record;
  v_g     guests;
  v_gata  boolean;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  select exists (
    select 1 from fise_cazare
    where reservation_id = (v_p.rezervare).id
      and ordine = 1 and anulata_la is null
  ) into v_gata;

  if v_gata then
    return jsonb_build_object('ok', true, 'gata', true);
  end if;

  select * into v_g from guests where id = (v_p.rezervare).guest_id;

  -- Cele cinci campuri nesensibile, si numai ele. Data si locul nasterii si
  -- actul de identitate nu se precompleteaza niciodata: se citesc de pe
  -- documentul din mana, de fiecare data (docs/fisa-cazare.md 3).
  return jsonb_build_object(
    'ok', true,
    'gata', false,
    'date', jsonb_build_object(
      'nume',       coalesce(nullif(nullif(btrim(v_g.last_name),  ''), '-'), ''),
      'prenume',    coalesce(nullif(nullif(btrim(v_g.first_name), ''), '-'), ''),
      'adresa',     coalesce(nullif(nullif(btrim(v_g.address),    ''), '-'), ''),
      'localitate', coalesce(nullif(nullif(btrim(v_g.city),       ''), '-'), ''),
      'tara',       coalesce(nullif(nullif(btrim(v_g.country),    ''), '-'), '')
    ));
end $function$;

revoke all on function public.guest_fisa_precompletare(text) from public;
grant execute on function public.guest_fisa_precompletare(text) to anon, authenticated;