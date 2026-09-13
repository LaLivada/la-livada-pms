-- Lista fișelor, pentru ecranul „Fișe" din Clienți.
--
-- Fără `semnatura_svg`: e de departe cel mai mare câmp din rând (~800 de
-- caractere de desen) și nu se vede în listă, doar când deschizi o fișă
-- anume. La câteva sute de fișe ar fi însemnat sute de kilobytes trimiși
-- degeaba la fiecare intrare în ecran. `are_semnatura` păstrează singurul
-- lucru care contează în listă: dacă există sau nu.
--
-- `security_invoker = true`, spre deosebire de `rezervari_ocupare`: aici
-- vederea NU trebuie să treacă peste RLS, ci exact invers — cine o citește
-- e chiar cel care are deja voie la tabel (admin/recepție, politica
-- `receptia citeste fise`). Camerista nu ajunge nici la una, nici la alta.
create view fise_cazare_lista
with (security_invoker = true) as
select f.id,
       f.reservation_id,
       f.ordine,
       f.nume,
       f.prenume,
       f.semnat_la,
       f.completata_de,
       f.anulata_la,
       f.anulata_de,
       f.anulata_motiv,
       f.fara_semnatura_motiv,
       f.semnatura_svg is not null as are_semnatura
from fise_cazare f;

revoke all on fise_cazare_lista from public, anon;
grant select on fise_cazare_lista to authenticated;