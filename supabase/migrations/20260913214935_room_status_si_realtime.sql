-- =====================================================================
-- STATUS CAMERE (curățenie) — tabel propriu + Realtime
-- Faza 2, A6 + B3 din docs/audit-2026-09.md; designul în docs/faza2.md §3.
--
-- Până pe 14 septembrie 2026 statusul de curățenie stătea într-un blob JSON
-- din `app_state` (cheia `pms:housekeeping:v3`), citit și RESCRIS ÎNTREG la
-- fiecare schimbare — ultimul care scria câștiga: două cameriste pe două
-- telefoane își puteau anula reciproc bifările, iar cine scria „curat" pe o
-- cameră trimitea de fapt toate cele 16 camere. Acum e o linie per cameră,
-- update per rând, semnat de trigger (cine, când), și tabelul e în
-- publicația Realtime, deci schimbarea se vede pe celelalte tablete în
-- aceeași secundă, fără refresh.
--
-- Cheia veche rămâne în `app_state`, necitită de nimeni, ca să mai poată
-- scrie în ea filele deschise cu bundle-ul vechi — la fel ca `pms:log:v3`
-- la mutarea jurnalului.
-- =====================================================================
create table room_status (
  room_id         text primary key references rooms(id) on delete cascade,
  status          text not null default 'clean' check (status in ('clean', 'progress', 'dirty')),
  changed_at      timestamptz not null default now(),
  changed_by      uuid references auth.users(id) on delete set null,
  -- Numele se păstrează ca text, ca în `activity_log`: cardul camerei spune
  -- cine a bifat-o, chiar dacă omul a fost șters din `staff` între timp.
  changed_by_name text
);

create index room_status_changed_by on room_status (changed_by); -- cheie străină fără index (advisor)

-- Starea de azi vine din blob, cu momentul ei; camerele fără intrare pornesc
-- „curate". Seed-ul se face ÎNAINTE de trigger, ca stampilele vechi să nu
-- fie înlocuite cu „acum" și semnate cu nimeni.
insert into room_status (room_id, status, changed_at)
select r.id,
       case when h.value->>'status' in ('clean', 'progress', 'dirty') then h.value->>'status' else 'clean' end,
       coalesce((h.value->>'updatedAt')::timestamptz, now())
from rooms r
left join lateral (
  select e.value
  from app_state a, jsonb_each(a.value) e
  where a.key = 'pms:housekeeping:v3' and e.key = r.id
) h on true
on conflict (room_id) do nothing;

-- Semnătura nu vine din browser, se pune aici. Clientul trimite doar
-- `room_id` și `status`; orice ar trimite în plus e suprascris.
create or replace function room_status_semneaza()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  new.changed_at := now();
  new.changed_by := auth.uid();
  select s.name into new.changed_by_name from staff s where s.user_id = auth.uid();
  return new;
end $$;

create trigger room_status_semnatura
  before insert or update on room_status
  for each row execute function room_status_semneaza();

-- Ca la `activity_log_semneaza`: revocarea nu oprește trigger-ul, oprește
-- doar expunerea funcției ca endpoint RPC.
revoke execute on function room_status_semneaza() from public, anon, authenticated;

alter table room_status enable row level security;

-- Citește și scrie oricine e în `staff`, camerista inclusiv — e ecranul ei.
-- Ștergere: nimeni; rândul pleacă odată cu camera (on delete cascade).
create policy "staff citeste status" on room_status
  for select to authenticated using ((select staff_role()) is not null);
create policy "staff scrie status" on room_status
  for insert to authenticated with check ((select staff_role()) is not null);
create policy "staff modifica status" on room_status
  for update to authenticated
  using ((select staff_role()) is not null)
  with check ((select staff_role()) is not null);

-- Realtime (B3): schimbările din `reservations` (rezervări + blocaje) și din
-- `room_status` ajung la filele deschise ca evenimente. RLS se aplică și pe
-- flux — camerista, care nu are politică de citire pe `reservations`, nu
-- primește nimic de acolo; calendarul ei rămâne pe vederea de ocupare.
alter publication supabase_realtime add table room_status, reservations;
