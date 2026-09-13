-- Ce vede oaspetele inainte sa completeze fisa.
--
-- TACE DE INDATA CE FISA E SEMNATA. Ca sa precompleteze, functia trebuie sa
-- intoarca numele si adresa din `guests` — adica un cod scurs le-ar putea
-- citi. Ingustam fereastra in loc s-o lasam deschisa: dupa semnare raspunsul
-- e doar „gata", fara nimic din continut. In practica fereastra tine cateva
-- minute, de la check-in pana la completare.
--
-- Ce NU intoarce, niciodata: data nasterii, locul nasterii, actul de
-- identitate, semnatura. Sunt exact campurile marcate `sensibil` in
-- src/lib/fisa.js, iar motivul e in docs/fisa-cazare.md 3.
create or replace function guest_fisa_precompletare(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
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

  return jsonb_build_object(
    'ok', true,
    'gata', false,
    'date', jsonb_build_object(
      'nume',       coalesce(v_g.last_name, ''),
      'prenume',    coalesce(v_g.first_name, ''),
      'adresa',     coalesce(v_g.address, ''),
      'localitate', coalesce(v_g.city, ''),
      'tara',       coalesce(v_g.country, '')
    ));
end $$;

-- Revocarea INAINTEA grantului: in Postgres orice functie noua primeste
-- EXECUTE pentru PUBLIC, iar o revocare scrisa doar pentru `anon` arata
-- corect si nu face nimic.
revoke execute on function guest_fisa_precompletare(text)
  from public, anon, authenticated;
grant  execute on function guest_fisa_precompletare(text) to anon, service_role;