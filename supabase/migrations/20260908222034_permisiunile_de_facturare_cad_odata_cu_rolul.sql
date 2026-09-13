-- Permisiunile de facturare erau verificate DOAR ca rânduri în
-- `billing_permissions`, fără nicio legătură cu rolul. Rândurile nu se șterg
-- la retrogradare (nici n-ar trebui — flagul
-- `permisiuni_implicite_acordate` există tocmai ca o repromovare să nu
-- reacorde tacit ce retrăsese cineva manual). Rezultatul: un recepționer
-- trecut pe „curățenie" continua să vadă facturile.
--
-- Măsurat înainte de fix, cu rolul comutat: has_billing_permission
-- ('view_invoices') = true, 1 factură, 55 de folio-uri și 91 de clienți de
-- facturare, cu nume, CUI și adresă.
--
-- Acum rândul e necesar, dar nu suficient: trebuie și rolul. Retrogradarea
-- taie accesul pe loc, repromovarea îl redă exact cum era.
create or replace function has_billing_permission(perm text)
returns boolean language sql security definer set search_path = public stable as $$
  select is_admin() or (
    staff_role() = 'receptionist'
    and exists (
      select 1 from billing_permissions
      where user_id = auth.uid() and permission = perm
    )
  );
$$;