-- Pe langa grantul implicit catre PUBLIC (revocat in migrarea anterioara),
-- Supabase acorda si un grant NOMINAL catre `anon` la crearea functiei.
-- Trebuie revocate amandoua ca sa dispara accesul.
--
-- Nimic nu se strica: helperele de permisiuni sunt folosite doar in
-- politicile RLS pentru `authenticated` si de functiile security definer
-- (care ruleaza ca proprietar, deci nu depind de grantul apelantului).
-- Functia edge anaf-lookup apeleaza has_billing_permission cu JWT-ul
-- userului logat, deci tot ca `authenticated`.
revoke execute on function is_admin() from anon;
revoke execute on function has_billing_permission(text) from anon;
revoke execute on function next_invoice_number(text) from anon;
revoke execute on function next_receipt_number(text) from anon;

-- Raman public apelabile DOAR cele doua functii gandite ca atare:
-- available_rooms (cautare disponibilitate) si create_booking (rezervare
-- de pe site), ambele cu limitele lor proprii.