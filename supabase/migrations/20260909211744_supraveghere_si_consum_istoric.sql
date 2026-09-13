-- SUPRAVEGHEREA CICLULUI AUTOMAT.
-- Sistemul comanda relee singur la fiecare 10 minute; fara randurile astea,
-- o cadere (Shelly offline, cheie rotita, internet picat) ar trece complet
-- neobservata pana cand un oaspete suna de la dus.
create table automation_runs (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  ok         boolean not null,
  verificate int not null default 0,
  schimbate  int not null default 0,
  erori      text
);

create index automation_runs_at_idx on automation_runs(at desc);

-- ISTORICUL DE CONSUM.
-- `total_kwh` e ODOMETRUL contorului (energie cumulata de cand e montat), nu
-- consumul din intervalul asta. Consumul pe o perioada se obtine scazand doua
-- citiri — mult mai exact decat daca am integra noi puterea instantanee din
-- zece in zece minute, fiindca intre doua citiri de-ale noastre incap varfuri
-- pe care nu le-am vedea, dar pe care contorul le-a numarat oricum.
-- `putere_kw` e instantaneul din acelasi raspuns, pastrat pentru un grafic.
create table energy_readings (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  total_kwh  numeric not null,
  putere_kw  numeric
);

create index energy_readings_at_idx on energy_readings(at desc);

alter table automation_runs  enable row level security;
alter table energy_readings  enable row level security;

-- Doar citire pentru personal; scrie exclusiv functia edge prin service_role.
create policy "citeste rulari automatizare" on automation_runs
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste citiri contor" on energy_readings
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

comment on table automation_runs is
  'Rezultatul fiecarei rulari a ciclului automat, ca sa se vada daca mai functioneaza.';
comment on column energy_readings.total_kwh is
  'Odometrul contorului (energie cumulata), NU consumul intervalului. Consumul pe perioada = diferenta a doua citiri.';
