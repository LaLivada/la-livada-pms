-- O SINGURĂ LINIE DE CAZARE PE FOLIO (26 septembrie 2026).
--
-- Linia de cazare o scrie aplicația (ensureCazareLine, în
-- src/features/facturare/emitere.jsx) la fiecare încărcare a folio-ului:
-- o creează dacă lipsește, o actualizează dacă s-au schimbat perioada sau
-- prețul. Până azi, o linie nouă primea un id tras la întâmplare, iar două
-- încărcări simultane care n-o găseau încă scriau fiecare câte una. Pe
-- 26.09 la 14:58 UTC, după un check-in, panoul folio s-a încărcat de două
-- ori la 150 ms distanță (a doua oară la reîncărcarea lui `core` după
-- reconectarea Realtime) → 2 × 300 lei pe folio-ul camerei 1012. La fel pe
-- 13 și 14 septembrie. Panoul arăta o singură linie, aleasă la întâmplare,
-- deci după facturarea uneia cealaltă ar fi rămas „nefacturată" și cazarea
-- s-ar fi putut factura a doua oară.
--
-- Aplicația folosește de azi un id dat de folio (`cazare-<folio>`), deci
-- două scrieri simultane cad pe același rând. Indexul de mai jos ține
-- regula și în bază, pentru orice altă cale; o scriere respinsă de el
-- (23505) e recitită de aplicație, nu arătată omului.
--
-- Dublurile existente se șterg întâi, altfel indexul nu s-ar crea. Rămâne
-- linia creată prima; se șterge doar o dublură nefacturată și nelegată de
-- vreo factură (dacă ar exista alta, indexul pică și migrația se oprește
-- întreagă, fără să atingă ceva facturat). La 26.09 erau exact trei, toate
-- identice cu perechea lor, nefacturate, fără nicio legătură de factură:
--   m9svqrqg  folio raqa9itg (rezervarea 0fipa0od, camera 1012)  creată 2026-09-26 14:58:24.574468+00
--   ux6y9yzo  folio h080p2hy (rezervarea ooq21w6v, camera 1004)  creată 2026-09-14 00:06:12.502789+00
--   r6wtz7k0  folio 2o4p1jnh (rezervarea 4seocjf0, camera 1005)  creată 2026-09-13 23:01:42.743372+00
-- Toate: product_id prod-cazare, „Cazare", 1 × 300, TVA 11%, net 270.27,
-- TVA 29.73, total 300, occurred_at = sosirea rezervării.
delete from folio_items d
using folio_items k
where d.category = 'cazare'
  and k.category = 'cazare'
  and k.folio_id = d.folio_id
  and (k.created_at, k.id) < (d.created_at, d.id)
  and d.invoiced_status = 'uninvoiced'
  and not exists (select 1 from invoice_item_links l where l.folio_item_id = d.id);

create unique index folio_items_o_cazare_pe_folio
  on folio_items (folio_id) where category = 'cazare';