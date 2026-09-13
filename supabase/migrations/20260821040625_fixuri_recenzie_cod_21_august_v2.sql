drop policy if exists "sterge folio_items" on folio_items;
create policy "sterge folio_items" on folio_items for delete to authenticated
  using (has_billing_permission('create_invoice') and invoiced_status <> 'invoiced');

drop policy if exists "sterge folio" on folios;
create policy "sterge folio" on folios for delete to authenticated
  using (is_admin());

drop policy if exists "sterge linii factura" on invoice_items;
create policy "sterge linii factura" on invoice_items for delete to authenticated
  using (is_admin());

drop policy if exists "sterge linkuri factura" on invoice_item_links;
create policy "sterge linkuri factura" on invoice_item_links for delete to authenticated
  using (is_admin());
