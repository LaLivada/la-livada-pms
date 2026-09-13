-- Anti-legionela: cadenta de 10 zile per boiler. `last_run_on` e o DATA
-- locala (Europe/Bucharest), nu un timestamp — cadenta se compara in zile,
-- nu in ore, vezi reguli-automate.ts.
create table device_legionella_runs (
  device_id   text primary key references devices(id) on delete cascade,
  last_run_on date not null,
  updated_at  timestamptz not null default now()
);

-- Suprascrierea manuala a automatizarii de lumini exterioare: cat timp
-- `until` e in viitor, ciclul de reconciliere sare peste dispozitivul asta.
-- Doar iluminat_exterior foloseste tabelul asta — boilerul n-a primit acest
-- mecanism (nu a fost cerut).
create table device_automation_override (
  device_id  text primary key references devices(id) on delete cascade,
  until      timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table device_legionella_runs    enable row level security;
alter table device_automation_override enable row level security;

-- Doar citire pentru personal, la fel ca device_commands — scrierea o face
-- exclusiv functia edge, prin service_role, care ocoleste RLS.
create policy "citeste rulari legionela" on device_legionella_runs
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste override automatizare" on device_automation_override
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

comment on table device_legionella_runs is
  'Cadenta anti-legionela per boiler: ultima zi (locala) in care ciclul 11:00-14:00 chiar a pornit boilerul.';
comment on table device_automation_override is
  'Suprascriere manuala a automatizarii de iluminat exterior, valabila pana la urmatoarea tranzitie rasarit/apus.';
