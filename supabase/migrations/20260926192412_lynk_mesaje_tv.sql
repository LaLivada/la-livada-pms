-- MESAJE DE BUN VENIT PE TELEVIZOARELE DIN CAMERE (Samsung LYNK Cloud).
--
-- La check-in, televizorul camerei primește un mesaj cu numele oaspetelui;
-- la check-out, mesajul dispare. Restul — ce scrie în mesaj, în ce limbă și
-- când se rescrie — e în src/lib/tv.js și supabase/functions/tv-provider.
-- Planul întreg și ce a rămas de confirmat cu contul Samsung:
-- docs/lynk-samsung.md.
--
-- Credențialele contului LYNK NU stau aici și nu ajung niciodată în browser:
-- stau în Edge Function Secrets, ca la Shelly și TTLock.

-- Un televizor, așa cum îl vede LYNK Cloud.
--
-- `room_id` e pe televizor, nu într-un tabel de legătură ca `device_rooms`:
-- un televizor stă într-o singură cameră (o cameră poate avea două, dacă se
-- mai montează unul), deci relația încape într-o coloană. Releele Shelly au
-- nevoie de tabel separat fiindcă un canal chiar servește două camere.
--
-- Nul înseamnă „descoperit, dar nemapat": sincronizarea aduce din contul
-- LYNK toate aparatele, iar adminul le leagă de camere din ecranul
-- „Televizoare". Un televizor nemapat nu primește niciodată vreun mesaj.
create table tv_devices (
  id                  text primary key,
  provider            text not null default 'lynk' check (provider in ('lynk', 'simulare')),
  provider_device_id  text not null check (length(provider_device_id) between 1 and 64),
  room_id             text references rooms(id) on delete set null,
  name                text not null check (length(name) between 1 and 60),
  model               text check (length(model) <= 60),
  enabled             boolean not null default true,
  -- Ce a răspuns ultima dată contul LYNK despre aparat (online, sursă,
  -- versiune de firmware). Formă liberă: e răspunsul furnizorului, nu
  -- structura noastră.
  last_status         jsonb,
  last_seen_at        timestamptz,
  -- CE SCRIE ACUM PE ECRAN, după știința noastră. Nu e un duplicat al
  -- jurnalului de mai jos: jurnalul spune ce s-a trimis și când, coloana
  -- asta spune ce ar trebui să se vadă în cameră chiar acum — singura
  -- întrebare pe care o pune recepția când sună un oaspete.
  last_message        text check (length(last_message) <= 500),
  last_message_at     timestamptz,
  last_reservation_id text references reservations(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_device_id)
);

create index tv_devices_room_idx on tv_devices(room_id);

-- Jurnal append-only al mesajelor. `tv_name` și `room_name` sunt ÎNGHEȚATE
-- ca text, ca la `device_commands`: un mesaj din trecut trebuie să rămână
-- lizibil și după ce televizorul a fost redenumit, mutat sau scos.
create table tv_messages (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor          text not null check (length(actor) <= 120),
  tv_id          text references tv_devices(id) on delete set null,
  tv_name        text check (length(tv_name) <= 60),
  room_name      text check (length(room_name) <= 60),
  reservation_id text references reservations(id) on delete set null,
  action         text not null check (action in ('welcome', 'clear', 'refresh', 'sync')),
  result         text not null check (result in ('ok', 'error')),
  -- Textul trimis efectiv, nu șablonul. Un șablon schimbat luna viitoare nu
  -- are voie să rescrie ce a văzut oaspetele luna trecută.
  message        text check (length(message) <= 500),
  detail         text check (length(detail) <= 500)
);

create index tv_messages_at_idx on tv_messages(at desc);

alter table tv_devices  enable row level security;
alter table tv_messages enable row level security;

-- Aceleași drepturi ca la relee: camerista nu vede și nu comandă
-- televizoarele. Nu e o restricție de principiu, e consecvență cu ecranul
-- ei, care n-are butoanele astea.
create policy "citeste televizoare" on tv_devices
  for select to authenticated using ((select is_admin()) or (select staff_role()) = 'receptionist');
create policy "admin scrie televizoare" on tv_devices
  for insert to authenticated with check ((select is_admin()));
create policy "admin modifica televizoare" on tv_devices
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin sterge televizoare" on tv_devices
  for delete to authenticated using ((select is_admin()));

-- Doar citire pentru personal. Scrie exclusiv funcția edge, cu service_role,
-- care ocolește RLS — deci nu există politică de insert pentru
-- `authenticated`, și nici de update sau delete pentru nimeni: un jurnal pe
-- care actorul îl poate rescrie nu e jurnal.
create policy "citeste mesaje tv" on tv_messages
  for select to authenticated using ((select is_admin()) or (select staff_role()) = 'receptionist');

comment on table tv_devices is
  'Televizoarele din camere, așa cum le vede contul Samsung LYNK Cloud. room_id nul = aparat descoperit la sincronizare, dar încă nemapat pe o cameră.';
comment on table tv_messages is
  'Jurnal append-only al mesajelor trimise pe televizoare. Numele televizorului și al camerei sunt înghețate ca text.';

-- `pms:tv:v1` (furnizorul, șabloanele, numele rețelei Wi-Fi) o scrie doar
-- adminul, ca `pms:access:v1` și `pms:oblio:v1`: `provider` de acolo decide
-- dacă mesajele pleacă spre televizoare reale sau spre simulare, iar
-- șabloanele sunt text care ajunge în fața oaspeților, în camerele lor.
-- ALTER, nu DROP + CREATE.
alter policy "scrie app_state" on app_state with check (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1', 'pms:tv:v1'))
  or ((select staff_role()) = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
);
alter policy "modifica app_state" on app_state using (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1', 'pms:tv:v1'))
  or ((select staff_role()) = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
) with check (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1', 'pms:tv:v1'))
  or ((select staff_role()) = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
);
alter policy "sterge app_state" on app_state using (
  (select is_admin())
  or ((select staff_role()) = 'receptionist' and key not in ('pms:access:v1', 'pms:oblio:v1', 'pms:tv:v1'))
);