-- Guest app, pasul 4: poarta deschiderii de usa.
-- Plan: docs/guest-app.md 4.4 si 7.

create table if not exists guest_unlock_attempts (
  id             bigint generated always as identity primary key,
  reservation_id text,
  ip             text,
  created_at     timestamptz not null default now()
);
create index if not exists guest_unlock_attempts_rez on guest_unlock_attempts (reservation_id, created_at desc);
create index if not exists guest_unlock_attempts_ip  on guest_unlock_attempts (ip, created_at desc);
alter table guest_unlock_attempts enable row level security;

-- Ce are voie sa afle functia edge inainte de a atinge yala.
--
-- Intoarce jsonb si NU arunca exceptie, din acelasi motiv ca guest_poarta:
-- o exceptie ar face rollback la randul de contorizare tocmai scris, iar
-- plafoanele n-ar mai numara nimic.
--
-- `lock_id` iese de aici, dar se opreste in functia edge — in browser nu
-- ajunge niciodata (4.3). Oaspetele apasa un buton; ce yala se deschide se
-- hotaraste pe server, din rezervarea careia ii apartine codul.
create or replace function guest_poate_deschide(p_cod text, p_ip text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  PLAFON_COD constant int := 10;   -- deschideri pe ora, pentru o rezervare
  PLAFON_IP  constant int := 30;   -- deschideri pe ora, de la o adresa
  v_p record;
  v_n int;
  v_camera record;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
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

-- Interna: o cheama doar functia edge, cu service_role. Daca ar fi apelabila
-- din browser, ar intoarce lock_id-ul yalei direct oaspetelui.
revoke execute on function guest_poate_deschide(text, text) from public, anon, authenticated;