-- „Documente" nu există în meniu — era un ecran pe care mi l-am imaginat.
-- Fișa se anulează din secțiunea „Fișă de cazare" a rezervării, sau din
-- lista nouă Clienți → Fișe.
create or replace function fise_cazare_doar_anulare()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  vechi jsonb;
  nou   jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Rezervarea are fișă de cazare semnată, iar o fișă nu se șterge. Anuleaz-o întâi din secțiunea „Fișă de cazare" a rezervării (sau din Clienți → Fișe), apoi șterge rezervarea.';
  end if;

  if old.anulata_la is not null then
    raise exception 'Fișa e deja anulată și nu se mai modifică.';
  end if;

  -- `to_jsonb` minus cele trei coloane, pe ambele randuri. Comparatia ramane
  -- corecta si dupa ce cineva adauga o coloana noua tabelului — o lista
  -- scrisa de mana ar fi uitat-o, si exact aia ar fi devenit portita.
  vechi := to_jsonb(old) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';
  nou   := to_jsonb(new) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';

  if vechi is distinct from nou then
    raise exception 'O fișă de cazare semnată nu se modifică. Anuleaz-o și scrie alta.';
  end if;

  if new.anulata_la is null then
    raise exception 'Singura modificare permisă e anularea.';
  end if;

  return new;
end $$;