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

-- Detaliul divergențelor, dacă există:
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
