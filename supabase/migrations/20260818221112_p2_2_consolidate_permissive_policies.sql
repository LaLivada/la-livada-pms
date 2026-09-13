-- P2.2 — fiecare tabel avea o politica "citeste" (select) SI una "scrie"
-- (for all, deci acoperind si select). Postgres le evalua pe amandoua la
-- fiecare citire. Politicile "scrie" devin explicit insert/update/delete,
-- fara select — aceleasi drepturi, o singura evaluare pe citire.
--
-- Se pastreaza expresiile existente neschimbate; singura modificare de
-- fond e la staff, unde cele doua politici de select se unifica intr-una.

-- accounting_exports
drop policy "scrie exporturi" on accounting_exports;
create policy "scrie exporturi" on accounting_exports for insert to authenticated
  with check (has_billing_permission('export_accounting'));
create policy "modifica exporturi" on accounting_exports for update to authenticated
  using (has_billing_permission('export_accounting')) with check (has_billing_permission('export_accounting'));
create policy "sterge exporturi" on accounting_exports for delete to authenticated
  using (has_billing_permission('export_accounting'));

-- billing_customers
drop policy "scrie clienti facturare" on billing_customers;
create policy "scrie clienti facturare" on billing_customers for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica clienti facturare" on billing_customers for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge clienti facturare" on billing_customers for delete to authenticated
  using (has_billing_permission('create_invoice'));

-- billing_permissions
drop policy "scrie permisiuni facturare" on billing_permissions;
drop policy "citeste permisiuni facturare" on billing_permissions;
create policy "citeste permisiuni facturare" on billing_permissions for select to authenticated
  using (is_admin() or user_id = (select auth.uid()));
create policy "scrie permisiuni facturare" on billing_permissions for insert to authenticated
  with check (is_admin());
create policy "modifica permisiuni facturare" on billing_permissions for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "sterge permisiuni facturare" on billing_permissions for delete to authenticated
  using (is_admin());

-- folios / folio_items
drop policy "scrie folio" on folios;
create policy "scrie folio" on folios for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica folio" on folios for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge folio" on folios for delete to authenticated
  using (has_billing_permission('create_invoice'));

drop policy "scrie folio_items" on folio_items;
create policy "scrie folio_items" on folio_items for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica folio_items" on folio_items for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge folio_items" on folio_items for delete to authenticated
  using (has_billing_permission('create_invoice'));

-- invoice_items / invoice_item_links
drop policy "scrie linii factura" on invoice_items;
create policy "scrie linii factura" on invoice_items for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica linii factura" on invoice_items for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge linii factura" on invoice_items for delete to authenticated
  using (has_billing_permission('create_invoice'));

drop policy "scrie linkuri factura" on invoice_item_links;
create policy "scrie linkuri factura" on invoice_item_links for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica linkuri factura" on invoice_item_links for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge linkuri factura" on invoice_item_links for delete to authenticated
  using (has_billing_permission('create_invoice'));

-- payments
drop policy "scrie plati" on payments;
create policy "scrie plati" on payments for insert to authenticated
  with check (has_billing_permission('record_payment'));
create policy "modifica plati" on payments for update to authenticated
  using (has_billing_permission('record_payment')) with check (has_billing_permission('record_payment'));
create policy "sterge plati" on payments for delete to authenticated
  using (has_billing_permission('record_payment'));

-- Nomenclatoare administrate doar de admin.
drop policy "scrie serii" on invoice_series;
create policy "scrie serii" on invoice_series for insert to authenticated with check (is_admin());
create policy "modifica serii" on invoice_series for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge serii" on invoice_series for delete to authenticated using (is_admin());

drop policy "scrie serie chitante" on receipt_series;
create policy "scrie serie chitante" on receipt_series for insert to authenticated with check (is_admin());
create policy "modifica serie chitante" on receipt_series for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge serie chitante" on receipt_series for delete to authenticated using (is_admin());

drop policy "scrie tva" on vat_rates;
create policy "scrie tva" on vat_rates for insert to authenticated with check (is_admin());
create policy "modifica tva" on vat_rates for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge tva" on vat_rates for delete to authenticated using (is_admin());

drop policy "scrie produse" on products;
create policy "scrie produse" on products for insert to authenticated with check (is_admin());
create policy "modifica produse" on products for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge produse" on products for delete to authenticated using (is_admin());

drop policy "scrie metode plata" on payment_methods;
create policy "scrie metode plata" on payment_methods for insert to authenticated with check (is_admin());
create policy "modifica metode plata" on payment_methods for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge metode plata" on payment_methods for delete to authenticated using (is_admin());

-- online_pricing_tiers: scriere doar admin, ca la restul configurarii de
-- preturi (rates/seasons) — inainte era deschisa oricui autentificat.
drop policy "staff scrie" on online_pricing_tiers;
create policy "scrie tiere pret" on online_pricing_tiers for insert to authenticated with check (is_admin());
create policy "modifica tiere pret" on online_pricing_tiers for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge tiere pret" on online_pricing_tiers for delete to authenticated using (is_admin());

-- staff: doua politici de select (propriul rand + admin vede tot) se
-- unifica intr-una. (select auth.uid()) se evalueaza o data pe query,
-- nu o data pe rand.
drop policy "vede propriul rand" on staff;
drop policy "admin vede tot staff" on staff;
create policy "vede staff" on staff for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());