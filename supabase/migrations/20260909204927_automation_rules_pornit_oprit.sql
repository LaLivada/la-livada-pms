-- Fiecare regula automata se poate opri separat, din ecranul Automatizari.
-- O regula oprita NU mai comanda nimic, dar nu stinge ce a pornit deja:
-- releele raman unde sunt, sub control manual.
create table automation_rules (
  key        text primary key
               check (key in ('preincalzire_boiler', 'lumini_exterioare', 'anti_legionella')),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into automation_rules (key) values
  ('preincalzire_boiler'), ('lumini_exterioare'), ('anti_legionella');

alter table automation_rules enable row level security;

-- Citire pentru personal (recepția trebuie sa vada de ce s-a pornit sau nu
-- boilerul), scriere doar pentru admin — oprirea unei reguli e configurare,
-- nu operare; recepția are deja comanda manuala si suprascrierea de lumini.
create policy "citeste reguli automate" on automation_rules
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "admin modifica reguli automate" on automation_rules
  for update to authenticated using (is_admin()) with check (is_admin());

comment on table automation_rules is
  'Pornit/oprit per regula automata. Oprita = nu mai comanda; nu stinge releele deja pornite.';
