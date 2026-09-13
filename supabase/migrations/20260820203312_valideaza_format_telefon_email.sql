-- Validare de format pentru telefon si email, la nivel de baza de date —
-- plasa de siguranta pentru orice cale de scriere in afara UI-ului
-- (inclusiv create_booking, apelabila public). Nu duplica regula fina
-- din front-end (PhoneDialPicker, "0 redundant dupa prefixul de tara")
-- — aia are nevoie de lista de prefixuri, care exista doar in JS. Aici
-- se verifica doar forma generala: cifre rezonabile ca numar si lungime
-- pentru telefon, forma nume@domeniu.ceva pentru email.
--
-- NOT VALID: cel putin o inregistrare existenta (un guest cu
-- email "marcel@marcel", fara domeniu real) ar fi picat validarea
-- retroactiva. NOT VALID inseamna ca regula se aplica de acum inainte
-- (orice INSERT/UPDATE nou), fara sa blocheze migrarea pe datele vechi.

alter table guests add constraint guests_format_contact check (
  (phone = '' or (phone ~ '^[+]?[0-9 ()-]+$'
                   and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15))
  and
  (email is null or email = '' or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
) not valid;

alter table billing_customers add constraint billing_customers_format_contact check (
  (phone is null or phone = '' or (phone ~ '^[+]?[0-9 ()-]+$'
                   and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15))
  and
  (email is null or email = '' or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
) not valid;
