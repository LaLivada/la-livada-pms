-- Faza 0 din docs/audit-2026-09.md: A4 (indexuri), A5 (politici ca
-- initplan), B7 (create_booking), extensii in afara schemei public.

-- A4. Indexurile pe care le vor folosi interogarile pe fereastra de timp
-- (faza 1), cardul „De pe site" (created_at desc) si potrivirea
-- oaspetilor dupa telefon — create_public_booking cauta cu
-- lower(phone) = lower(trim(p_phone)), deci indexul e pe lower(phone).
-- Ultimele trei sunt cheile straine semnalate de advisorul Supabase.
create index if not exists reservations_status      on reservations (status);
create index if not exists reservations_checkin     on reservations (checkin);
create index if not exists reservations_checkout    on reservations (checkout);
create index if not exists reservations_created_at  on reservations (created_at desc);
create index if not exists guests_phone_lower       on guests (lower(phone));
create index if not exists activity_log_user_id     on activity_log (user_id);
create index if not exists fise_cazare_guest_id     on fise_cazare (guest_id);
create index if not exists public_bookings_group_id on public_bookings (group_id);

-- A5. Toate politicile care mai chemau is_admin() / staff_role() /
-- has_billing_permission() pe fiecare rand sunt rescrise cu apelul
-- invelit in (select ...): Postgres il evalueaza o singura data pe
-- interogare (initplan), nu o data pe rand. Aceeasi transformare pe care
-- migratia din 8 septembrie (politici_citire_ca_initplan_nu_pe_rand) a
-- facut-o doar pentru SELECT pe patru tabele. Lookbehind-ul sare peste
-- ce era deja invelit — deparsat de pg_policies ca „( SELECT is_admin() …".
do $$
declare r record;
begin
  for r in
    select format('alter policy %I on %I%s%s', policyname, tablename,
      case when q2 is not null then ' using (' || q2 || ')' else '' end,
      case when w2 is not null then ' with check (' || w2 || ')' else '' end) stmt
    from (
      select tablename, policyname, qual, with_check,
        regexp_replace(qual,       '(?<!SELECT )(is_admin\(\)|staff_role\(\)|has_billing_permission\([^)]*\))', '(select \1)', 'g') q2,
        regexp_replace(with_check, '(?<!SELECT )(is_admin\(\)|staff_role\(\)|has_billing_permission\([^)]*\))', '(select \1)', 'g') w2
      from pg_policies where schemaname = 'public'
    ) p
    where q2 is distinct from qual or w2 is distinct from with_check
  loop
    execute r.stmt;
  end loop;
end $$;

-- Doua politici permissive de INSERT pe invoices se evaluau amandoua la
-- fiecare inserare; una singura, cu OR intre ele, inseamna exact acelasi
-- lucru (advisor: multiple_permissive_policies).
drop policy "creeaza draft factura" on invoices;
drop policy "creeaza nota de credit" on invoices;
create policy "creeaza factura sau nota de credit" on invoices for insert to authenticated
  with check (
    ((select has_billing_permission('create_invoice')) and status = 'draft')
    or ((select has_billing_permission('create_credit_note'))
        and credit_note_of is not null and status = 'issued')
  );

-- B7. create_booking e drumul vechi, inlocuit de create_public_booking
-- prin functia edge; nicio aplicatie n-o mai apeleaza (zero referinte in
-- src/ si in supabase/functions/). service_role ramane.
revoke execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) from authenticated;

-- Extensii in afara schemei public (advisor extension_in_public).
-- btree_gist e relocatabila; constrangerea fara_suprapunere isi refera
-- clasa de operatori prin OID, deci ramane valida. pg_net NU e
-- relocatabila (extrelocatable = false) si ramane in public.
alter extension btree_gist set schema extensions;