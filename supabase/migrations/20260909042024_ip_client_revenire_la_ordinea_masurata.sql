create or replace function public.ip_client()
returns text language plpgsql stable security definer
set search_path to 'public' as $function$
declare v jsonb;
begin
  begin
    v := current_setting('request.headers', true)::jsonb;
  exception when others then
    -- Chemată din afara unei cereri PostgREST (editor SQL, job): fără IP.
    return null;
  end;
  -- ORDINEA E CEA MĂSURATĂ, ŞI A FOST DEJA GREŞITĂ O DATĂ DE MINE.
  --
  -- La 9 septembrie 2026 am inversat-o, punând `sb-forwarded-for` primul, pe
  -- motiv că un antet pus de platformă e mai sigur decât unul pus de
  -- Cloudflare. Motivul suna bine şi era o presupunere: `src/lib/ip.js`
  -- răspunsese deja la ea, din măsurători pe producţie.
  --
  -- `cf-connecting-ip` NU poate fi falsificat, şi nu fiindcă e rescris: o
  -- cerere care îl trimite singură e respinsă la marginea Cloudflare cu 403
  -- (error 1000), deci nici nu ajunge până aici. E o garanţie mai tare decât
  -- rescrierea. `sb-forwarded-for` e a doua plasă — falsificarea lui e
  -- ignorată în tăcere, adresa reală rămâne.
  --
  -- `x-forwarded-for` nu apare în listă şi nu e o scăpare: Cloudflare doar
  -- ADAUGĂ la el, deci primul element e chiar valoarea trimisă de atacator.
  --
  -- Perechea din funcţiile edge e `ipClient()` din `src/lib/ip.js`. SE SCHIMBĂ
  -- ÎMPREUNĂ — iar dacă vreuna dintre ele pare că merită schimbată singură,
  -- citeşte întâi comentariul celeilalte.
  return nullif(coalesce(v ->> 'cf-connecting-ip', v ->> 'sb-forwarded-for'), '');
end $function$;

revoke execute on function public.ip_client() from public, anon, authenticated;