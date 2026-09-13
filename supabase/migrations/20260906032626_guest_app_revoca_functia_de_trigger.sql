-- Functiile de trigger nu se pot chema oricum din afara (Postgres refuza:
-- „trigger functions can only be called as triggers"), dar nu exista motiv
-- sa aiba EXECUTE pentru toata lumea doar fiindca asa e implicit.
-- Verificarea drepturilor pe o functie de trigger se face la CREATE TRIGGER,
-- nu la fiecare declansare, deci revocarea nu opreste triggerul — dovedit
-- intr-o tranzactie anulata inainte de a aplica asta.
revoke execute on function pune_guest_code() from public, anon, authenticated;