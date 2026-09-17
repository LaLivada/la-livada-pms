# Plata cu cardul prin NETOPIA — plan de implementare

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaugă plata cu cardul (opțiune principală) alături de cash și transfer bancar (secundare) la pasul final al rezervării pe rezervari.lalivada.ro, folosind API-ul v1 (redirect complet, găzduit) al NETOPIA, cu rambursare manuală la anulare.

**Architecture:** Funcție edge nouă `netopia-start` creează rezervarea cu hold (ca azi) și întoarce un formular criptat RSA+AES pe care browserul îl trimite direct către pagina găzduită NETOPIA — cardul nu atinge niciodată serverul nostru. O a doua funcție edge, `netopia-ipn`, primește notificarea asincronă de plată, confirmă rezervarea și trimite emailul existent. Cash și transfer bancar rămân neschimbate (confirmare imediată prin `booking-create`).

**Tech Stack:** PostgreSQL/PostgREST (Supabase), funcții edge Deno, `node:crypto` (RSA PKCS1 + AES-256-CBC, disponibil în Deno prin specificatorul `node:`), React (booking app existent), Vitest.

**Spec:** [`docs/netopia-plan.md`](../../netopia-plan.md)

## Global Constraints

- Cardul se introduce EXCLUSIV pe pagina găzduită NETOPIA (v1) — niciun cod al nostru nu primește sau procesează numărul de card, CVV sau data expirării.
- Redirect complet, nu iframe — CSP-ul NETOPIA (`frame-ancestors`) blochează afișarea paginii lor într-un iframe pe domeniul nostru.
- Suma încasată e integrală (tot sejurul), nu doar prima noapte.
- Rambursarea la anulare e MANUALĂ — API-ul de refund NETOPIA pentru cardul online nu e lansat. Sistemul doar calculează și afișează suma, nu apelează niciun endpoint de refund.
- Cash și transfer bancar rămân exact ca azi: confirmare imediată, fără nicio stare nouă.
- Toate textele din interfață și e-mailuri sunt în română, cu diacritice, în stilul existent al proiectului.
- Fiecare secret nou (certificat NETOPIA, semnătură, cheie privată) e un pas manual al lui Ovidiu — niciodată în cod sau în migrare.

---

## Fișiere atinse

- **Creează:** `supabase/migrations/20260917190000_plata_card_netopia.sql`
- **Creează:** `src/lib/netopia.js` + `src/netopia.test.js`
- **Creează:** `supabase/functions/netopia-start/index.ts`
- **Creează:** `supabase/functions/netopia-ipn/index.ts`
- **Creează:** `supabase/functions/netopia-refund-notice/index.ts`
- **Modifică:** `supabase/functions/booking-create/index.ts` (trece `metodaPlata` mai departe)
- **Modifică:** `src/booking/api.js` (adaugă `porneStePlataCard`, `trimiteAvizRambursare`, extinde `creeazaRezervare`)
- **Modifică:** `src/booking/App.jsx` (selector metodă de plată, redirect către NETOPIA, text rambursare)
- **Modifică:** `src/booking/styles.js` (clasele noi ale selectorului)

---

### Task 1: Migrația — coloane, tabel de audit, funcții SQL noi

**Files:**
- Create: `supabase/migrations/20260917190000_plata_card_netopia.sql`

**Interfaces:**
- Produces: coloanele `public_bookings.metoda_plata`, `.plata_status`, `.netopia_ntp_id`, `.suma_platita`; tabelul `netopia_ipn_log`; funcțiile `create_public_booking(..., p_metoda_plata text default 'cash', p_plata_status text default null)` (semnătură extinsă), `confirm_card_payment(p_token text, p_ntp_id text, p_amount numeric) returns jsonb`, `mark_card_payment_failed(p_token text) returns jsonb`, `public_booking_first_night(p_id text) returns numeric`, `booking_refund_payload(p_token text) returns jsonb`; `cancel_public_booking(p_token text)` întoarce acum și `refundSuggerat`; `public_booking_by_token(p_token text)` întoarce acum și `metodaPlata`/`plataStatus`.

- [ ] **Step 1: Scrie migrația completă**

```sql
-- Plata cu cardul prin NETOPIA (API v1, redirect complet — vezi
-- docs/netopia-plan.md). Cash și transfer bancar rămân neschimbate; doar
-- cardul capătă o stare de așteptare, între trimitere și IPN.

alter table public_bookings
  add column metoda_plata  text check (metoda_plata in ('cash','transfer','card')),
  add column plata_status  text check (plata_status in ('asteapta','platit','esuat')),
  add column netopia_ntp_id text,
  add column suma_platita  numeric;

comment on column public_bookings.metoda_plata is
  'Cum a ales oaspetele să plătească. NULL doar pentru rezervările vechi, de dinainte de această coloană.';
comment on column public_bookings.plata_status is
  'Doar pentru card: ''asteapta'' până la IPN, ''platit''/''esuat'' după. NULL pentru cash/transfer — nu se aplică.';

-- Auditul brut al notificărilor NETOPIA, scris ÎNAINTE de orice procesare —
-- același model ca access_audit / aiosell_webhook_log din planul Aiosell:
-- o plată reală nu se pierde niciodată, chiar dacă restul logicii eșuează.
create table netopia_ipn_log (
  id           bigint generated always as identity primary key,
  payload      text not null,
  rezultat     text not null default 'eroare' check (rezultat in ('ok','eroare')),
  public_token text,
  detaliu      text,
  created_at   timestamptz not null default now()
);
alter table netopia_ipn_log enable row level security;
-- RLS activat, fără politici: inaccesibil prin API pentru orice rol, la fel
-- ca public_bookings. Se scrie și se citește doar din netopia-ipn (service_role).

-- =====================================================================
-- create_public_booking — semnătură extinsă cu metoda de plată.
--
-- Doar ULTIMELE DOUĂ argumente sunt noi (cu valori implicite — nimic din
-- ce apelează funcția azi se schimbă fără să fie atins explicit). Restul
-- corpului e IDENTIC cu versiunea din schema.sql; se schimbă doar
-- INSERT-ul final, care acum scrie și cele două coloane noi, și
-- răspunsul idempotent, care acum le întoarce și pe ele.
-- =====================================================================
create or replace function create_public_booking(
  p_idempotency_key uuid,
  p_checkin timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null,
  p_hold_minutes int default 0,
  p_client_ip text default null,
  -- 'cash' | 'transfer' | 'card'. Card ține mereu hold >0 (vezi netopia-start) —
  -- nu se confirmă niciodată direct din funcția asta.
  p_metoda_plata text default 'cash',
  -- Doar pentru card: 'asteapta' la creare. NULL pentru cash/transfer.
  p_plata_status text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ex        public_bookings;
  v_cerere    jsonb;
  v_tip       text;   v_ad int;  v_cop int;
  v_room_id   text;   v_guest_id text;  v_group_id text := null;
  v_res_ids   text[] := '{}';   v_total numeric := 0;  v_pret numeric;
  v_nr        text;   v_res_id text;   v_ip text;  v_token text;
  v_nr_camere int := coalesce(jsonb_array_length(p_rooms), 0);
  v_hold      timestamptz := null;
  v_status    text := 'confirmed';
begin
  if coalesce(p_hold_minutes, 0) > 0 then
    v_hold   := now() + make_interval(mins => p_hold_minutes);
    v_status := 'pending';
  end if;

  -- 1. IDEMPOTENȚĂ
  if p_idempotency_key is null then
    raise exception 'Lipsește cheia de idempotență.';
  end if;
  select * into v_ex from public_bookings where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('success', true, 'repeat', true,
      'confirmationNumber', v_ex.confirmation_number,
      'publicToken', v_ex.public_token, 'status', v_ex.status,
      'holdExpiresAt', v_ex.hold_expires_at,
      'total', v_ex.total_amount, 'rooms', v_ex.rooms_count,
      'metodaPlata', v_ex.metoda_plata, 'plataStatus', v_ex.plata_status);
  end if;

  -- 2. VALIDĂRI ȘI LIMITE
  if v_nr_camere < 1 or v_nr_camere > (select count(*) from rooms where active) then
    raise exception 'Se pot rezerva între 1 și % camere odată.', (select count(*) from rooms where active);
  end if;
  if p_checkout <= p_checkin then
    raise exception 'Data de plecare trebuie să fie după data sosirii.';
  end if;
  if p_checkout::date - p_checkin::date > 30 then
    raise exception 'Sejurul nu poate depăși 30 de nopți.';
  end if;
  if p_checkin < now() - interval '1 day' then
    raise exception 'Nu se pot face rezervări în trecut.';
  end if;
  if coalesce(trim(p_last_name),'') = '' or coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nume, prenume și telefon sunt obligatorii.';
  end if;
  if p_email is not null and trim(p_email) <> ''
     and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresa de email nu este validă.';
  end if;
  if coalesce(p_hold_minutes, 0) > 0 and coalesce(trim(p_email),'') = '' then
    raise exception 'Emailul e obligatoriu pentru rezervarea online.';
  end if;

  -- 3. RATE-LIMIT, pe trei paliere.
  v_ip := nullif(trim(coalesce(p_client_ip, '')), '');
  if v_ip is null then
    begin
      v_ip := ip_client();
    exception when others then v_ip := null; end;
  end if;

  delete from booking_attempts where created_at < now() - interval '2 days';

  if (select count(*) from booking_attempts
       where fingerprint = 'phone:' || lower(trim(p_phone))
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Prea multe cereri cu acest număr de telefon. Sună recepția.';
  end if;
  if (select count(*) from booking_attempts
       where fingerprint = 'phone:' || lower(trim(p_phone))
         and created_at > now() - interval '1 day') >= 8 then
    raise exception 'Prea multe rezervări cu acest număr de telefon astăzi. Sună recepția.';
  end if;

  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mai târziu.';
  end if;
  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 day') >= 12 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mâine sau sună recepția.';
  end if;

  if (select count(*) from booking_attempts
       where fingerprint = 'toate'
         and created_at > now() - interval '1 day') >= 25 then
    raise exception 'Rezervările online sunt oprite temporar. Sună recepția și îți facem rezervarea pe loc.';
  end if;

  insert into booking_attempts (fingerprint) values ('phone:' || lower(trim(p_phone)));
  if v_ip is not null then
    insert into booking_attempts (fingerprint) values ('ip:' || v_ip);
  end if;
  insert into booking_attempts (fingerprint) values ('toate');

  -- 4. SERIALIZARE.
  perform pg_advisory_xact_lock(hashtext('lalivada:booking'));
  perform expira_rezervari_neconfirmate();

  -- 5. OASPETE
  select id into v_guest_id from guests
   where lower(phone) = lower(trim(p_phone))
     and lower(coalesce(last_name,'')) = lower(trim(p_last_name))
   limit 1;
  if v_guest_id is null then
    v_guest_id := 'g-' || encode(gen_random_bytes(6),'hex');
    insert into guests (id, last_name, first_name, phone, email, city, county, country)
    values (v_guest_id, trim(p_last_name), trim(p_first_name), trim(p_phone),
            nullif(trim(p_email),''), coalesce(nullif(trim(p_city),''),'-'),
            coalesce(nullif(trim(p_county),''),'-'),
            coalesce(nullif(trim(p_country),''),'România'));
  end if;

  -- 6. GRUP
  if v_nr_camere > 1 then
    v_group_id := 'gr-' || encode(gen_random_bytes(6),'hex');
    insert into res_groups (id, name, main_guest_id, notes)
    values (v_group_id, 'Rezervare ' || trim(p_last_name), v_guest_id,
            'Rezervare de pe site');
  end if;

  -- 7. ALOCARE + INSERT
  for v_cerere in select * from jsonb_array_elements(p_rooms) loop
    v_tip := v_cerere->>'roomType';
    v_ad  := greatest(coalesce((v_cerere->>'adults')::int, 2), 1);
    v_cop := greatest(coalesce((v_cerere->>'children')::int, 0), 0);

    if v_tip is null or v_tip not in ('tiny','loft') then
      raise exception 'Tip de cameră necunoscut: %.', coalesce(v_tip,'(lipsă)');
    end if;
    if v_ad + v_cop > 6 then
      raise exception 'Prea multe persoane într-o cameră.';
    end if;

    select r.id into v_room_id
      from rooms r
     where r.active and r.type = v_tip and r.capacity >= v_ad + v_cop
       and not exists (
         select 1 from reservations res
          where res.room_id = r.id
            and res.status not in ('cancelled','noshow')
            and (res.status <> 'pending' or res.hold_expires_at > now())
            and tstzrange(res.checkin, res.checkout, '[)')
                && tstzrange(p_checkin, p_checkout, '[)')
       )
     order by r.capacity, r.sort_order
     limit 1;

    if v_room_id is null then
      raise exception 'Nu mai sunt camere disponibile pentru perioada aleasă.'
        using errcode = 'P0002';
    end if;

    v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');
    insert into reservations (id, room_id, guest_id, group_id, checkin, checkout,
                              status, adults, children, source, notes, hold_expires_at)
    values (v_res_id, v_room_id, v_guest_id, v_group_id, p_checkin, p_checkout,
            v_status, v_ad, v_cop, 'site', nullif(trim(p_notes),''), v_hold)
    returning booked_price into v_pret;

    v_total   := v_total + coalesce(v_pret, 0);
    v_res_ids := v_res_ids || v_res_id;
  end loop;

  -- 8. CONFIRMARE
  v_nr := next_confirmation_number();
  insert into public_bookings (id, idempotency_key, confirmation_number, guest_id,
                               group_id, reservation_ids, checkin, checkout,
                               rooms_count, total_amount, request_ip,
                               status, hold_expires_at, metoda_plata, plata_status)
  values ('pb-' || encode(gen_random_bytes(6),'hex'), p_idempotency_key, v_nr,
          v_guest_id, v_group_id, v_res_ids, p_checkin, p_checkout,
          v_nr_camere, v_total, v_ip, v_status, v_hold,
          coalesce(p_metoda_plata, 'cash'), p_plata_status)
  returning public_token into v_token;

  return jsonb_build_object('success', true, 'confirmationNumber', v_nr,
    'publicToken', v_token, 'status', v_status, 'holdExpiresAt', v_hold,
    'total', v_total, 'rooms', v_nr_camere,
    'metodaPlata', coalesce(p_metoda_plata, 'cash'), 'plataStatus', p_plata_status);

exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă perioadă.'
      using errcode = 'P0002';
end; $$;

-- =====================================================================
-- public_booking_by_token — acum expune și metoda/starea plății, ca
-- pagina de confirmare (reîncărcată după redirectul NETOPIA) să știe ce
-- text să arate, fără alt apel.
-- =====================================================================
create or replace function public_booking_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'status', b.status, 'checkIn', b.checkin, 'checkOut', b.checkout,
    'nights', b.checkout::date - b.checkin::date,
    'rooms', b.rooms_count, 'total', b.total_amount,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    'canCancel', (b.status = 'confirmed' and b.checkin > now()),
    'cancelledAt', b.cancelled_at,
    'metodaPlata', b.metoda_plata, 'plataStatus', b.plata_status)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;

-- =====================================================================
-- Suma primei nopți pentru o rezervare online — folosită doar ca să
-- calculăm cât se reține la anulare (politica: prima noapte integral).
-- Sumează nightly_rate pe fiecare cameră a grupului, la data sosirii —
-- consistent cu cum se calculează prețul peste tot (stay_total).
-- =====================================================================
create or replace function public_booking_first_night(p_id text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(
    nightly_rate(rm.type, (b.checkin at time zone 'Europe/Bucharest')::date, r.adults, r.children)
  ), 0)
  from public_bookings b
  join reservations r on r.id = any(b.reservation_ids)
  join rooms rm on rm.id = r.room_id
  where b.id = p_id;
$$;

-- =====================================================================
-- cancel_public_booking — neschimbată ca interfață (tot apelabilă direct
-- de `anon`), doar întoarce acum suma de rambursat când plata a fost cu
-- cardul. Rambursarea propriu-zisă rămâne manuală — vezi netopia-plan.md.
-- =====================================================================
create or replace function cancel_public_booking(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings; v_refund numeric := null;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'cancelled' then
    return jsonb_build_object('success', true, 'repeat', true,
      'status', 'cancelled', 'confirmationNumber', v_b.confirmation_number);
  end if;

  if v_b.checkin <= now() then
    raise exception 'Rezervarea nu mai poate fi anulată online — sună recepția.'
      using errcode = 'P0003';
  end if;

  update reservations
     set status = 'cancelled'
   where id = any(v_b.reservation_ids)
     and status not in ('checkedin','checkedout');

  update public_bookings
     set status = 'cancelled', cancelled_at = now()
   where id = v_b.id;

  if v_b.plata_status = 'platit' then
    v_refund := greatest(v_b.total_amount - public_booking_first_night(v_b.id), 0);
  end if;

  return jsonb_build_object('success', true, 'status', 'cancelled',
    'confirmationNumber', v_b.confirmation_number, 'refundSuggerat', v_refund);
end; $$;

-- =====================================================================
-- confirm_card_payment — chemată doar de netopia-ipn (service_role), la
-- succesul plății. Face ce face confirm_public_booking, plus scrie
-- datele plății. Idempotentă: un IPN dublu nu strică nimic.
-- =====================================================================
create or replace function confirm_card_payment(p_token text, p_ntp_id text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'confirmed' then
    return jsonb_build_object('success', true, 'repeat', true, 'status', 'confirmed',
      'confirmationNumber', v_b.confirmation_number);
  end if;
  if v_b.status = 'cancelled' then
    -- Plata a venit după ce oaspetele (sau timpul) a anulat deja ținerea.
    -- Nu forțăm nimic peste — rămâne pe seama omului, la netopia-refund-notice.
    return jsonb_build_object('success', false, 'status', 'cancelled',
      'confirmationNumber', v_b.confirmation_number);
  end if;
  if v_b.status = 'expired' then
    return jsonb_build_object('success', false, 'status', 'expired',
      'confirmationNumber', v_b.confirmation_number);
  end if;

  update reservations set status = 'confirmed', hold_expires_at = null
   where id = any(v_b.reservation_ids) and status = 'pending';

  update public_bookings
     set status = 'confirmed', hold_expires_at = null,
         plata_status = 'platit', netopia_ntp_id = p_ntp_id, suma_platita = p_amount
   where id = v_b.id;

  return jsonb_build_object('success', true, 'status', 'confirmed',
    'confirmationNumber', v_b.confirmation_number);
end; $$;

-- =====================================================================
-- mark_card_payment_failed — la refuz/anulare pe partea NETOPIA. Camera
-- rămâne ținută până expiră singură (expira_rezervari_neconfirmate) —
-- oaspetele poate reîncerca plata din aceeași pagină de confirmare.
-- =====================================================================
create or replace function mark_card_payment_failed(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;
  if v_b.status = 'pending' then
    update public_bookings set plata_status = 'esuat' where id = v_b.id;
  end if;
  return jsonb_build_object('success', true, 'status', v_b.status);
end; $$;

-- =====================================================================
-- booking_refund_payload — datele pentru emailul intern de rambursare.
-- Doar service_role (netopia-refund-notice), la fel ca booking_email_payload:
-- conține adresa clientului.
-- Întoarce NULL dacă rezervarea nu e într-o stare cu ceva de rambursat —
-- funcția care o cheamă tratează asta ca „nimic de făcut”, nu ca eroare.
-- =====================================================================
create or replace function booking_refund_payload(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_b public_bookings; v_email text; v_nume text;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found or v_b.status <> 'cancelled' or v_b.plata_status <> 'platit' then
    return null;
  end if;

  select g.email, trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,''))
    into v_email, v_nume
    from guests g where g.id = v_b.guest_id;

  return jsonb_build_object(
    'email', v_email, 'guestName', v_nume,
    'confirmationNumber', v_b.confirmation_number,
    'netopiaNtpId', v_b.netopia_ntp_id, 'sumaPlatita', v_b.suma_platita,
    'refundSuggerat', greatest(v_b.total_amount - public_booking_first_night(v_b.id), 0),
    'cancelledAt', v_b.cancelled_at);
end; $$;

-- =====================================================================
-- PERMISIUNI. La fel ca restul funcțiilor din suprafața publică:
-- interfața cu care lucrează oaspetele rămâne pe anon; tot ce citește
-- date personale sau scrie stare de plată rămâne strict pe service_role.
-- Revocarea e de la PUBLIC, nu doar de la anon — vezi comentariul din
-- schema.sql de la expira_rezervari_neconfirmate (default privileges dau
-- EXECUTE direct fiecărui rol).
-- =====================================================================
revoke execute on function confirm_card_payment(text, text, numeric) from public, anon, authenticated;
grant  execute on function confirm_card_payment(text, text, numeric) to service_role;

revoke execute on function mark_card_payment_failed(text) from public, anon, authenticated;
grant  execute on function mark_card_payment_failed(text) to service_role;

revoke execute on function booking_refund_payload(text) from public, anon, authenticated;
grant  execute on function booking_refund_payload(text) to service_role;

revoke execute on function public_booking_first_night(text) from public, anon, authenticated;
-- Fără grant explicit: e chemată doar dinăuntrul altor funcții security
-- definer (cancel_public_booking, booking_refund_payload), care rulează
-- ca proprietar — la fel ca expira_rezervari_neconfirmate.
```

- [ ] **Step 2: Aplică migrația prin MCP-ul Supabase**

Nu prin `psql`/CLI local — proiectul folosește `mcp__plugin_supabase_supabase__apply_migration` cu `project_id: suoowrginsliyrbxqeap`, `name: "plata_card_netopia"`, conținutul de mai sus ca `query`. Fișierul din `supabase/migrations/` se scrie DUPĂ aceea, citit din `supabase_migrations.schema_migrations` (vezi [`supabase-migratii-fisier-din-tabela.md`](../../../../../.claude/projects/C--Users-mail-Documents-la-livada-pms/memory/supabase-migratii-fisier-din-tabela.md) din memorie) — nu presupune că `apply_migration` lasă singur fișierul pe disc.

- [ ] **Step 3: Verifică migrația cu `execute_sql`**

```sql
select column_name from information_schema.columns
 where table_name = 'public_bookings' and column_name in ('metoda_plata','plata_status','netopia_ntp_id','suma_platita');

select proname from pg_proc
 where proname in ('confirm_card_payment','mark_card_payment_failed',
                    'booking_refund_payload','public_booking_first_night');

select has_function_privilege('anon', 'confirm_card_payment(text,text,numeric)', 'execute'); -- așteptat: false
select has_function_privilege('service_role', 'confirm_card_payment(text,text,numeric)', 'execute'); -- așteptat: true
```

Expected: primele două întorc rândurile așteptate; ultimele două confirmă exact permisiunile din migrare.

- [ ] **Step 4: Scrie fișierul de migrație pe disc și comite**

```bash
git add supabase/migrations/20260917190000_plata_card_netopia.sql
git commit -m "Plata cu cardul: coloane, tabel de audit si functii SQL noi"
```

---

### Task 2: Modulul pur `src/lib/netopia.js` — XML, criptare, IPN

**Files:**
- Create: `src/lib/netopia.js`
- Test: `src/netopia.test.js`

**Interfaces:**
- Consumes: nimic (modul pur, fără rețea/bază de date).
- Produces: `escXml(s)`, `construiesteXmlPlata({orderId, semnatura, suma, descriere, notifyUrl, returnUrl, client:{email,telefon,prenume,nume}, moneda='RON'})`, `cripteazaPentruNetopia(xml, certificatPem) → {envKey, data, cipher, iv}` (toate string base64, `cipher: "aes-256-cbc"`), `decripteazaDeLaNetopia({envKey,data,cipher,iv}, cheiePrivataPem) → string` (XML), `interpreteazaRaspunsIpn(xml) → {orderId, actiune, codEroare, mesajEroare, ntpId, sumaProcesata}`, `raspunsAckXml(mesaj, eroare?) → string`.

- [ ] **Step 1: Scrie testele (eșuează — modulul nu există încă)**

```js
// @ts-check
// src/netopia.test.js
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  escXml, construiesteXmlPlata, cripteazaPentruNetopia, decripteazaDeLaNetopia,
  interpreteazaRaspunsIpn, raspunsAckXml,
} from "./lib/netopia.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("escXml", () => {
  it("scapă caracterele XML speciale", () => {
    expect(escXml(`Popescu & "Ion" <test>`)).toBe("Popescu &amp; &quot;Ion&quot; &lt;test&gt;");
  });
  it("nu cade pe null/undefined", () => {
    expect(escXml(null)).toBe("");
    expect(escXml(undefined)).toBe("");
  });
});

describe("construiesteXmlPlata", () => {
  it("include toate câmpurile, scăpate corect", () => {
    const xml = construiesteXmlPlata({
      orderId: "pb-123", semnatura: "XXXX-XXXX", suma: 450.5,
      descriere: "Cazare & mic dejun", notifyUrl: "https://x.test/ipn",
      returnUrl: "https://x.test/reveniere",
      client: { email: "ion@test.ro", telefon: "+40722000000", prenume: "Ion", nume: "Popescu" },
    });
    expect(xml).toContain('id="pb-123"');
    expect(xml).toContain("<signature>XXXX-XXXX</signature>");
    expect(xml).toContain('amount="450.50"');
    expect(xml).toContain("Cazare &amp; mic dejun");
    expect(xml).toContain("<first_name>Ion</first_name>");
    expect(xml).toContain("<confirm>https://x.test/ipn</confirm>");
    expect(xml).toContain("<return>https://x.test/reveniere</return>");
  });
});

describe("cripteazaPentruNetopia / decripteazaDeLaNetopia", () => {
  it("fac dus-întors: ce se criptează cu cheia publică se decriptează cu cea privată", () => {
    const xmlOriginal = "<order><test>măr, țărână, cameră</test></order>";
    const plic = cripteazaPentruNetopia(xmlOriginal, publicKey);
    expect(plic.cipher).toBe("aes-256-cbc");
    expect(typeof plic.envKey).toBe("string");
    expect(typeof plic.iv).toBe("string");
    const decriptat = decripteazaDeLaNetopia(plic, privateKey);
    expect(decriptat).toBe(xmlOriginal);
  });

  it("respinge un cifru neașteptat", () => {
    expect(() => decripteazaDeLaNetopia({ envKey: "x", data: "y", cipher: "rc4", iv: "z" }, privateKey))
      .toThrow(/Cifru neasteptat/);
  });
});

describe("interpreteazaRaspunsIpn", () => {
  it("extrage acțiunea, eroarea și identificatorul NETOPIA dintr-un IPN reușit", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<order type="card" id="pb-123" timestamp="20260918120000">
<mobilpay timestamp="20260918120005" crc="ABCDE">
<action>confirmed</action>
<purchase>7788990011</purchase>
<original_amount>450.50</original_amount>
<processed_amount>450.50</processed_amount>
<error code="0">Approved</error>
</mobilpay>
</order>`;
    expect(interpreteazaRaspunsIpn(xml)).toEqual({
      orderId: "pb-123", actiune: "confirmed", codEroare: "0", mesajEroare: "Approved",
      ntpId: "7788990011", sumaProcesata: 450.5,
    });
  });

  it("recunoaște o anulare, fără câmpurile opționale", () => {
    const xml = `<order id="pb-999"><mobilpay><action>canceled</action><error code="17">Card incorect</error></mobilpay></order>`;
    const r = interpreteazaRaspunsIpn(xml);
    expect(r.actiune).toBe("canceled");
    expect(r.codEroare).toBe("17");
    expect(r.ntpId).toBeNull();
  });
});

describe("raspunsAckXml", () => {
  it("fără eroare, doar mesajul", () => {
    expect(raspunsAckXml("ok")).toBe('<?xml version="1.0" encoding="utf-8" ?>\n<crc>ok</crc>');
  });
  it("cu eroare, include atributele", () => {
    expect(raspunsAckXml("nu am gasit rezervarea", { tip: 2, cod: 404 }))
      .toBe('<?xml version="1.0" encoding="utf-8" ?>\n<crc error_type="2" error_code="404">nu am gasit rezervarea</crc>');
  });
});
```

- [ ] **Step 2: Rulează testele — trebuie să eșueze cu „Cannot find module”**

Run: `npm test -- src/netopia.test.js`
Expected: FAIL — `Failed to resolve import "./lib/netopia.js"`.

- [ ] **Step 3: Scrie modulul**

```js
// @ts-check
/* Tot ce ține de NETOPIA (API v1, redirect) fără rețea și fără bază de
   date — testabil singur, importat neschimbat din funcțiile edge
   `netopia-start`/`netopia-ipn` (Deno înțelege `node:crypto` la fel ca
   Node, exact ca aici la testare — vezi și src/lib/ip.js pentru
   precedentul de import direct dintr-o funcție edge). */

import {
  randomBytes, publicEncrypt, privateDecrypt,
  createCipheriv, createDecipheriv, constants, X509Certificate,
} from "node:crypto";

export function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* XML-ul cererii de plată, versiunea 1 a API-ului NETOPIA — vezi
   docs/netopia-plan.md pentru de ce v1, nu v2. Structura e cea din
   documentația lor (Payment Request Structure); timestamp-ul e ora UTC
   a serverului, formatul YYYYMMDDHHiiss cerut de ei. */
export function construiesteXmlPlata({
  orderId, semnatura, suma, descriere, notifyUrl, returnUrl,
  client: { email, telefon, prenume, nume }, moneda = "RON",
}) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `<?xml version="1.0" encoding="utf-8"?>
<order type="card" id="${escXml(orderId)}" timestamp="${timestamp}">
<signature>${escXml(semnatura)}</signature>
<invoice currency="${escXml(moneda)}" amount="${Number(suma).toFixed(2)}">
<details>${escXml(descriere)}</details>
<contact_info>
<billing type="person">
<first_name>${escXml(prenume)}</first_name>
<last_name>${escXml(nume)}</last_name>
<email>${escXml(email)}</email>
<mobile_phone>${escXml(telefon)}</mobile_phone>
</billing>
</contact_info>
</invoice>
<url>
<confirm>${escXml(notifyUrl)}</confirm>
<return>${escXml(returnUrl)}</return>
</url>
</order>`;
}

/* PKCS1, nu OAEP: e formatul cerut de API-ul v1 NETOPIA (moștenit din
   mobilpay), nu o alegere a noastră — SubtleCrypto din browser nu suportă
   deloc acest padding pentru criptare, de-asta tot fluxul trăiește pe
   server (node:crypto), niciodată în browser. */
export function cripteazaPentruNetopia(xml, certificatPem) {
  const cheieAes = randomBytes(32);
  const iv = randomBytes(16);
  const cifru = createCipheriv("aes-256-cbc", cheieAes, iv);
  const data = Buffer.concat([cifru.update(xml, "utf8"), cifru.final()]);

  const cheiePublica = certificatPem.includes("BEGIN CERTIFICATE")
    ? new X509Certificate(certificatPem).publicKey
    : certificatPem;
  const envKey = publicEncrypt(
    { key: cheiePublica, padding: constants.RSA_PKCS1_PADDING },
    cheieAes,
  );

  return {
    envKey: envKey.toString("base64"),
    data: data.toString("base64"),
    cipher: "aes-256-cbc",
    iv: iv.toString("base64"),
  };
}

export function decripteazaDeLaNetopia({ envKey, data, cipher, iv }, cheiePrivataPem) {
  if (cipher !== "aes-256-cbc") {
    throw new Error(`Cifru neasteptat de la NETOPIA: ${cipher}`);
  }
  const cheieAes = privateDecrypt(
    { key: cheiePrivataPem, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(envKey, "base64"),
  );
  const decifru = createDecipheriv("aes-256-cbc", cheieAes, Buffer.from(iv, "base64"));
  const xml = Buffer.concat([decifru.update(Buffer.from(data, "base64")), decifru.final()]);
  return xml.toString("utf8");
}

function extrage(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/* Interpretează IPN-ul decriptat (structura din NETOPIA API v1 —
   Payment Response Structure). Extragere cu regex, nu parser XML: doar
   patru câmpuri fixe, cunoscute dinainte — un parser complet ar fi
   greutate pentru nimic. */
export function interpreteazaRaspunsIpn(xml) {
  const orderIdM = xml.match(/<order[^>]*\bid="([^"]*)"/);
  const eroareM = xml.match(/<error\s+code="([^"]*)"[^>]*>([\s\S]*?)<\/error>/);
  const sumaText = extrage(xml, "processed_amount");
  return {
    orderId: orderIdM ? orderIdM[1] : null,
    actiune: extrage(xml, "action"),
    codEroare: eroareM ? eroareM[1] : null,
    mesajEroare: eroareM ? eroareM[2] : null,
    ntpId: extrage(xml, "purchase"),
    sumaProcesata: sumaText ? Number(sumaText) : null,
  };
}

/* Răspunsul cerut de NETOPIA la fiecare IPN (Merchant's Response). Fără
   `eroare`, doar mesajul — cu `eroare`, atributele error_type/error_code
   care le spun dacă să reîncerce trimiterea. */
export function raspunsAckXml(mesaj, eroare) {
  const atribute = eroare ? ` error_type="${eroare.tip}" error_code="${eroare.cod}"` : "";
  return `<?xml version="1.0" encoding="utf-8" ?>\n<crc${atribute}>${escXml(mesaj)}</crc>`;
}
```

- [ ] **Step 4: Rulează testele — trebuie să treacă**

Run: `npm test -- src/netopia.test.js`
Expected: PASS, toate cele 9 teste.

- [ ] **Step 5: Typecheck și commit**

```bash
npm run typecheck
git add src/lib/netopia.js src/netopia.test.js
git commit -m "Modul pur pentru XML si criptarea NETOPIA (API v1)"
```

---

### Task 3: Funcția edge `netopia-start`

**Files:**
- Create: `supabase/functions/netopia-start/index.ts`

**Interfaces:**
- Consumes: `construiesteXmlPlata`, `cripteazaPentruNetopia` din `../../../src/lib/netopia.js`; RPC `create_public_booking` (Task 1); `ipClient` din `../../../src/lib/ip.js`.
- Produces: `POST /functions/v1/netopia-start` — cerere identică cu `booking-create` (`{turnstileToken?, idempotencyKey, checkin, checkout, rooms, guest, notes?}`), răspuns `{ confirmationNumber, publicToken, status, holdExpiresAt, total, rooms, plata: { url, envKey, data, cipher, iv } }` când rezervarea e nouă (`pending`), sau doar câmpurile rezervării (fără `plata`) când e o repetare deja confirmată/anulată/expirată.

- [ ] **Step 1: Scrie funcția**

```ts
// Pornește plata cu cardul pentru o rezervare nouă de pe site.
//
// POST /functions/v1/netopia-start
//   { turnstileToken?, idempotencyKey, checkin, checkout, rooms, guest, notes? }
//
// Creează rezervarea EXACT ca booking-create (aceeași funcție din bază,
// aceleași validări și plafoane), dar NU o confirmă niciodată aici — spre
// deosebire de cash/transfer, unde emailul de confirmare o face fermă,
// cardul o ține până vine IPN-ul de plată (netopia-ipn). Formularul de
// card nu există pe pagina noastră: browserul primește un plic criptat și
// îl trimite direct către pagina găzduită NETOPIA — vezi docs/netopia-plan.md
// pentru de ce (API v1, nu v2; redirect, nu iframe).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipClient } from "../../../src/lib/ip.js";
import { construiesteXmlPlata, cripteazaPentruNetopia } from "../../../src/lib/netopia.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
const URL_REZERVARI = Deno.env.get("BOOKING_APP_URL") || "https://rezervari.lalivada.ro";

const NETOPIA_SIGNATURE = Deno.env.get("NETOPIA_SIGNATURE") || "";
const NETOPIA_PUBLIC_CERT = Deno.env.get("NETOPIA_PUBLIC_CERT") || "";
const NETOPIA_LIVE = Deno.env.get("NETOPIA_LIVE") === "true";
const NETOPIA_URL = NETOPIA_LIVE
  ? "https://secure.mobilpay.ro"
  : "https://sandboxsecure.mobilpay.ro";

/* Camera se ține până la plată exact cât la cash/transfer — destul cât să
   nu se blocheze o cameră o după-amiază întreagă dacă oaspetele abandonează
   pagina NETOPIA. */
const MINUTE_HOLD = Number(Deno.env.get("BOOKING_HOLD_MINUTES") || "30");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function raspuns(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/* Copia turnstileTrecut din booking-create/index.ts — Deno nu importă de
   acolo (fiecare funcție edge e propriul ei bundle). Dacă schimbi
   verificarea, schimb-o în amândouă. */
async function turnstileTrecut(token: string | undefined, ip: string | null): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const corp = new FormData();
    corp.append("secret", TURNSTILE_SECRET);
    corp.append("response", token);
    if (ip) corp.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: corp });
    const d = await r.json();
    if (!d.success) console.warn("Turnstile a respins cererea", d["error-codes"]);
    return d.success === true;
  } catch (e) {
    console.error("Turnstile nu a răspuns, las cererea să treacă", e);
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  if (!NETOPIA_SIGNATURE || !NETOPIA_PUBLIC_CERT) {
    console.error("NETOPIA_SIGNATURE sau NETOPIA_PUBLIC_CERT nu sunt setate.");
    return raspuns({ error: "Plata cu cardul nu e încă disponibilă. Alege cash sau transfer bancar." }, 503);
  }

  let c: any;
  try {
    c = await req.json();
  } catch {
    return raspuns({ error: "Corp de cerere invalid." }, 400);
  }

  const ip = ipClient(req);

  if (!(await turnstileTrecut(c?.turnstileToken, ip))) {
    return raspuns({ error: "Nu am putut confirma că cererea vine de la o persoană. Reîncarcă pagina și încearcă din nou." }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const g = c?.guest || {};
  const { data, error } = await admin.rpc("create_public_booking", {
    p_idempotency_key: c?.idempotencyKey,
    p_checkin: c?.checkin,
    p_checkout: c?.checkout,
    p_last_name: g.nume,
    p_first_name: g.prenume,
    p_phone: g.telefon,
    p_email: g.email || null,
    p_city: g.oras,
    p_county: g.judet,
    p_country: g.tara,
    p_rooms: c?.rooms,
    p_notes: c?.notes || null,
    // Mereu ținută, indiferent de RESEND_API_KEY: aici confirmarea vine
    // din plată, nu din email.
    p_hold_minutes: MINUTE_HOLD,
    p_client_ip: ip,
    p_metoda_plata: "card",
    p_plata_status: "asteapta",
  });

  if (error) {
    return raspuns({ error: error.message, code: (error as any).code }, 400);
  }

  const rezervare = { ...data, guestName: `${g.prenume || ""} ${g.nume || ""}`.trim() };

  /* Repetare a unei rezervări deja confirmate/anulate/expirate (aceeași
     cheie de idempotență trimisă a doua oară) — nu mai are sens un nou
     plic de plată. Frontend-ul citește status-ul și decide ce arată. */
  if (data?.status !== "pending") return raspuns(rezervare);

  const xml = construiesteXmlPlata({
    orderId: data.publicToken,
    semnatura: NETOPIA_SIGNATURE,
    suma: data.total,
    descriere: `Cazare Complex La Livadă — ${data.confirmationNumber}`,
    notifyUrl: `${SUPABASE_URL}/functions/v1/netopia-ipn`,
    returnUrl: `${URL_REZERVARI}/?token=${data.publicToken}`,
    client: { email: g.email || "", telefon: g.telefon || "", prenume: g.prenume || "", nume: g.nume || "" },
  });
  const plic = cripteazaPentruNetopia(xml, NETOPIA_PUBLIC_CERT);

  return raspuns({
    ...rezervare,
    plata: { url: NETOPIA_URL, envKey: plic.envKey, data: plic.data, cipher: plic.cipher, iv: plic.iv },
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: fără erori noi (fișierul e Deno/`.ts`, nu intră în `jsconfig.json` — dacă typecheck-ul îl ignoră deja ca la `booking-create/index.ts`, e comportamentul corect; verifică doar că nu s-a stricat nimic existent).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/netopia-start/index.ts
git commit -m "Functia edge netopia-start: porneste plata cu cardul"
```

---

### Task 4: Funcția edge `netopia-ipn`

**Files:**
- Create: `supabase/functions/netopia-ipn/index.ts`

**Interfaces:**
- Consumes: `decripteazaDeLaNetopia`, `interpreteazaRaspunsIpn`, `raspunsAckXml` din `../../../src/lib/netopia.js`; RPC-urile `confirm_card_payment`, `mark_card_payment_failed` (Task 1).
- Produces: `POST /functions/v1/netopia-ipn` — primește `application/x-www-form-urlencoded` cu `env_key`/`data`/`cipher`/`iv` de la NETOPIA, întoarce XML (`Content-Type: application/xml`), status 200 mereu.

- [ ] **Step 1: Scrie funcția**

```ts
// Primește notificarea asincronă de plată (IPN) de la NETOPIA.
//
// POST /functions/v1/netopia-ipn   application/x-www-form-urlencoded
//   env_key, data, cipher, iv
//
// DEPLOYEAZĂ CU --no-verify-jwt: NETOPIA nu trimite niciun JWT al nostru.
// Autentificarea reală e criptografică — doar cine deține certificatul
// public al comerciantului poate produce un plic pe care cheia noastră
// privată să-l decripteze la ceva coerent.
//
// Scrie payload-ul brut ÎNAINTE de orice procesare (netopia_ipn_log) —
// exact modelul access-webhook: o plată reală nu se pierde niciodată,
// chiar dacă restul logicii aruncă o eroare neprevăzută. Răspunde mereu
// 200 cu XML-ul de confirmare cerut de NETOPIA, indiferent de rezultatul
// intern, ca să nu declanșeze reîncercări pentru o eroare doar a noastră.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decripteazaDeLaNetopia, interpreteazaRaspunsIpn, raspunsAckXml } from "../../../src/lib/netopia.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NETOPIA_PRIVATE_KEY = Deno.env.get("NETOPIA_PRIVATE_KEY") || "";

function xmlRaspuns(corp: string): Response {
  return new Response(corp, { status: 200, headers: { "Content-Type": "application/xml" } });
}

const ACTIUNI_SUCCES = new Set(["confirmed", "paid"]);
const ACTIUNI_ESUATE = new Set(["canceled", "credit"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return xmlRaspuns(raspunsAckXml("Metodă nepermisă."));

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let campuri: Record<string, string>;
  try {
    campuri = Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return xmlRaspuns(raspunsAckXml("Corp de cerere invalid.", { tip: 2, cod: 400 }));
  }

  // Auditul brut, ÎNAINTE de decriptare — dacă decriptarea sau tot restul
  // pică, rândul există oricum și poate fi reconciliat manual.
  const { data: audit } = await admin.from("netopia_ipn_log")
    .insert({ payload: JSON.stringify(campuri).slice(0, 4000) })
    .select("id").single();
  const idAudit = audit?.id;

  async function incheie(rezultat: "ok" | "eroare", detaliu: string, publicToken?: string | null) {
    if (idAudit) {
      await admin.from("netopia_ipn_log")
        .update({ rezultat, detaliu: detaliu.slice(0, 900), public_token: publicToken ?? null })
        .eq("id", idAudit);
    }
  }

  if (!NETOPIA_PRIVATE_KEY) {
    await incheie("eroare", "NETOPIA_PRIVATE_KEY nu e setată.");
    console.error("netopia-ipn: NETOPIA_PRIVATE_KEY nu e setată.");
    return xmlRaspuns(raspunsAckXml("Configurare lipsă.", { tip: 1, cod: 500 }));
  }

  let xml: string;
  try {
    xml = decripteazaDeLaNetopia(
      { envKey: campuri.env_key, data: campuri.data, cipher: campuri.cipher, iv: campuri.iv },
      NETOPIA_PRIVATE_KEY,
    );
  } catch (e) {
    await incheie("eroare", `Decriptare eșuată: ${e}`);
    console.error("netopia-ipn: decriptare eșuată", e);
    return xmlRaspuns(raspunsAckXml("Nu am putut decripta cererea.", { tip: 2, cod: 400 }));
  }

  const rasp = interpreteazaRaspunsIpn(xml);
  if (!rasp.orderId) {
    await incheie("eroare", "IPN fără order id.");
    return xmlRaspuns(raspunsAckXml("Cerere fără identificator de comandă.", { tip: 2, cod: 400 }));
  }

  const succes = rasp.codEroare === "0" && ACTIUNI_SUCCES.has(rasp.actiune || "");
  const esuat = ACTIUNI_ESUATE.has(rasp.actiune || "") || (rasp.codEroare !== "0" && rasp.codEroare !== null);

  try {
    if (succes) {
      const { data: rez, error } = await admin.rpc("confirm_card_payment", {
        p_token: rasp.orderId,
        p_ntp_id: rasp.ntpId,
        p_amount: rasp.sumaProcesata,
      });
      if (error) throw error;

      if (rez?.status === "confirmed" && !rez?.repeat) {
        // Emailul de confirmare, exact cel folosit și la cash/transfer —
        // nicio șablonare nouă, doar chemarea funcției care există deja.
        fetch(`${SUPABASE_URL}/functions/v1/booking-email`, {
          method: "POST",
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ token: rasp.orderId }),
        }).catch((e) => console.warn("netopia-ipn: emailul de confirmare nu a putut fi trimis", e));
      }
      await incheie("ok", `Plată confirmată. Acțiune: ${rasp.actiune}.`, rasp.orderId);
    } else if (esuat) {
      await admin.rpc("mark_card_payment_failed", { p_token: rasp.orderId });
      await incheie("ok", `Plată eșuată/anulată. Acțiune: ${rasp.actiune}, eroare: ${rasp.codEroare}.`, rasp.orderId);
    } else {
      // Acțiune necunoscută sau intermediară (ex. *_pending) — consemnăm,
      // dar nu schimbăm nimic; rezervarea rămâne ținută.
      await incheie("ok", `Acțiune neprocesată: ${rasp.actiune}, eroare: ${rasp.codEroare}.`, rasp.orderId);
    }
  } catch (e) {
    await incheie("eroare", `Procesare eșuată: ${e}`, rasp.orderId);
    console.error("netopia-ipn: procesare eșuată", e);
  }

  return xmlRaspuns(raspunsAckXml("ok"));
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/netopia-ipn/index.ts
git commit -m "Functia edge netopia-ipn: proceseaza notificarea de plata"
```

---

### Task 5: Funcția edge `netopia-refund-notice`

**Files:**
- Create: `supabase/functions/netopia-refund-notice/index.ts`

**Interfaces:**
- Consumes: RPC `booking_refund_payload` (Task 1).
- Produces: `POST /functions/v1/netopia-refund-notice { token }` → `{ ok: true, notice: boolean }`.

- [ ] **Step 1: Scrie funcția**

```ts
// Trimite un email intern când o rezervare plătită cu cardul e anulată,
// ca Ovidiu să știe să facă rambursarea manual din contul NETOPIA — API-ul
// lor de refund pentru cardul online nu e încă lansat (docs/netopia-plan.md).
//
// POST /functions/v1/netopia-refund-notice   { "token": "<public_token>" }
//
// Se apelează DUPĂ ce anularea a reușit (cancel_public_booking), din
// interfață — la fel ca trimiteEmailConfirmare. Un eșec aici nu anulează
// nimic: rezervarea e deja anulată, doar avizul de rambursare ar lipsi.
//
// Nu primește niciun conținut de la client: citește singură datele după
// token, ca la booking-email.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EXPEDITOR = Deno.env.get("BOOKING_EMAIL_FROM") || "La Livada <rezervari@lalivada.ro>";
const CATRE = Deno.env.get("NETOPIA_REFUND_EMAIL_CATRE") || "office@lalivada.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function raspuns(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bani = (n: number) =>
  new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Number(n)) + " lei";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return raspuns({ error: "Metodă nepermisă." }, 405);

  let corp: any;
  try {
    corp = await req.json();
  } catch {
    return raspuns({ error: "Corp de cerere invalid." }, 400);
  }
  const token = corp?.token;
  if (!token) return raspuns({ error: "Lipsește tokenul." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: d, error } = await admin.rpc("booking_refund_payload", { p_token: token });
  if (error) {
    console.error("netopia-refund-notice: nu am putut citi datele", error);
    return raspuns({ error: "Nu am putut citi datele rezervării." }, 500);
  }
  if (!d) return raspuns({ ok: true, notice: false });

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY nu e setată — avizul de rambursare nu a plecat.", d.confirmationNumber);
    return raspuns({ ok: true, notice: false });
  }

  const corpEmail = [
    `Rezervarea ${d.confirmationNumber} (${esc(d.guestName)}) a fost anulată.`,
    `Plătită cu cardul — de rambursat manual din contul NETOPIA:`,
    ``,
    `Suma plătită: ${bani(d.sumaPlatita)}`,
    `De rambursat (minus prima noapte, conform politicii): ${bani(d.refundSuggerat)}`,
    `Identificator NETOPIA (ntpID): ${d.netopiaNtpId || "—"}`,
  ].join("\n");

  let trimis = false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EXPEDITOR,
        to: [CATRE],
        subject: `De rambursat: ${d.confirmationNumber} · ${bani(d.refundSuggerat)}`,
        text: corpEmail,
        html: `<pre style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;white-space:pre-wrap;">${esc(corpEmail)}</pre>`,
      }),
    });
    trimis = r.ok;
    if (!r.ok) console.error("netopia-refund-notice: trimiterea a eșuat", r.status,
      (await r.text().catch(() => "")).slice(0, 300));
  } catch (e) {
    console.error("netopia-refund-notice: serviciul de email nu a răspuns", e);
  }

  return raspuns({ ok: true, notice: trimis });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/netopia-refund-notice/index.ts
git commit -m "Functia edge netopia-refund-notice: avizul de rambursare manuala"
```

---

### Task 6: `booking-create` trece metoda de plată mai departe

**Files:**
- Modify: `supabase/functions/booking-create/index.ts:190-205`

**Interfaces:**
- Consumes: `create_public_booking` cu semnătura extinsă (Task 1).
- Produces: nimic nou — `booking-create` acceptă acum opțional `metodaPlata: 'cash'|'transfer'` în corpul cererii (implicit `'cash'`).

- [ ] **Step 1: Modifică apelul RPC**

```ts
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const g = c?.guest || {};
  const metodaPlata = c?.metodaPlata === "transfer" ? "transfer" : "cash";
  const { data, error } = await admin.rpc("create_public_booking", {
    p_idempotency_key: c?.idempotencyKey,
    p_checkin: c?.checkin,
    p_checkout: c?.checkout,
    p_last_name: g.nume,
    p_first_name: g.prenume,
    p_phone: g.telefon,
    p_email: g.email || null,
    p_city: g.oras,
    p_county: g.judet,
    p_country: g.tara,
    p_rooms: c?.rooms,
    p_notes: c?.notes || null,
    p_hold_minutes: cuConfirmare ? MINUTE_HOLD : 0,
    p_client_ip: ip,
    p_metoda_plata: metodaPlata,
  });
```

(Doar liniile `const metodaPlata = ...` și `p_metoda_plata: metodaPlata,` sunt noi — restul rămâne identic cu ce există la `supabase/functions/booking-create/index.ts:188-205`.)

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/booking-create/index.ts
git commit -m "booking-create: trece metoda de plata (cash/transfer) catre baza"
```

---

### Task 7: `src/booking/api.js` — funcțiile noi

**Files:**
- Modify: `src/booking/api.js`

**Interfaces:**
- Consumes: funcțiile edge `netopia-start` (Task 3), `netopia-refund-notice` (Task 5).
- Produces: `creeazaRezervare({..., metodaPlata})` (parametru nou, opțional, implicit `'cash'`), `porneStePlataCard({cheieIdempotenta, checkin, checkout, camere, oaspete, cerinte, jetonTurnstile}) → Promise<{..., plata?: {url,envKey,data,cipher,iv}}>`, `trimiteAvizRambursare(token) → Promise<void>` (nu aruncă).

- [ ] **Step 1: Extinde `creeazaRezervare` și adaugă funcțiile noi**

Modifică `creeazaRezervare` (linia 150 din `src/booking/api.js`) ca să primească și să trimită `metodaPlata`:

```js
export function creeazaRezervare({
  cheieIdempotenta, checkin, checkout, camere, oaspete, cerinte, jetonTurnstile,
  metodaPlata = "cash",
}) {
  return functie("booking-create", {
    idempotencyKey: cheieIdempotenta,
    checkin, checkout,
    rooms: camere,
    notes: cerinte || null,
    turnstileToken: jetonTurnstile || null,
    metodaPlata,
    guest: {
      nume: oaspete.nume,
      prenume: oaspete.prenume,
      telefon: telefonInternational(oaspete.prefix, oaspete.telefon),
      email: oaspete.email || null,
      oras: oaspete.oras,
      judet: oaspete.judet,
      tara: oaspete.tara,
    },
  }, TIMEOUT_CREARE_MS);
}

/* Pornește plata cu cardul: creează rezervarea (ținută, ca la cash/transfer
   cu confirmare pe email) și întoarce plicul criptat de trimis către
   pagina găzduită NETOPIA. Vezi trimiteFormularNetopia din App.jsx pentru
   redirectul propriu-zis. */
export function porneStePlataCard({
  cheieIdempotenta, checkin, checkout, camere, oaspete, cerinte, jetonTurnstile,
}) {
  return functie("netopia-start", {
    idempotencyKey: cheieIdempotenta,
    checkin, checkout,
    rooms: camere,
    notes: cerinte || null,
    turnstileToken: jetonTurnstile || null,
    guest: {
      nume: oaspete.nume,
      prenume: oaspete.prenume,
      telefon: telefonInternational(oaspete.prefix, oaspete.telefon),
      email: oaspete.email || null,
      oras: oaspete.oras,
      judet: oaspete.judet,
      tara: oaspete.tara,
    },
  }, TIMEOUT_CREARE_MS);
}

/* Avizul de rambursare, doar pentru rezervările anulate care fuseseră
   plătite cu cardul. Ca la trimiteEmailConfirmare: nu aruncă niciodată —
   anularea a reușit deja, un eșec aici nu trebuie să pară o eroare a
   oaspetelui. */
export async function trimiteAvizRambursare(token) {
  try {
    const r = await fetchCuTimeout(`${URL_BAZA}/functions/v1/netopia-refund-notice`, {
      method: "POST",
      headers: {
        apikey: CHEIE,
        Authorization: `Bearer ${CHEIE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    if (!r.ok) console.warn("Avizul de rambursare nu a putut fi trimis.", r.status);
  } catch {
    console.warn("Avizul de rambursare nu a putut fi trimis (rețea).");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: fără erori.

- [ ] **Step 3: Commit**

```bash
git add src/booking/api.js
git commit -m "api.js: porneStePlataCard si trimiteAvizRambursare"
```

---

### Task 8: UI — selectorul de plată, redirectul și textul de rambursare

**Files:**
- Modify: `src/booking/App.jsx`
- Modify: `src/booking/styles.js`

**Interfaces:**
- Consumes: `porneStePlataCard`, `trimiteAvizRambursare` din `./api.js` (Task 7); `plata`/`metodaPlata`/`plataStatus`/`refundSuggerat` din răspunsurile edge-function/RPC (Task 1, 3).
- Produces: stare nouă `metodaPlata` în `App.jsx`; funcția `trimiteFormularNetopia(plata)`.

- [ ] **Step 1: Adaugă clasele CSS**

Adaugă în `src/booking/styles.js`, lângă regulile `.ldv-btn-*` (linia ~280). Variabilele folosite (`--ldv-ink`, `--ldv-muted`, `--ldv-surface-2`) sunt cele deja definite în `:root` la începutul fișierului (liniile 21-34) — nu inventează nume noi:

```css
.ldv-metode-plata{ margin-top:18px; }
.ldv-metoda-card{
  display:flex; gap:12px; align-items:flex-start;
  padding:14px 16px; border:2px solid var(--ldv-ink); border-radius:10px;
  background:var(--ldv-surface-2); cursor:pointer;
}
.ldv-metoda-card input{ margin-top:3px; }
.ldv-metoda-card-titlu{ font-weight:650; }
.ldv-metode-secundare{
  display:flex; gap:16px; margin-top:10px; padding-left:4px;
  font-size:13px; color:var(--ldv-muted);
}
.ldv-metode-secundare label{ display:flex; align-items:center; gap:6px; cursor:pointer; }
```

- [ ] **Step 2: Importă funcțiile noi în `App.jsx`**

Modifică linia 30 din `src/booking/App.jsx`:

```jsx
import {
  cautaDisponibilitate, creeazaRezervare, citesteRezervare, citesteCapacitatea,
  anuleazaRezervare, trimiteEmailConfirmare, confirmaRezervare, COD_INDISPONIBIL,
  porneStePlataCard, trimiteAvizRambursare,
} from "./api.js";
```

- [ ] **Step 3: Adaugă starea `metodaPlata`**

Lângă `const [cerinte, setCerinte] = useState("");` (linia 142):

```jsx
  /* 'card' implicit — e opțiunea pe care vrem s-o încurajăm. Oaspetele
     poate trece pe cash/transfer din rândul mic de dedesubt. */
  const [metodaPlata, setMetodaPlata] = useState("card");
```

- [ ] **Step 4: Adaugă funcția de redirect, lângă `trimite()`**

Înainte de `async function trimite() {` (linia 318):

```jsx
  /* Trimite browserul direct către pagina găzduită NETOPIA — un formular
     POST clasic, nu fetch: cardul se introduce pe domeniul lor, niciodată
     pe al nostru. Formularul se creează, se trimite și dispare o dată cu
     navigarea; nu rămâne nimic de curățat. */
  function trimiteFormularNetopia(plata) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = plata.url;
    for (const [nume, valoare] of Object.entries({
      env_key: plata.envKey, data: plata.data, cipher: plata.cipher, iv: plata.iv,
    })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = nume;
      input.value = valoare;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }
```

- [ ] **Step 5: Modifică `trimite()` să ramifice pe metoda de plată**

Înlocuiește corpul `try` din `trimite()` (liniile 329-353 din `src/booking/App.jsx`):

```jsx
    try {
      const camere = (optiune?.rooms || []).map((r) => ({
        roomType: r.roomType, adults: r.adults, children: r.children,
      }));

      if (metodaPlata === "card") {
        const d = await porneStePlataCard({
          cheieIdempotenta: cheie,
          checkin: laSosire(cautare.checkin),
          checkout: laPlecare(cautare.checkout),
          camere, oaspete, cerinte, jetonTurnstile: jeton,
        });
        if (d.plata) {
          trimiteFormularNetopia(d.plata);
          return; // browserul pleacă spre NETOPIA — nimic de mai făcut aici
        }
        // Repetare a unei cereri deja rezolvate (aceeași cheie de
        // idempotență) — arătăm direct ecranul de confirmare, ca la
        // cash/transfer.
        setConfirmare({
          confirmationNumber: d.confirmationNumber,
          checkIn: laSosire(cautare.checkin), checkOut: laPlecare(cautare.checkout),
          rooms: d.rooms, total: d.total, status: d.status,
          holdExpiresAt: d.holdExpiresAt,
          guestName: `${oaspete.prenume} ${oaspete.nume}`.trim(),
          publicToken: d.publicToken, metodaPlata: d.metodaPlata,
          canCancel: d.status === "confirmed",
        });
        setStare("confirmat");
        return;
      }

      const d = await creeazaRezervare({
        cheieIdempotenta: cheie,
        checkin: laSosire(cautare.checkin),
        checkout: laPlecare(cautare.checkout),
        camere, oaspete, cerinte, jetonTurnstile: jeton, metodaPlata,
      });
      setConfirmare({
        confirmationNumber: d.confirmationNumber,
        checkIn: laSosire(cautare.checkin),
        checkOut: laPlecare(cautare.checkout),
        rooms: d.rooms, total: d.total, status: d.status,
        holdExpiresAt: d.holdExpiresAt,
        guestName: `${oaspete.prenume} ${oaspete.nume}`.trim(),
        publicToken: d.publicToken, metodaPlata: d.metodaPlata,
        canCancel: d.status === "confirmed",
      });
      setStare("confirmat");
      if (d.status === "confirmed") trimiteEmailConfirmare(d.publicToken);
    } catch (e) {
```

(Restul blocului `catch` de la linia 354 rămâne neschimbat.)

- [ ] **Step 6: Adaugă selectorul de plată în pasul „date"**

Înlocuiește paragraful `ldv-nota-plata` (liniile 706-708 din `src/booking/App.jsx`):

```jsx
          <div className="ldv-metode-plata">
            <label className="ldv-metoda-card">
              <input type="radio" name="metodaPlata" value="card"
                checked={metodaPlata === "card"}
                onChange={() => setMetodaPlata("card")} />
              <span>
                <span className="ldv-metoda-card-titlu">Plătește cu cardul</span>
                <p className="ldv-mic" style={{ margin: "4px 0 0" }}>
                  Sigur, prin NETOPIA. Rezervarea se confirmă imediat după plată.
                </p>
              </span>
            </label>
            <div className="ldv-metode-secundare">
              <label>
                <input type="radio" name="metodaPlata" value="cash"
                  checked={metodaPlata === "cash"}
                  onChange={() => setMetodaPlata("cash")} />
                cash la sosire
              </label>
              <label>
                <input type="radio" name="metodaPlata" value="transfer"
                  checked={metodaPlata === "transfer"}
                  onChange={() => setMetodaPlata("transfer")} />
                transfer bancar
              </label>
            </div>
          </div>
```

(`style={{margin:...}}` e singurul stil inline nou — un rând, nu o valoare calculată; dacă testul de plafon din `src/stiluri-inline.test.js` există și pentru `src/booking/`, verifică-l la Step 9. Dacă nu acoperă `booking/`, nu contează.)

- [ ] **Step 7: Textul de așteptare pentru card, la ecranul „confirmat"**

Modifică ramura `pending` din blocul de confirmare (liniile 745-754 din `src/booking/App.jsx`):

```jsx
          ) : confirmare.status === "pending" && confirmare.metodaPlata === "card" ? (
            <div className="ldv-alerta ldv-alerta-info ldv-alerta-confirmare">
              <strong>Verificăm plata cu NETOPIA.</strong>
              <p className="ldv-alerta-detalii">
                Dacă ai fost adus înapoi de pe pagina de plată, confirmarea
                poate dura câteva secunde. Reîmprospătează pagina dacă nu se
                actualizează singură.
              </p>
            </div>
          ) : confirmare.status === "pending" ? (
            <div className="ldv-alerta ldv-alerta-info ldv-alerta-confirmare">
              <strong>Ți-am trimis un email la {oaspete.email || "adresa dată"}.</strong>
              <p className="ldv-alerta-detalii">
                Apasă butonul din mesaj ca rezervarea să devină fermă. Ținem
                camerele {minuteRamase(confirmare.holdExpiresAt)}; dacă nu
                confirmi, se eliberează singure și poți relua căutarea
                oricând. Verifică și în Spam.
              </p>
            </div>
          ) : confirmare.status === "expired" ? (
```

- [ ] **Step 8: Reîmprospătare automată cât timp plata e în așteptare**

Adaugă, lângă celelalte `useEffect` din `App.jsx` (după cel de la linia 194):

```jsx
  /* Cât timp pagina arată "verificăm plata", IPN-ul poate ajunge la câteva
     secunde după redirect. O singură reîncercare, nu un poll continuu:
     dacă tot nu s-a schimbat nimic, omul apasă el reîmprospătare — nu
     trebuie să ținem o buclă vie cât stă pe pagină. */
  useEffect(() => {
    if (stare !== "confirmat") return;
    if (confirmare?.status !== "pending" || confirmare?.metodaPlata !== "card") return;
    const token = confirmare.publicToken;
    if (!token) return;
    const id = setTimeout(() => {
      citesteRezervare(token)
        .then((d) => { if (d) setConfirmare((c) => ({ ...c, ...d })); })
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stare, confirmare?.status, confirmare?.metodaPlata, confirmare?.publicToken]);
```

- [ ] **Step 9: Textul de rambursare la anulare**

Modifică `confirmaAnularea()` (liniile 369-381 din `src/booking/App.jsx`):

```jsx
  async function confirmaAnularea() {
    setEroare("");
    setAnuleazaAcum(true);
    try {
      const d = await anuleazaRezervare(confirmare.publicToken);
      setConfirmare((c) => ({ ...c, status: "cancelled", canCancel: false, refundSuggerat: d?.refundSuggerat }));
      setCereAnulare(false);
      if (confirmare.metodaPlata === "card") trimiteAvizRambursare(confirmare.publicToken);
    } catch (e) {
      setEroare(e.message);
    } finally {
      setAnuleazaAcum(false);
    }
  }
```

Și blocul `cancelled` din ecranul de confirmare (liniile 740-744):

```jsx
          {confirmare.status === "cancelled" ? (
            <div className="ldv-alerta ldv-alerta-info ldv-alerta-confirmare">
              Camerele au fost eliberate. Dacă a fost o greșeală, sună-ne —
              putem verifica dacă mai sunt disponibile.
              {confirmare.refundSuggerat > 0 && (
                <p className="ldv-alerta-detalii">
                  Vei primi înapoi {fmtBani(confirmare.refundSuggerat)} pe
                  cardul folosit — se face manual, în câteva zile lucrătoare.
                </p>
              )}
            </div>
          ) : confirmare.status === "pending" && confirmare.metodaPlata === "card" ? (
```

- [ ] **Step 10: Pornește dev server-ul și verifică manual în browser**

Run: `npm run dev` (sau `preview_start` cu configurația din `.claude/launch.json`, dacă există deja una pentru `booking/`)

Deschide pagina de rezervări, mergi până la pasul „Datele tale" și verifică:
- Radio-ul „Plătește cu cardul" e ales implicit, cu chenar vizibil.
- Cash/transfer apar dedesubt, cu litere mici.
- Fără `NETOPIA_SIGNATURE`/`NETOPIA_PUBLIC_CERT` puse (cazul de azi, până la Task 9), apăsarea „Trimite rezervarea" cu cardul ales întoarce eroarea „Plata cu cardul nu e încă disponibilă" — normal, verifică doar că mesajul apare, nu o pagină albă.
- Cu „cash la sosire" ales, fluxul rămâne identic cu cel de dinainte de această schimbare.

- [ ] **Step 11: Typecheck și commit**

```bash
npm run typecheck
git add src/booking/App.jsx src/booking/styles.js
git commit -m "UI: selector de plata (card principal), redirect Netopia, text rambursare"
```

---

### Task 9: Secretele lui Ovidiu și testarea cap-coadă în sandbox

Nu e cod — e pasul manual, ca la Oblio/Shelly/TTLock/Aiosell. Se face DUPĂ ce Task-urile 1-8 sunt pe `main`.

- [ ] **Step 1: Ovidiu obține certificatele NETOPIA**

Din contul NETOPIA (admin → Puncte de vânzare → Setări tehnice): certificatul public al NETOPIA (pentru criptarea cererii) și o pereche de chei RSA proprii sau primite de la ei (cheia privată, pentru decriptarea IPN-ului). Pași exacți în `docs/netopia-plan.md`, secțiunea „Secretele și pașii manuali ai lui Ovidiu".

- [ ] **Step 2: Ovidiu pune secretele în Supabase (Edge Functions → Secrets)**

```
NETOPIA_SIGNATURE=XXXX-XXXX-XXXX-XXXX
NETOPIA_PUBLIC_CERT=-----BEGIN CERTIFICATE-----...
NETOPIA_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
NETOPIA_LIVE=false
```

- [ ] **Step 3: Deployează funcțiile edge**

```bash
npx supabase functions deploy netopia-start --project-ref suoowrginsliyrbxqeap
npx supabase functions deploy netopia-ipn --project-ref suoowrginsliyrbxqeap --no-verify-jwt
npx supabase functions deploy netopia-refund-notice --project-ref suoowrginsliyrbxqeap
```

- [ ] **Step 4: Test cap-coadă în sandbox**

Cu `NETOPIA_LIVE=false`, o rezervare reală prin interfață, cu un card de test din documentația NETOPIA (`doc.netopia-payments.com`). Verifică:
- redirectul chiar ajunge pe `sandboxsecure.mobilpay.ro`;
- după plată, revii pe `/?token=...` și ecranul arată „Verificăm plata" apoi „Rezervarea e înregistrată";
- rândul din `netopia_ipn_log` are `rezultat='ok'`;
- `public_bookings.plata_status='platit'`, `netopia_ntp_id` completat;
- emailul de confirmare a plecat;
- o anulare după aceea întoarce `refundSuggerat` corect și trimite avizul intern.

- [ ] **Step 5: Trece pe live și actualizează documentația**

Cu totul verificat: `NETOPIA_LIVE=true`, apoi actualizează `docs/netopia-plan.md` (adaugă o notă „Implementată pe <dată>") și rândul din `docs/README.md`, într-un commit separat.
