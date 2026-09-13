-- Suprascrierea manuala se extinde la boilere (13 septembrie 2026): boilerul
-- din CT3 pornit de mana era stins de automatizare la fiecare 10 minute,
-- fiindca mecanismul exista doar pentru iluminat_exterior.
-- `pornit` = starea comandata de om. `until` devine optional: la boiler nu
-- exista o „urmatoare tranzitie" naturala, deci suprascrierea tine pana cand
-- regula ar decide oricum aceeasi stare (functia edge sterge randul atunci).
alter table device_automation_override
  add column pornit boolean not null default true,
  alter column until drop not null;

comment on table device_automation_override is
  'Comanda manuala care tine automatizarea la distanta de un releu (boiler sau iluminat exterior). pornit = starea ceruta de om; until = capat in timp (doar la lumini: urmatorul rasarit/apus), null la boiler. Randul se sterge cand regula ar decide oricum aceeasi stare. Scris doar de functia edge device-provider.';