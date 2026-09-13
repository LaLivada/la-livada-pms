-- P3 — plafon de lungime pe textele libere care ajung in PDF.
--
-- Generarea PDF-ului rasterizeaza DOM-ul sincron, pe firul principal:
-- un text foarte lung (lipit din greseala, sau introdus intentionat)
-- creste pagina si poate bloca tabul cat dureaza randarea.
--
-- Plafonul se pune in baza, nu doar in formular: acopera si importul
-- iCal, si rezervarile venite de pe site, si orice request direct catre
-- API — nu doar caile pe care le stie interfata.
--
-- Valorile sunt generoase fata de realitate (maximul din datele de azi e
-- 30 de caractere), deci niciun rand existent nu e respins.
alter table guests add constraint guests_lungimi_text check (
  length(coalesce(last_name, ''))  <= 100 and
  length(coalesce(first_name, '')) <= 100 and
  length(coalesce(address, ''))    <= 300 and
  length(coalesce(city, ''))       <= 100 and
  length(coalesce(county, ''))     <= 100 and
  length(coalesce(country, ''))    <= 100 and
  length(coalesce(email, ''))      <= 200 and
  length(coalesce(phone, ''))      <= 40  and
  length(coalesce(notes, ''))      <= 2000
);

alter table reservations add constraint reservations_lungimi_text check (
  length(coalesce(notes, ''))               <= 2000 and
  length(coalesce(occupant_last_name, ''))  <= 100  and
  length(coalesce(occupant_first_name, '')) <= 100  and
  length(coalesce(occupant_phone, ''))      <= 40
);

alter table res_groups add constraint res_groups_lungimi_text check (
  length(coalesce(name, ''))  <= 200 and
  length(coalesce(notes, '')) <= 2000
);

alter table billing_customers add constraint billing_customers_lungimi_text check (
  length(coalesce(company_name, '')) <= 200 and
  length(coalesce(last_name, ''))    <= 100 and
  length(coalesce(first_name, ''))   <= 100 and
  length(coalesce(contact_name, '')) <= 200 and
  length(coalesce(address, ''))      <= 300 and
  length(coalesce(city, ''))         <= 100 and
  length(coalesce(county, ''))       <= 100 and
  length(coalesce(country, ''))      <= 100 and
  length(coalesce(email, ''))        <= 200 and
  length(coalesce(phone, ''))        <= 40  and
  length(coalesce(reg_com, ''))      <= 50
);

alter table folio_items add constraint folio_items_lungimi_text check (
  length(coalesce(name, ''))  <= 300 and
  length(coalesce(notes, '')) <= 2000
);

alter table invoices add constraint invoices_lungimi_text check (
  length(coalesce(notes, '')) <= 2000
);