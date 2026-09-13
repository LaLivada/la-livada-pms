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
  -- ORDINEA CONTEAZĂ, şi era invers.
  --
  -- `cf-connecting-ip` e scris de Cloudflare, care îl rescrie la fiecare
  -- cerere — deci în mod normal nu se poate falsifica. „În mod normal” e
  -- însă o presupunere despre infrastructura altcuiva, iar pe ea atârnă
  -- toate limitele de rată din schema asta: dacă antetul ar putea fi scris
  -- de client, o valoare nouă la fiecare cerere ar da fiecărei încercări un
  -- buget propriu, iar plafonul pe adresă n-ar mai opri nimic.
  --
  -- `sb-forwarded-for` îl pune platforma Supabase, mai aproape de noi şi cu
  -- mai puţine verigi la mijloc. Pus primul, nu mai depindem de presupunerea
  -- de mai sus decât atunci când el chiar lipseşte.
  return nullif(coalesce(v ->> 'sb-forwarded-for', v ->> 'cf-connecting-ip'), '');
end $function$;

revoke execute on function public.ip_client() from public, anon, authenticated;