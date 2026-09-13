-- Postgres verifică dreptul de EXECUTE la CREATE TRIGGER, nu la fiecare
-- declanșare, deci revocarea nu oprește trigger-ul. Ce oprește e expunerea
-- lui ca `/rest/v1/rpc/activity_log_semneaza` — un endpoint care oricum ar
-- fi eșuat (o funcție de trigger nu poate fi chemată direct), dar care n-are
-- ce căuta în API.
revoke execute on function activity_log_semneaza() from public, anon, authenticated;