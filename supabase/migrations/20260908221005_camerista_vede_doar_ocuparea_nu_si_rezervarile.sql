-- Vederea de ocupare: ce cameră e prinsă în ce zile, atât.
--
-- RLS filtrează RÂNDURI, nu coloane, iar tot personalul folosește același rol
-- Postgres (`authenticated`), deci nici GRANT pe coloane nu poate separa
-- camerista de recepție. Singurul mecanism care poate e o vedere care nu
-- selectează coloanele interzise.
--
-- Deliberat FĂRĂ security_invoker: vederea trebuie să treacă peste RLS-ul
-- tabelului de dedesubt (care de acum e doar pentru admin/recepție) — asta e
-- chiar rostul ei. Bariera de mai jos o ține închisă: `security_barrier`
-- oprește trecerea funcțiilor de filtrare ale apelantului sub proiecție (un
-- `where pretul_scump(...)` n-are cum să vadă coloanele lipsă), iar `where`-ul
-- intern cere ca cel care întreabă să fie în `staff`.
create view rezervari_ocupare
with (security_barrier = true) as
select r.id,
       r.room_id,
       r.checkin,
       r.checkout,
       r.status,
       r.source,
       -- Motivul unui blocaj („Reparație instalație") se vede pe calendar și
       -- la cameristă, e informație de treabă. `notes` de pe o rezervare
       -- adevărată nu — acolo scrie despre oaspete.
       case when r.source = 'blocaj' then r.notes end as notes
from reservations r
where staff_role() is not null;

revoke all on rezervari_ocupare from public, anon;
grant select on rezervari_ocupare to authenticated;

-- Tabelul în sine nu se mai citește de oricine. Până acum politica era
-- `using (true)`: camerista citea numele, telefonul, notele, prețurile —
-- și `guest_code`, codul din linkul care deschide ușa. Cu el putea deschide
-- orice cameră ocupată, ocolind glisorul din ecranul ei, care e blocat
-- tocmai pe camerele ocupate.
drop policy "staff citeste" on reservations;
create policy "staff citeste" on reservations
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

-- Numele unui grup e adesea un nume de familie.
drop policy "staff citeste" on res_groups;
create policy "staff citeste" on res_groups
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

-- `pms:core:v3` ține datele de emitent ale facturii (CUI, adresă, cont);
-- `pms:access:v1` ține setările yalelor. Camerista citește doar cheia ei de
-- curățenie și cheia moartă a jurnalului — aceleași două ca la scriere.
drop policy "citeste app_state" on app_state;
create policy "citeste app_state" on app_state
  for select to authenticated using (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );