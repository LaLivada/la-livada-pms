-- Scrierea fisei, din link public.
--
-- NU INTOARCE NIMIC DIN CE A SCRIS. Nici la succes. Un raspuns care ar
-- oglindi datele ar fi o cale de citire pe usa din dos, exact ce inchide
-- docs/fisa-cazare.md 3.
--
-- A doua scriere pe aceeasi (rezervare, ordine) e oprita de indexul partial
-- `fise_cazare_activa`, nu de o verificare scrisa aici: doua cereri venite in
-- aceeasi clipa ar fi trecut amandoua de un `if exists`, iar indexul nu se
-- poate pacali asa.
create or replace function guest_fisa_semneaza(p_cod text, p_date jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p  record;
  v_ip text;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''
    ), ',', 1), '');
  exception when others then v_ip := null;
  end;

  begin
    insert into fise_cazare (
      id, reservation_id, ordine, guest_id,
      nume, prenume, data_nasterii, locul_nasterii,
      nationalitate, tara, adresa, localitate, scopul,
      act_tip, act_seria, act_numarul,
      semnatura_svg, semnat_ip, semnat_agent, sablon_versiune)
    values (
      -- Calificat cu `extensions.`, fiindca acolo sta pgcrypto in Supabase,
      -- iar functia isi fixeaza search_path la public.
      'fc-' || encode(extensions.gen_random_bytes(8), 'hex'),
      (v_p.rezervare).id, 1, (v_p.rezervare).guest_id,
      p_date ->> 'nume', p_date ->> 'prenume',
      (p_date ->> 'dataNasterii')::date, p_date ->> 'loculNasterii',
      p_date ->> 'nationalitate', p_date ->> 'tara',
      p_date ->> 'adresa', p_date ->> 'localitate', p_date ->> 'scopul',
      p_date ->> 'actTip', nullif(p_date ->> 'actSeria', ''),
      p_date ->> 'actNumarul',
      p_date ->> 'semnaturaSvg', v_ip,
      left(coalesce(current_setting('request.headers', true)::json
           ->> 'user-agent', ''), 300),
      coalesce(p_date ->> 'sablonVersiune', 'necunoscuta'));
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'motiv', 'deja-completata');
    when not_null_violation or check_violation or invalid_text_representation
      or invalid_datetime_format or datetime_field_overflow then
      -- Mesajul nu spune CE camp: cine trimite date stricate din afara
      -- formularului n-are de ce sa afle forma exacta a tabelului.
      return jsonb_build_object('ok', false, 'motiv', 'date-incomplete');
  end;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function guest_fisa_semneaza(text, jsonb)
  from public, anon, authenticated;
grant  execute on function guest_fisa_semneaza(text, jsonb) to anon, service_role;