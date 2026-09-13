create or replace function guest_fisa_precompletare(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p        record;
  v_g        guests;
  v_gata     boolean;
  v_oc_nume  text;
  v_oc_pren  text;
  v_ocupant  boolean;
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

  -- OCUPANTUL, cand exista, e cel care doarme in camera — deci el semneaza
  -- fisa, nu titularul care a platit. La un grup titularul e o singura
  -- persoana pentru zece camere, iar numele lui precompletat pe zece fise ar
  -- fi trebuit sters de zece ori.
  --
  -- Cand numele vine de la ocupant, ADRESA NU MAI VINE de la titular: o fisa
  -- care arata completa, cu numele unui om si domiciliul altuia, e cea mai
  -- urata forma de gresit — se semneaza asa si ajunge la dosar. Golul se
  -- vede, amestecul nu.
  --
  -- Aceeasi regula, in `precompletareDinOaspete` (src/lib/fisa.js).
  v_oc_nume := coalesce(nullif(nullif(btrim((v_p.rezervare).occupant_last_name),  ''), '-'), '');
  v_oc_pren := coalesce(nullif(nullif(btrim((v_p.rezervare).occupant_first_name), ''), '-'), '');
  v_ocupant := (v_oc_nume <> '' or v_oc_pren <> '')
    and lower(btrim(v_oc_nume || ' ' || v_oc_pren))
        is distinct from lower(btrim(
          coalesce(nullif(nullif(btrim(v_g.last_name),  ''), '-'), '') || ' ' ||
          coalesce(nullif(nullif(btrim(v_g.first_name), ''), '-'), '')));

  if v_ocupant then
    return jsonb_build_object(
      'ok', true,
      'gata', false,
      'date', jsonb_build_object(
        'nume',       v_oc_nume,
        'prenume',    v_oc_pren,
        'adresa',     '',
        'localitate', '',
        'tara',       ''
      ));
  end if;

  -- Cele cinci campuri nesensibile, si numai ele. Data si locul nasterii si
  -- actul de identitate nu se precompleteaza niciodata: se citesc de pe
  -- documentul din mana, de fiecare data (docs/fisa-cazare.md 3).
  --
  -- `nullif(..., '-')` NU e pedanterie. `snakeGuest` (src/data/mapari.js)
  -- scrie "-" cand lipsesc last_name, first_name sau city. Trecuta in
  -- formular, umplutura ARATA completata: oaspetele nu mai scrie nimic
  -- acolo, validarea o accepta ca valoare, si "-" ajunge ca localitate pe o
  -- fisa de cazare, adica pe un act oficial. Golul se vede; "-" nu.
  --
  -- Aceeasi regula, aceleasi cinci campuri, si la receptie, in
  -- `precompletareDinOaspete` (src/lib/fisa.js). Doua precompletari diferite
  -- ar fi insemnat ca aceeasi rezervare arata altfel dupa cine deschide fisa.
  --
  -- Golul se scrie ca sir vid, nu ca null: pagina oaspetelui pune valoarea
  -- direct in `value` al unui input, iar null ar face campul necontrolat.
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
end $$;

revoke execute on function guest_fisa_precompletare(text)
  from public, anon, authenticated;
grant  execute on function guest_fisa_precompletare(text) to anon, service_role;