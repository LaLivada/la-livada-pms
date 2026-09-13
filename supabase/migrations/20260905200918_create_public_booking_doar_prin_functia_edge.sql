-- Crearea rezervarii nu mai poate fi apelata cu cheia publica.
--
-- Cat timp anon putea apela direct RPC-ul, verificarea Turnstile din
-- functia edge era o sugestie, nu o restrictie: oricine citea cheia
-- publica din pachetul din browser putea sari peste poarta si crea
-- rezervari. Cheia aceea e publica prin constructie — apare in fiecare
-- fila deschisa pe site.
--
-- De acum singurul apelant e service_role, adica functia edge
-- booking-create, care verifica jetonul inainte sa scrie ceva.
-- Toate celelalte functii publice raman apelabile: cautarea nu scrie
-- nimic, iar confirmarea si anularea cer un token de 128 de biti care nu
-- se poate ghici.
revoke execute on function create_public_booking(uuid, timestamptz, timestamptz,
  text, text, text, text, text, text, text, jsonb, text, int, text)
  from anon, authenticated;