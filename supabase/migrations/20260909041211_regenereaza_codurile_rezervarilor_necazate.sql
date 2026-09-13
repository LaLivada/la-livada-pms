-- Codurile de 5 caractere ale rezervarilor care NU sunt cazate acum se
-- inlocuiesc cu unele de 8.
--
-- De ce se poate: linkul oaspetelui pleaca odata cu codul de acces, iar acela
-- se face la check-in. Pana atunci `guest_poarta` raspunde oricum 'neinceput'
-- pentru codul respectiv, deci nu exista niciun link trimis care sa se rupa.
--
-- De ce NU se ating cele cazate acum: acolo linkul e in mana omului, poate
-- chiar deschis pe telefon in fata usii. Raman cu codul vechi si cu plafonul
-- global care il apara, pana la ultimul checkout — 13 septembrie 2026.
--
-- Verificat inainte de a rula: niciun rand din cele 134 n-are `booked_price`
-- gol cu `price_override` gol, deci triggerul de pret nu recalculeaza nimic.
-- Un UPDATE care ar fi schimbat tacit 134 de preturi ar fi fost mai rau decat
-- problema pe care o reparam.

update reservations
   set guest_code = guest_code_nou()
 where guest_code is not null
   and length(guest_code) = 5
   and status <> 'checkedin';