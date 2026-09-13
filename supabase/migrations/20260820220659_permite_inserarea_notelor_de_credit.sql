-- Stornarea era imposibila: singura politica de INSERT pe invoices cere
-- status = 'draft', dar o nota de credit se naste direct 'issued' (nu e un
-- draft care se emite ulterior, e documentul care anuleaza altul). RLS
-- respingea deci fiecare incercare cu "Nu ai dreptul sa faci aceasta
-- modificare". Nu s-a observat pana pe 21 august 2026 fiindca deasupra
-- exista un al doilea defect care oprea fluxul mai devreme: seria ceruta
-- ("LIV") nu exista in invoice_series.
--
-- Politica de mai jos e deliberat ingusta: permite DOAR randuri care chiar
-- sunt note de credit (credit_note_of not null) si doar celor cu permisiunea
-- dedicata. Nu poate fi folosita ca sa se strecoare o factura obisnuita
-- direct in 'issued', ocolind fluxul draft -> emitere.
create policy "creeaza nota de credit" on invoices
  for insert to authenticated
  with check (
    has_billing_permission('create_credit_note')
    and credit_note_of is not null
    and status = 'issued'
  );

-- Numarul 7 a fost consumat de incercarea esuata de mai sus (numarul se
-- aloca inaintea inserarii, deci un insert respins il arde). Date de test,
-- deci contorul se pune la loc ca numerotarea sa ramana continua.
update invoice_series set next_number = 7 where series = 'LL';
