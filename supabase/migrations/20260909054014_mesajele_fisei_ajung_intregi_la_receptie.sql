-- Cele patru mesaje de aici sunt scrise pentru om, în română, tocmai ca
-- recepția să știe ce are de făcut. Cu `errcode = check_violation` nu ajungea
-- niciunul: clientul traduce după COD (vezi src/lib/errors.js), iar 23514
-- înseamnă „Datele introduse nu respectă o regulă de validare" — adevărat și
-- complet nefolositor.
--
-- S-a văzut pe 9 septembrie 2026: la ștergerea unei rezervări cu fișă
-- semnată, recepția a primit exact acel text generic, deși aici scria
-- „O fisa de cazare nu se sterge. Anuleaz-o."
--
-- P0001 e codul pe care `errors.js` îl lasă să treacă neatins, exact pentru
-- mesajele noastre. Nimic nu prindea `check_violation` de aici: trigger-ul e
-- `before update or delete`, iar singurul catch pe codul ăla,
-- din `guest_fisa_semneaza`, e pe INSERT.
create or replace function fise_cazare_doar_anulare()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  vechi jsonb;
  nou   jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Rezervarea are fișă de cazare semnată, iar o fișă nu se șterge. Anuleaz-o întâi din Documente, apoi șterge rezervarea.';
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