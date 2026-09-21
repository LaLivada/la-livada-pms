create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 15 minute, nu 10 ca la relee: ce castigam citind mai des e marginit de cat
-- de des isi reimprospateaza EI feedul de iesire (Airbnb ~o ora, Booking.com
-- neregulat), iar limitele lor de rata pe adresele de export nu sunt
-- documentate nicaieri. 16 camere x 2 OTA = 32 de cereri pe rulare.
select cron.schedule(
  'ical-import-ota',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://suoowrginsliyrbxqeap.supabase.co/functions/v1/ical-import',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
        ''
      )
    ),
    body := jsonb_build_object('action', 'importa')
  );
  $$
);