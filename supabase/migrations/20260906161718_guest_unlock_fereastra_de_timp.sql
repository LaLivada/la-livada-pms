-- Deschiderea de la distanta primeste aceeasi fereastra de timp ca tastatura.
--
-- PROBLEMA. `guest_poate_deschide` cerea doar `status = 'checkedin'`, fara
-- nicio comparatie de date. Codul de pe tastatura are insa o fereastra —
-- `inceputCod` din src/lib/acces.js o porneste la ora de sosire scrisa in
-- rezervare, iar `expirareCod` o inchide la plecare plus minutele de gratie.
-- Deci butonul din pagina putea face doua lucruri pe care codul nu le poate:
--
--   1. sa deschida usa INAINTE de ora sosirii. Check-in-ul se poate face cu
--      ore bune inainte (receptia il marcheaza cand ii vine la indemana),
--      iar din clipa aia oaspetele putea intra intr-o camera in care poate
--      mai doarme cineva sau in care tocmai se face curat;
--   2. sa deschida usa DUPA plecare, daca nimeni n-a apasat check-out.
--      Statusul ramane 'checkedin' pana il schimba un om, deci un oaspete
--      plecat de trei zile mai avea usa la un buton distanta.
--
-- Al doilea caz nu a fost cerut, dar e din aceeasi familie si mai grav:
-- primul cere o greseala de sincronizare, al doilea doar o uitare.
--
-- FEREASTRA SE IA DIN REZERVARE, nu din randul de cod de acces. Codul poate
-- lipsi (generarea la yala esueaza uneori), iar butonul a fost desprins
-- anume de el, ca oaspetele fara cifre sa poata totusi intra. Legata de
-- `access_codes`, verificarea l-ar fi recuplat pe usa din dos.
--
-- Gratia vine din setari, ca la coduri, si e citita in siguranta: o valoare
-- aiurea in JSON cade pe 30, nu arunca in mijlocul unei deschideri.
create or replace function guest_poate_deschide(p_cod text, p_ip text default null)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  PLAFON_COD constant int := 10;   -- deschideri pe ora, pentru o rezervare
  PLAFON_IP  constant int := 30;   -- deschideri pe ora, de la o adresa
  v_p record;
  v_n int;
  v_camera record;
  v_gratie int;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  -- Fereastra sejurului. Verificata INAINTE de contorizare: cine apasa cu un
  -- sfert de ora prea devreme e un oaspete nerabdator, nu un atacator, si
  -- n-are de ce sa-si consume din cele zece deschideri pe ora.
  select coalesce(
           (select case when (value ->> 'graceMinutes') ~ '^[0-9]{1,4}$'
                        then (value ->> 'graceMinutes')::int end
              from app_state where key = 'pms:access:v1'), 30)
    into v_gratie;

  if now() < (v_p.rezervare).checkin then
    return jsonb_build_object('ok', false, 'motiv', 'prea-devreme',
                              'deLa', (v_p.rezervare).checkin);
  end if;

  if now() > (v_p.rezervare).checkout + make_interval(mins => v_gratie) then
    return jsonb_build_object('ok', false, 'motiv', 'prea-tarziu');
  end if;

  delete from guest_unlock_attempts where created_at < now() - interval '1 day';

  -- Zece apasari intr-o ora nu mai sunt un oaspete care intra in camera, ci
  -- ceva ce trebuie sa afle receptia.
  select count(*) into v_n from guest_unlock_attempts
    where reservation_id = (v_p.rezervare).id and created_at > now() - interval '1 hour';
  if v_n >= PLAFON_COD then
    return jsonb_build_object('ok', false, 'motiv', 'prea-des');
  end if;

  if p_ip is not null then
    select count(*) into v_n from guest_unlock_attempts
      where ip = p_ip and created_at > now() - interval '1 hour';
    if v_n >= PLAFON_IP then
      return jsonb_build_object('ok', false, 'motiv', 'prea-des');
    end if;
  end if;

  select r.id, r.name, r.access_lock_id into v_camera
    from rooms r where r.id = (v_p.rezervare).room_id;

  if v_camera.access_lock_id is null or trim(v_camera.access_lock_id) = '' then
    -- Camera n-are yala asociata. Nu e vina oaspetelui si nu e o incercare
    -- de ocolire: e configurare lipsa, deci se spune altfel decat un refuz.
    return jsonb_build_object('ok', false, 'motiv', 'fara-yala');
  end if;

  -- Contorizarea se face INAINTE de a atinge yala, nu dupa. O deschidere
  -- care esueaza la furnizor tot a costat o incercare; daca s-ar numara doar
  -- reusitele, cine da de un TTLock cazut ar putea apasa la nesfarsit.
  insert into guest_unlock_attempts (reservation_id, ip)
    values ((v_p.rezervare).id, p_ip);

  return jsonb_build_object(
    'ok', true,
    'reservationId', (v_p.rezervare).id,
    'roomId', v_camera.id,
    'roomName', v_camera.name,
    'lockId', v_camera.access_lock_id);
end $$;

revoke execute on function guest_poate_deschide(text, text) from public, anon, authenticated;