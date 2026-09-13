create or replace function staff_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from staff where user_id = auth.uid();
$$;

drop policy "staff scrie" on reservations;
create policy "scrie rezervari" on reservations
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica rezervari" on reservations
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
create policy "sterge rezervari" on reservations
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

drop policy "staff scrie" on guests;
create policy "scrie oaspeti" on guests
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica oaspeti" on guests
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
create policy "sterge oaspeti" on guests
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

drop policy "staff scrie" on res_groups;
create policy "scrie grupuri" on res_groups
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica grupuri" on res_groups
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
create policy "sterge grupuri" on res_groups
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

drop policy "staff scrie" on rooms;
create policy "scrie camere" on rooms
  for insert to authenticated with check (is_admin());
create policy "modifica camere" on rooms
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge camere" on rooms
  for delete to authenticated using (is_admin());

drop policy "staff scrie" on rates;
create policy "scrie tarife" on rates
  for insert to authenticated with check (is_admin());
create policy "modifica tarife" on rates
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge tarife" on rates
  for delete to authenticated using (is_admin());

drop policy "staff scrie" on seasons;
create policy "scrie sezoane" on seasons
  for insert to authenticated with check (is_admin());
create policy "modifica sezoane" on seasons
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge sezoane" on seasons
  for delete to authenticated using (is_admin());

drop policy "staff app_state" on app_state;
create policy "citeste app_state" on app_state
  for select to authenticated using (true);
create policy "scrie app_state" on app_state
  for insert to authenticated with check (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key = 'pms:housekeeping:v3')
  );
create policy "modifica app_state" on app_state
  for update to authenticated using (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key = 'pms:housekeeping:v3')
  ) with check (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key = 'pms:housekeeping:v3')
  );
create policy "sterge app_state" on app_state
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');