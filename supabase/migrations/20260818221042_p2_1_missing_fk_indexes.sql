-- P2.1 — indecsi pentru cheile straine descoperite fara acoperire.
-- La volumul de azi (zeci-sute de randuri) nu se simte; conteaza cand
-- se aduna istoric de facturi si rezervari pe luni. Se adauga acum, cat
-- tabelele sunt mici si crearea e instantanee.
create index if not exists accounting_exports_created_by   on accounting_exports (created_by);
create index if not exists billing_permissions_granted_by  on billing_permissions (granted_by);
create index if not exists folio_items_created_by          on folio_items (created_by);
create index if not exists folio_items_product             on folio_items (product_id);
create index if not exists invoice_items_product           on invoice_items (product_id);
create index if not exists invoices_created_by             on invoices (created_by);
create index if not exists invoices_credit_note_of         on invoices (credit_note_of);
create index if not exists invoices_issued_by              on invoices (issued_by);
create index if not exists payments_created_by             on payments (created_by);
create index if not exists products_vat_rate               on products (vat_rate_id);
create index if not exists res_groups_main_guest           on res_groups (main_guest_id);
create index if not exists reservations_billing_customer   on reservations (billing_customer_id);
create index if not exists reservations_group              on reservations (group_id);
create index if not exists reservations_guest              on reservations (guest_id);