-- Adresa reala a clientului, pentru plafoanele de rata.
--
-- DE CE NU x-forwarded-for. Antetul e scris de client si Cloudflare doar
-- ADAUGA la el, deci primul element — cel citit pana acum — e valoarea
-- trimisa de atacator. Verificat: o cerere cu „X-Forwarded-For: 198.51.100.9"
-- ajunge la Postgres ca „198.51.100.9,86.124.62.94", iar split_part(...,1)
-- intoarce exact minciuna. Toate plafoanele pe IP erau ocolibile rotind
-- antetul la fiecare cerere.
--
-- DE CE cf-connecting-ip. E pus de Cloudflare si NU poate fi falsificat: o
-- cerere care il trimite singura e respinsa la margine cu 403 (error 1000),
-- deci nici nu ajunge aici. sb-forwarded-for e a doua plasa — falsificarea
-- lui e ignorata in tacere, adresa reala ramane.
create or replace function ip_client()
returns text language plpgsql stable security definer
set search_path = public as $$
declare v jsonb;
begin
  begin
    v := current_setting('request.headers', true)::jsonb;
  exception when others then
    -- Chemata din afara unei cereri PostgREST (editor SQL, job): fara IP.
    return null;
  end;
  return nullif(coalesce(v ->> 'cf-connecting-ip', v ->> 'sb-forwarded-for'), '');
end $$;

revoke execute on function ip_client() from public, anon, authenticated;

-- Inlocuieste blocul vechi in cele patru functii care il aveau, fara sa le
-- rescrie corpul de mana: se ia definitia curenta si se schimba doar
-- instructiunea de extragere a IP-ului.
do $$
declare
  f text;
  def text;
  nou text;
begin
  foreach f in array array['create_booking', 'create_public_booking',
                           'guest_poarta', 'guest_fisa_semneaza'] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;

    nou := regexp_replace(def,
      'v_ip := nullif\(split_part\(coalesce\([^;]+;',
      'v_ip := ip_client();');

    if nou = def then
      raise exception 'Tiparul nu s-a potrivit in %, nu schimb nimic pe orbeste', f;
    end if;

    execute nou;
  end loop;
end $$;