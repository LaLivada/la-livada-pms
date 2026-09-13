-- ---------------------------------------------------------------------
-- DISPOZITIVE (relee Shelly și, în viitor, alți furnizori)
--
-- Un rând per CANAL, nu per dispozitiv fizic: un Shelly Pro 4PM are patru
-- relee independente, care pot alimenta patru lucruri diferite, în camere
-- diferite. Modelul pe canal e singurul care poate exprima asta.
--
-- `provider` + `provider_device_id`, nu `shelly_id`: exact tiparul deja
-- validat de `access_codes.provider` pentru TTLock. Un al doilea brand de
-- relee nu cere nici tabel paralel, nici migrare.
--
-- FĂRĂ `hotel_id`, spre deosebire de planul din docs/shelly-integration.md:
-- planul acela presupunea multi-tenant (tabel `hotels`, `staff.hotel_id`),
-- care nu există în baza asta și nu e cerut. Credențialele Shelly stau în
-- Edge Function Secrets, ca la TTLock. Dacă apare vreodată al doilea hotel,
-- se adaugă coloana atunci — nu construiesc pentru un viitor ipotetic.
create table devices (
  id                 text primary key,
  -- nullable: un dispozitiv poate exista înainte de a fi montat într-o
  -- cameră. `set null`, nu `cascade`: ștergerea unei camere nu trebuie să
  -- șteargă istoricul comenzilor de pe releul ei.
  room_id            text references rooms(id) on delete set null,
  provider           text not null default 'shelly',
  provider_device_id text not null check (length(provider_device_id) between 1 and 64),
  -- Decide ce API Shelly se folosește. Pro 4PM e Gen2; Gen1 (Shelly 2.5)
  -- ar cere API-ul v1, deprecat — de aceea coloana există de la început.
  device_gen         text not null default 'gen2' check (device_gen in ('gen1','gen2')),
  device_model       text check (length(device_model) <= 60),
  kind               text not null default 'switch' check (kind in ('switch','cover','light','sensor')),
  channel            int  not null default 0 check (channel between 0 and 15),
  name               text not null check (length(name) between 1 and 60),
  enabled            boolean not null default true,
  -- Cache de status: ce a răspuns Shelly ultima dată. Ecranul citește de
  -- aici, nu de la Shelly, la fiecare deschidere.
  last_status        jsonb,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Același canal al aceluiași dispozitiv nu poate fi înregistrat de două ori.
  unique (provider, provider_device_id, channel)
);

create index devices_room on devices (room_id);

alter table devices enable row level security;

-- Citirea: admin și recepție. Camerista nu — nu are ecranul de cameră cu
-- butoane de releu, iar `rezervari_ocupare` i-a închis deja tot ce ține de
-- rezervări; un boiler nu face excepție.
create policy "citeste dispozitive" on devices
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

-- Configurarea (ce releu, ce canal, ce cameră) e a adminului. Recepția
-- doar comandă — iar comanda nu trece prin tabelul ăsta, ci prin funcția
-- edge, cu service_role.
create policy "admin scrie dispozitive" on devices
  for insert to authenticated with check (is_admin());
create policy "admin modifica dispozitive" on devices
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin sterge dispozitive" on devices
  for delete to authenticated using (is_admin());


-- ---------------------------------------------------------------------
-- JURNALUL COMENZILOR — doar cu adăugare, ca `activity_log`.
--
-- Răspunde la „cine a pornit boilerul din 1004 și când". Se scrie exclusiv
-- din funcția edge (service_role); pentru `authenticated` nu există nicio
-- politică de insert/update/delete, deci rândul nu poate fi nici fabricat,
-- nici șters din browser.
create table device_commands (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text not null check (length(actor) <= 120),
  device_id  text references devices(id) on delete set null,
  -- Numele și camera se îngheață aici, nu doar prin `device_id`: jurnalul
  -- trebuie să spună ce s-a comandat ATUNCI, chiar dacă între timp releul
  -- a fost redenumit sau mutat în altă cameră.
  device_name text check (length(device_name) <= 60),
  room_id    text,
  action     text not null check (action in ('on', 'off', 'refresh')),
  result     text not null check (result in ('ok', 'error')),
  detail     text check (length(detail) <= 500)
);

create index device_commands_moment on device_commands (at desc);
create index device_commands_dispozitiv on device_commands (device_id, at desc);

alter table device_commands enable row level security;

create policy "citeste comenzi dispozitive" on device_commands
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

-- Fără politici de insert/update/delete. Scrie doar funcția edge.