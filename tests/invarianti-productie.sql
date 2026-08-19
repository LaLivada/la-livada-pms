-- Verificarea invarianților de business pe datele REALE din baza.
--
-- Testele din src/invarianti.property.test.js verifică regulile pe date
-- generate; fișierul acesta le verifică pe ce chiar există în producție.
-- Sunt complementare: primele prind un calcul greșit înainte să ajungă în
-- bază, acesta prinde date deja stricate (dintr-un import, dintr-un bug
-- vechi, dintr-o intervenție manuală în SQL).
--
-- Rulare: Supabase Dashboard → SQL Editor, sau `supabase db execute`.
-- Este STRICT read-only — poate fi rulat oricând, inclusiv în producție.
--
-- Rezultatul așteptat: toate rândurile cu stare = 'OK'. Orice 'ÎNCĂLCAT'
-- înseamnă date care contrazic o regulă pe care restul aplicației o
-- presupune adevărată — de investigat înainte de orice altceva.

with verificari as (
  -- Cel mai important invariant al facturării: sumele defalcate trebuie
  -- să se adune exact la totalul scris pe factură.
  select 'Facturi: total = baza + TVA' as invariant,
         count(*) filter (where round(subtotal_net + subtotal_vat, 2) <> round(total_amount, 2)) as incalcari,
         count(*) as randuri_verificate
  from invoices

  union all
  select 'Linii factura: total = baza + TVA',
         count(*) filter (where round(net_amount + vat_amount, 2) <> round(total_amount, 2)), count(*)
  from invoice_items

  union all
  select 'Linii folio: total = baza + TVA',
         count(*) filter (where round(net_amount + vat_amount, 2) <> round(total_amount, 2)), count(*)
  from folio_items

  -- paid_amount e recalculat de trigger din suma plăților; dacă depășește
  -- totalul, ori s-a înregistrat o plată în plus, ori triggerul n-a rulat.
  union all
  select 'Facturi: incasat <= total',
         count(*) filter (where paid_amount > total_amount + 0.01), count(*)
  from invoices

  -- Dublat de constrângerea CHECK din schema; verificat și aici pentru
  -- cazul în care cineva ar dezactiva-o vreodată.
  union all
  select 'Rezervari: plecarea dupa sosire',
         count(*) filter (where checkout <= checkin), count(*)
  from reservations

  union all
  select 'Rezervari: sume nenegative',
         count(*) filter (where coalesce(price_override, 0) < 0 or coalesce(booked_price, 0) < 0), count(*)
  from reservations

  union all
  select 'Plati: suma pozitiva',
         count(*) filter (where amount <= 0), count(*)
  from payments

  -- Dublat de constrângerea UNIQUE(series, number); dacă apare aici,
  -- înseamnă că numerotarea a fost ocolită cumva.
  union all
  select 'Numerotare facturi: fara duplicate in serie',
         (select count(*) from (
            select series, number from invoices
            where series is not null
            group by series, number having count(*) > 1) d),
         count(*)
  from invoices

  -- Suprarezervarea e blocată de constrângerea GiST `fara_suprapunere`.
  -- Verificăm că nu există totuși perechi suprapuse — dacă apar, fie
  -- constrângerea a fost ștearsă, fie datele au intrat înainte de ea.
  union all
  select 'Camere: nicio suprapunere intre rezervari active',
         (select count(*) from reservations a join reservations b
            on a.room_id = b.room_id and a.id < b.id
           where a.status not in ('cancelled','noshow')
             and b.status not in ('cancelled','noshow')
             and tstzrange(a.checkin, a.checkout, '[)') && tstzrange(b.checkin, b.checkout, '[)')),
         count(*)
  from reservations

  -- Constrângerea însăși trebuie să existe: o migrare viitoare ar putea
  -- s-o scape, iar pierderea ei nu s-ar vedea până la prima suprapunere.
  union all
  select 'Constrangerea fara_suprapunere exista',
         case when exists (
           select 1 from pg_constraint where conname = 'fara_suprapunere'
         ) then 0 else 1 end,
         1
)
select invariant,
       randuri_verificate,
       incalcari,
       case when incalcari = 0 then 'OK' else 'ÎNCĂLCAT' end as stare
from verificari
order by incalcari desc, invariant;
