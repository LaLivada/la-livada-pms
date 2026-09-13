-- `pms:access:v1` ține setările yalelor: codeLength (lungimea codului de
-- ușă) și graceMinutes (cât mai merge ușa după ora plecării). Cu politica
-- veche, orice recepționer le putea rescrie printr-o cerere directă —
-- codeLength la 1 face codurile de ușă ghicibile din a zecea încercare.
-- Cheia nu e scrisă din interfață de nimeni (verificat: doar citită, în
-- features/acces.jsx și în cele două funcții edge), deci restricția nu
-- schimbă niciun flux de lucru.
drop policy "scrie app_state"    on app_state;
drop policy "modifica app_state" on app_state;
drop policy "sterge app_state"   on app_state;

create policy "scrie app_state" on app_state
  for insert to authenticated with check (
    is_admin()
    or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );

create policy "modifica app_state" on app_state
  for update to authenticated using (
    is_admin()
    or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  ) with check (
    is_admin()
    or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );

create policy "sterge app_state" on app_state
  for delete to authenticated using (
    is_admin() or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
  );