create or replace function ip_client()
returns text language plpgsql stable security definer
set search_path = public as $$
declare v jsonb;
begin
  begin
    v := current_setting('request.headers', true)::jsonb;
  exception when others then
    -- Chemată din afara unei cereri PostgREST (editor SQL, job): fără IP.
    return null;
  end;
  return nullif(coalesce(v ->> 'cf-connecting-ip', v ->> 'sb-forwarded-for'), '');
end $$;

revoke execute on function ip_client() from public, anon, authenticated;