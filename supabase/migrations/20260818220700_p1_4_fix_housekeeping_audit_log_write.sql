-- Corectie la P0.2: cameristele schimba statusul camerei, iar acea
-- actiune scrie SI in jurnalul de activitate (audit.push -> cheia
-- pms:log:v3 din app_state). Politica initiala le lasa doar cheia de
-- curatenie, deci propriile lor actiuni nu s-ar mai fi putut inregistra
-- in jurnal — exact invers fata de scopul unui audit trail.
drop policy "scrie app_state" on app_state;
drop policy "modifica app_state" on app_state;

create policy "scrie app_state" on app_state
  for insert to authenticated with check (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );
create policy "modifica app_state" on app_state
  for update to authenticated using (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  ) with check (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );