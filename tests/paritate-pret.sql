-- Jumătatea SQL a contractului de preț.
--
-- Verifică faptul că `nightly_rate()` din bază produce exact aceleași
-- valori ca `nightlyRate()` din JS. Matricea de mai jos e copiată din
-- src/lib/pricing-matrice.js — dacă o modifici acolo, modific-o și aici.
--
-- De ce e nevoie de două fișiere: testele automate rulează ca `anon`,
-- iar `nightly_rate` e revocată pentru rolul anonim (intenționat — nu
-- expunem calculul de preț public). Deci verificarea SQL se rulează
-- manual, cu drepturi de administrator.
--
-- Rulare: Supabase Dashboard → SQL Editor. Strict read-only.
-- Rezultat așteptat: divergente = 0.
--
-- Context: până în 19 august 2026, 22 din 24 de combinații difereau
-- între cele două implementări (−220 … +50 lei/noapte). Site-ul public
-- cota un preț, PMS-ul înregistra altul.

with referinta(tip, adulti, copii, tarif_js) as (values
  ('tiny',1,0,280),('tiny',1,1,330),('tiny',1,2,360),
  ('tiny',2,0,300),('tiny',2,1,330),('tiny',2,2,360),
  ('tiny',3,0,380),('tiny',3,1,410),('tiny',3,2,440),
  ('tiny',4,0,460),('tiny',4,1,490),('tiny',4,2,520),
  ('loft',1,0,300),('loft',1,1,380),('loft',1,2,410),
  ('loft',2,0,350),('loft',2,1,380),('loft',2,2,410),
  ('loft',3,0,430),('loft',3,1,460),('loft',3,2,490),
  ('loft',4,0,510),('loft',4,1,540),('loft',4,2,570)
), rezultat as (
  select r.tip, r.adulti, r.copii, r.tarif_js,
         -- 20 august: în afara oricărui sezon configurat, deci se
         -- folosește tariful de bază. Dacă se adaugă un sezon peste
         -- această dată, testul trebuie mutat pe altă zi.
         nightly_rate(r.tip, date '2026-08-20', r.adulti, r.copii) as tarif_sql
  from referinta r
)
select
  count(*)                                              as cazuri,
  count(*) filter (where tarif_sql =  tarif_js)         as identice,
  count(*) filter (where tarif_sql <> tarif_js)         as divergente,
  case when count(*) filter (where tarif_sql <> tarif_js) = 0
       then 'OK — cele două implementări coincid'
       else 'ÎNCĂLCAT — vezi rândurile de mai jos'
  end                                                   as stare
from rezultat;

-- Detaliul divergențelor la tariful pe noapte, dacă există:
with referinta(tip, adulti, copii, tarif_js) as (values
  ('tiny',1,0,280),('tiny',1,1,330),('tiny',1,2,360),
  ('tiny',2,0,300),('tiny',2,1,330),('tiny',2,2,360),
  ('tiny',3,0,380),('tiny',3,1,410),('tiny',3,2,440),
  ('tiny',4,0,460),('tiny',4,1,490),('tiny',4,2,520),
  ('loft',1,0,300),('loft',1,1,380),('loft',1,2,410),
  ('loft',2,0,350),('loft',2,1,380),('loft',2,2,410),
  ('loft',3,0,430),('loft',3,1,460),('loft',3,2,490),
  ('loft',4,0,510),('loft',4,1,540),('loft',4,2,570)
)
select tip, adulti, copii, tarif_js,
       nightly_rate(tip, date '2026-08-20', adulti, copii) as tarif_sql,
       nightly_rate(tip, date '2026-08-20', adulti, copii) - tarif_js as diferenta
from referinta
where nightly_rate(tip, date '2026-08-20', adulti, copii) <> tarif_js
order by abs(nightly_rate(tip, date '2026-08-20', adulti, copii) - tarif_js) desc;


-- ====================================================================
-- AJUSTAREA ONLINE (grad de ocupare)
-- ====================================================================
--
-- Verifică a doua jumătate a contractului:
--   · online_adjustment_for_occupancy()  ↔  onlineNightAdjustmentPct()
--   · expresia de preț din stay_total()  ↔  bucla din
--     liveReservationTotalOnline()
--
-- Matricele sunt copiate din src/lib/pricing-matrice.js
-- (MATRICE_AJUSTARE și MATRICE_ROTUNJIRE). Dacă le modifici acolo,
-- modifică-le și aici.
--
-- ATENȚIE — spre deosebire de secțiunea de mai sus, aceasta NU e
-- read-only: înlocuiește temporar pragurile din online_pricing_tiers cu
-- cele de referință, ca testul să verifice formula și nu configurarea
-- curentă. Totul stă într-o tranzacție care se încheie cu ROLLBACK, deci
-- pragurile tale rămân neatinse. Rulează blocul ÎNTREG, nu pe bucăți —
-- altfel tranzacția rămâne deschisă.
--
-- Context: pe 19 august 2026, SQL dădea 403 și JS 402 pentru 350 lei la
-- +15%. `350 * 1.15` în virgulă mobilă e 402,49999999999997, deci JS
-- cobora, în timp ce `numeric` obținea exact 402,50 și urca. Un leu
-- diferență între prețul afișat pe site și cel înregistrat în PMS.

begin;

-- Pragurile de referință, nu cele configurate.
delete from online_pricing_tiers;
insert into online_pricing_tiers (id, min_occ, max_occ, adjustment_pct, sort_order) values
  ('ref1',  0,  30,  -5, 0),
  ('ref2', 30,  50,   0, 1),
  ('ref3', 50,  70,   5, 2),
  ('ref4', 70,  90,  10, 3),
  ('ref5', 90, 100,  15, 4);

-- 1. Pragul aplicat pentru un grad de ocupare dat.
with referinta(ocupare, pct_js) as (values
  (0::numeric, 0::numeric), (15, 0), (29.99, 0), (30, 0), (49.99, 0),
  (50, 5), (69.99, 5), (70, 10), (89.99, 10), (90, 15), (99.99, 15), (100, 15)
), rezultat as (
  select r.ocupare, r.pct_js,
         online_adjustment_for_occupancy(r.ocupare) as pct_sql
  from referinta r
)
select 'ajustare pe praguri'                              as verificare,
       count(*)                                           as cazuri,
       count(*) filter (where pct_sql <> pct_js)          as divergente,
       coalesce(string_agg(
         format('%s%% → SQL %s vs JS %s', ocupare, pct_sql, pct_js), ' | ')
         filter (where pct_sql <> pct_js), '—')           as detalii
from rezultat;

-- 2. Însumarea pe nopți și rotunjirea finală.
--    Fiecare rând: tarifele și ajustările nopților, plus totalul din JS.
with referinta(eticheta, tarife, ajustari, total_js) as (values
  ('350 la +15%',        array[350], array[15], 403),
  ('350 la +5%',         array[350], array[5],  368),
  ('330 la +15%',        array[330], array[15], 380),
  ('410 la +5%',         array[410], array[5],  431),
  ('350+5% si 350+10%',  array[350,350], array[5,10],  753),
  ('300+10% si 300+15%', array[300,300], array[10,15], 675),
  ('300 fara ajustare',  array[300], array[0],  300),
  ('280 la +5%',         array[280], array[5],  294)
), rezultat as (
  select r.eticheta, r.total_js,
         -- Exact expresia din stay_total.
         round((select sum(t * (100 + a) / 100.0)
                  from unnest(r.tarife, r.ajustari) as u(t, a))) as total_sql
  from referinta r
)
select 'insumare si rotunjire'                            as verificare,
       count(*)                                           as cazuri,
       count(*) filter (where total_sql <> total_js)      as divergente,
       coalesce(string_agg(
         format('%s: SQL %s vs JS %s', eticheta, total_sql, total_js), ' | ')
         filter (where total_sql <> total_js), '—')       as detalii
from rezultat;

-- Nimic nu se salvează: pragurile tale rămân cum erau.
rollback;
