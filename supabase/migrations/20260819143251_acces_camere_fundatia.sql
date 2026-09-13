-- ACCES ELECTRONIC LA CAMERE — fundatia
--
-- Neutru fata de furnizor: coloana `provider` exista de la inceput, ca
-- adaugarea altui sistem de yale sa fie un modul nou, nu o migrare.
-- Primul furnizor implementat e TTLock.

-- 1. Asocierea camera -> yala. Nu se hardcodeaza nicaieri in cod.
alter table rooms add column if not exists access_provider  text;
alter table rooms add column if not exists access_lock_id   text;
alter table rooms add column if not exists access_lock_name text;

comment on column rooms.access_provider is
  'Sistemul de yale al camerei (deocamdata doar ''ttlock''). Null = fara yala.';
comment on column rooms.access_lock_id is
  'Identificatorul yalei la furnizor (lockId la TTLock). Text, nu int: alti furnizori folosesc alte formate.';


-- 2. Codurile de acces. Un rand de rezervare are deja exact o camera, deci
--    "cate un cod per camera" iese natural: codul se leaga de rezervare.
--    Grupurile primesc cate un cod pentru fiecare rezervare din ele.
create table if not exists access_codes (
  id              text primary key,
  reservation_id  text not null references reservations(id) on delete cascade,
  room_id         text not null references rooms(id),
  provider        text not null default 'ttlock',
  lock_id         text not null,
  code            text not null,
  -- Identificatorul codului la furnizor (keyboardPwdId la TTLock). Fara el
  -- codul nu poate fi sters sau modificat mai tarziu.
  external_id     text,
  valid_from      timestamptz not null,
  valid_until     timestamptz not null,
  -- active     — codul curent, singurul valabil
  -- superseded — inlocuit de altul (perioada schimbata, camera schimbata)
  -- revoked    — anulat la furnizor
  -- failed     — generarea a esuat; pastrat ca sa se vada de ce
  status          text not null default 'active'
                  check (status in ('active','superseded','revoked','failed')),
  generated_at    timestamptz not null default now(),
  generated_by    text,
  revoked_at      timestamptz,
  error_message   text,
  created_at      timestamptz not null default now()
);

-- Un singur cod ACTIV per rezervare. Asa cerinta "nu genera duplicate la
-- fiecare deschidere a rezervarii" e impusa de baza, nu de disciplina
-- codului din interfata.
create unique index if not exists access_codes_activ_unic
  on access_codes (reservation_id) where status = 'active';

create index if not exists access_codes_rezervare on access_codes (reservation_id);
create index if not exists access_codes_camera    on access_codes (room_id);


-- 3. Trimiterile catre oaspete (email / WhatsApp), cu status si motiv.
create table if not exists access_notifications (
  id             text primary key,
  access_code_id text not null references access_codes(id) on delete cascade,
  channel        text not null check (channel in ('email','whatsapp')),
  recipient      text,
  status         text not null check (status in ('sent','failed')),
  sent_at        timestamptz,
  sent_by        text,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists access_notifications_cod on access_notifications (access_code_id);


-- 4. Audit propriu.
--
-- Jurnalul existent (`audit.push`) e un blob JSON in app_state, plafonat la
-- 400 de intrari si neinterogabil. Operatiunile pe yale au nevoie de altceva:
-- se cauta dupa rezervare si dupa yala, si nu trebuie sa expire dupa 400 de
-- randuri, tocmai fiindca raspund la intrebarea "cine a deschis usa aia".
create table if not exists access_audit (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  actor          text,
  action         text not null,
  reservation_id text,
  room_id        text,
  provider       text,
  lock_id        text,
  result         text not null default 'ok' check (result in ('ok','error')),
  external_ref   text,
  detail         text
);

create index if not exists access_audit_rezervare on access_audit (reservation_id, at desc);
create index if not exists access_audit_moment    on access_audit (at desc);


-- 5. RLS. Codul deschide o usa, deci nu il vede oricine.
alter table access_codes         enable row level security;
alter table access_notifications enable row level security;
alter table access_audit         enable row level security;

-- Citire: admin si receptie. Housekeeping NU — n-are nevoie de codurile
-- oaspetilor ca sa faca curat.
create policy "citeste coduri acces" on access_codes
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste trimiteri acces" on access_notifications
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste audit acces" on access_audit
  for select to authenticated using (is_admin());

-- Scrierea se face DOAR din Edge Function (service_role). Interfata nu
-- scrie direct: altfel un cod ar putea fi inventat din browser, fara ca
-- yala sa stie de el.
