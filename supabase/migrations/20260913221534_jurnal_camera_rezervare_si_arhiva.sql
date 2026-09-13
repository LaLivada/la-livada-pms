-- =====================================================================
-- JURNAL — camera și rezervarea ca coloane, filtrul devine interogare;
-- arhivă anuală. Faza 2, A4 din docs/audit-2026-09.md; docs/faza2.md §5.
--
-- Până pe 14 septembrie 2026 camera unei intrări exista doar în textul din
-- `detail`: filtrul „pe cameră" din ecranul Jurnal parsa numele camerelor
-- din șir (lib/jurnal.js) și vedea doar cele 400 de intrări încărcate pe
-- ecran. Acum `audit.push` scrie `room_id` și `reservation_id` când le
-- știe, iar filtrul e o interogare pe index — tot istoricul camerei, nu
-- doar ce e pe ecran. Intrările vechi primesc `room_id` din text, cu
-- aceleași reguli ca parserul din browser (mai jos).
-- =====================================================================
alter table activity_log
  add column room_id        text references rooms(id)        on delete set null,
  add column reservation_id text references reservations(id) on delete set null;

create index activity_log_camera    on activity_log (room_id, at desc);
create index activity_log_rezervare on activity_log (reservation_id); -- cheie străină fără index (advisor)

-- Backfill din text, cu regulile din lib/jurnal.js (cameraDinDetaliu):
-- numele camerei delimitat de ne-alfanumerice, NU urmat de „lei" (un preț
-- care nimerește un număr de cameră nu e o cameră), și, când textul
-- pomenește mai multe camere, cea care apare prima. `regexp_instr` dă
-- poziția primei apariții care respectă constrângerile — la fel ca bucla
-- din browser, care sare peste un preț și ia a doua apariție.
update activity_log l set room_id = p.room_id
from (
  select distinct on (log_id) log_id, room_id
  from (
    select l.id as log_id, r.id as room_id,
           regexp_instr(l.detail, '(^|[^0-9A-Za-z])' || r.name || '(?![0-9A-Za-z]|\s*lei\M)') as poz
      from activity_log l
      cross join rooms r
     where l.room_id is null and l.detail is not null
  ) x
  where poz > 0
  order by log_id, poz
) p
where l.id = p.log_id;

-- ---------------------------------------------------------------------
-- ARHIVA JURNALULUI — o dată pe an, intrările mai vechi decât anul
-- precedent se mută aici. Tabelul curent rămâne „anul ăsta și anul trecut",
-- deci ecranul Jurnal (ultimele 400 de intrări, filtrul pe cameră) și
-- indexul lui nu cresc la nesfârșit; ce e mai vechi rămâne citibil aici,
-- cu aceeași politică de citire, și la fel de nemodificabil (fără politici
-- de update/delete pentru authenticated — nici aici, nici în activity_log).
-- Mutarea o face DOAR funcția de mai jos, apelată de pg_cron pe 2 ianuarie;
-- nu e executabilă de nimeni prin API.
-- ---------------------------------------------------------------------
create table activity_log_arhiva (
  id             bigint primary key,
  at             timestamptz not null,
  user_id        uuid,
  user_name      text not null,
  user_role      text not null,
  action         text not null,
  detail         text,
  room_id        text,
  reservation_id text,
  arhivat_la     timestamptz not null default now()
);
create index activity_log_arhiva_moment on activity_log_arhiva (at desc);
create index activity_log_arhiva_camera on activity_log_arhiva (room_id, at desc);

alter table activity_log_arhiva enable row level security;
create policy "citeste arhiva jurnal" on activity_log_arhiva
  for select to authenticated using ((select is_admin()) or (select staff_role()) = 'receptionist');

-- Mută într-o singură instrucțiune (delete ... returning -> insert): ori
-- ajung toate în arhivă, ori niciuna nu dispare din jurnal.
create or replace function arhiveaza_jurnal(p_inainte_de timestamptz)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with mutate as (
    delete from activity_log
     where at < p_inainte_de
    returning id, at, user_id, user_name, user_role, action, detail, room_id, reservation_id
  )
  insert into activity_log_arhiva (id, at, user_id, user_name, user_role, action, detail, room_id, reservation_id)
  select id, at, user_id, user_name, user_role, action, detail, room_id, reservation_id from mutate;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function arhiveaza_jurnal(timestamptz) from public, anon, authenticated;

-- 2 ianuarie, 04:00 UTC: tot ce e dinaintea lui 1 ianuarie a anului
-- PRECEDENT (pe 2 ian 2027 se arhivează 2025 și mai vechi; 2026 rămâne).
-- `cron.schedule` pe același nume înlocuiește jobul, deci e re-rulabil.
select cron.schedule(
  'jurnal-arhivare-anuala',
  '0 4 2 1 *',
  $$ select arhiveaza_jurnal(date_trunc('year', now()) - interval '1 year') $$
);
