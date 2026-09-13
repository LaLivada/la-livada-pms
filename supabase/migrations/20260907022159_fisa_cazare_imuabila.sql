-- Documentul nu se poate schimba dupa semnare. Fara trigger, „imuabil" e o
-- promisiune, nu o proprietate — iar la un control conteaza proprietatea.
--
-- Anularea e SINGURA trecere permisa, si e scrisa ca un caz anume, nu ca o
-- portita: daca triggerul ar lasa orice update „doar pentru anulare", n-ar
-- mai apara nimic.
create or replace function fise_cazare_doar_anulare()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  vechi jsonb;
  nou   jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'O fisa de cazare nu se sterge. Anuleaz-o.'
      using errcode = 'check_violation';
  end if;

  if old.anulata_la is not null then
    raise exception 'Fisa e deja anulata si nu se mai modifica.'
      using errcode = 'check_violation';
  end if;

  -- `to_jsonb` minus cele trei coloane, pe ambele randuri. Comparatia ramane
  -- corecta si dupa ce cineva adauga o coloana noua tabelului — o lista
  -- scrisa de mana ar fi uitat-o, si exact aia ar fi devenit portita.
  vechi := to_jsonb(old) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';
  nou   := to_jsonb(new) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';

  if vechi is distinct from nou then
    raise exception 'O fisa de cazare semnata nu se modifica. Anuleaz-o si scrie alta.'
      using errcode = 'check_violation';
  end if;

  if new.anulata_la is null then
    raise exception 'Singura modificare permisa e anularea.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger fise_cazare_imuabila
  before update or delete on fise_cazare
  for each row execute function fise_cazare_doar_anulare();

revoke execute on function fise_cazare_doar_anulare()
  from public, anon, authenticated;