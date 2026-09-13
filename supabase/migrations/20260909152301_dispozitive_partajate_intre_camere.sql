-- Un canal Shelly poate servi DOUA camere, nu una.
--
-- Montajul real: camerele sunt grupate cate doua in jurul unei camere
-- tehnice, iar in fiecare camera tehnica sta un Shelly Pro 4PM. Cele patru
-- canale ale lui se impart asa:
--   canal boiler            -> ambele camere ale perechii
--   canal iluminat exterior -> ambele camere ale perechii
--   canal prize             -> doar prima camera
--   canal prize             -> doar a doua camera
--
-- `devices.room_id` presupunea o singura camera per dispozitiv, ceea ce ar
-- fi ascuns tocmai partea periculoasa: cine opreste boilerul lui 1001 il
-- opreste si lui 1002. Relatia devine multi-la-multi, ca partajarea sa fie
-- un fapt din schema, nu o conventie tinuta minte de cineva.

alter table devices drop column room_id;

create table device_rooms (
  device_id text not null references devices(id) on delete cascade,
  room_id   text not null references rooms(id)   on delete cascade,
  primary key (device_id, room_id)
);

create index device_rooms_room_idx on device_rooms(room_id);

alter table device_rooms enable row level security;

create policy "citeste legaturi dispozitiv-camera" on device_rooms
  for select to authenticated
  using (is_admin() or staff_role() = 'receptionist');

create policy "admin leaga dispozitive de camere" on device_rooms
  for insert to authenticated with check (is_admin());

create policy "admin dezleaga dispozitive de camere" on device_rooms
  for delete to authenticated using (is_admin());

-- `kind` inseamna acum CE COMANDA canalul, nu ce tip de componenta Shelly
-- e. Toate cele patru canale sunt switch-uri din perspectiva API-ului, deci
-- tipul componentei n-ar distinge nimic; functia, in schimb, decide ce scrie
-- interfata si ce avertisment arata. Daca apare vreodata o rulou (cover),
-- atunci se adauga o coloana separata pentru tipul componentei.
alter table devices drop constraint devices_kind_check;
alter table devices alter column kind drop default;
alter table devices add constraint devices_kind_check
  check (kind in ('boiler', 'iluminat_exterior', 'prize', 'altul'));

-- Jurnalul ingheata NUMELE camerelor atinse, nu un id: un dispozitiv
-- partajat atinge doua camere, iar o comanda din trecut trebuie sa ramana
-- lizibila si dupa ce camera a fost redenumita sau stearsa.
alter table device_commands drop column room_id;
alter table device_commands add column rooms text
  check (length(rooms) <= 120);

comment on table device_rooms is
  'Ce camere sunt servite de fiecare canal. Doua randuri pentru un canal partajat (boiler, iluminat exterior), unul pentru un canal dedicat (prize).';