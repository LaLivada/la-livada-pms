-- Mesajul de dinainte spunea „anuleaz-o întâi, apoi șterge rezervarea".
-- E fals, și l-am verificat abia după ce-l scrisesem: prima ramură de mai
-- jos respinge ORICE ștergere de fișă, anulată sau nu. Deci o rezervare cu
-- fișă nu se șterge niciodată — și nici n-ar trebui, fișa e document legal,
-- iar `on delete cascade` ar duce-o cu ea. Drumul care chiar funcționează e
-- statusul „Anulată".
create or replace function fise_cazare_doar_anulare()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  vechi jsonb;
  nou   jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Rezervarea are fișă de cazare, deci nu poate fi ștearsă — o fișă nu se șterge niciodată, nici anulată. Pune-i statusul pe „Anulată”: eliberează camera și dispare de pe calendar, dar rămâne în evidență.';
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