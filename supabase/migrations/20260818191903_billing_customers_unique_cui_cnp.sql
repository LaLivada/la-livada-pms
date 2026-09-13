-- Previne duplicarea clientilor de facturare cu acelasi CUI/CNP, chiar
-- daca UI-ul e ocolit (ex. request direct). Normalizeaza CUI-ul (fara
-- prefix RO, uppercase) la fel ca validateCUIFormat din front-end.
create unique index billing_customers_cui_unique
  on billing_customers (upper(regexp_replace(cui, '^(RO|ro)', '')))
  where cui is not null and cui <> '';

create unique index billing_customers_cnp_unique
  on billing_customers (cnp)
  where cnp is not null and cnp <> '';