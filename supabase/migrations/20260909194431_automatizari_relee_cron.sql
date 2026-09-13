create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cheama device-provider o data la 10 minute, necondiționat — logica de
-- "e ora 11 la Vaslui?" / "e noapte?" traieste in TS (reguli-automate.ts),
-- nu aici, ca sa treaca automat peste schimbarea orei de vara/iarna.
-- Autentificarea cere cheia service_role, pusa de administrator intr-un
-- secret Vault numit 'service_role_key' (pas manual, o singura data —
-- vezi docs/shelly-integration.md). Pana atunci, job-ul exista dar
-- `net.http_post` nu are ce Authorization sa trimita si cererea va esua
-- cu 401 — inofensiv, doar reconcilierea nu ruleaza.
select cron.schedule(
  'device-automatizari',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://suoowrginsliyrbxqeap.supabase.co/functions/v1/device-provider',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
        ''
      )
    ),
    body := jsonb_build_object('action', 'cron_reconciliaza')
  );
  $$
);
