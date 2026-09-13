-- Faza 1 (docs/faza1.md, §2.1–2.2): aplicatia nu mai incarca toate
-- rezervarile, ci o fereastra de timp, printr-o singura cerere care aduce
-- si grupurile si oaspetii rezervarilor din ea.
--
-- SECURITY INVOKER, deliberat: politicile RLS se aplica inauntru exact ca la
-- o citire directa — recepția și adminul citesc `reservations` și `guests`,
-- camerista primește doar vederea `rezervari_ocupare` (fara nume, fara
-- preturi, fara guest_code) si liste goale de grupuri/oaspeti.
--
-- Un singur rand JSON la iesire: plafonul PostgREST de 1.000 de randuri
-- (max-rows) numara randuri, nu elemente dintr-un jsonb, deci fereastra nu
-- poate fi taiata in tacere oricat ar creste.
--
-- p_cu_restante = true (pornirea aplicatiei) aduce si rezervarile deschise
-- cu plecarea INAINTE de fereastra — cele pe care night audit-ul trebuie sa
-- le vada oricat de vechi ar fi. Calendarul cere cu false: doar intervalul.
create or replace function pms_fereastra(p_de timestamptz, p_pana timestamptz, p_cu_restante boolean default true)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_rezultat jsonb;
begin
  if staff_role() = 'housekeeping' then
    select jsonb_build_object(
      'reservations', coalesce((select jsonb_agg(to_jsonb(r)) from rezervari_ocupare r
        where (r.checkout >= p_de and r.checkin <= p_pana)
           or (p_cu_restante and r.status in ('pending','confirmed','protocol','checkedin') and r.checkout < p_de)), '[]'::jsonb),
      'groups', '[]'::jsonb,
      'guests', '[]'::jsonb)
    into v_rezultat;
    return v_rezultat;
  end if;

  with f as (
    select * from reservations r
    where (r.checkout >= p_de and r.checkin <= p_pana)
       or (p_cu_restante and r.status in ('pending','confirmed','protocol','checkedin') and r.checkout < p_de)
  ), g as (
    select * from res_groups where id in (select group_id from f where group_id is not null)
  ), o as (
    select * from guests where id in (
      select guest_id from f where guest_id is not null
      union select main_guest_id from g where main_guest_id is not null)
  )
  select jsonb_build_object(
    'reservations', coalesce((select jsonb_agg(to_jsonb(f)) from f), '[]'::jsonb),
    'groups',       coalesce((select jsonb_agg(to_jsonb(g)) from g), '[]'::jsonb),
    'guests',       coalesce((select jsonb_agg(to_jsonb(o)) from o), '[]'::jsonb))
  into v_rezultat;
  return v_rezultat;
end $$;

revoke execute on function pms_fereastra(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function pms_fereastra(timestamptz, timestamptz, boolean) to authenticated, service_role;