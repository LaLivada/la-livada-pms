-- Verificarea de dupa prima revocare a aratat ca `anon` inca putea executa
-- amandoua functiile: in PostgreSQL orice functie noua primeste EXECUTE
-- pentru PUBLIC, iar rolurile mostenesc de acolo. Un `revoke ... from anon`
-- singur nu taie nimic — exact capcana descrisa deja in schema.sql pentru
-- `create_public_booking`.
--
-- `available_rooms` a mers din prima fiindca avea un grant EXPLICIT catre
-- anon, nu unul mostenit.
revoke execute on function public.expira_rezervari_neconfirmate()
  from public, anon, authenticated;
grant  execute on function public.expira_rezervari_neconfirmate()
  to service_role;

revoke execute on function public.acorda_permisiuni_facturare_implicite()
  from public, anon, authenticated;