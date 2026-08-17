-- =====================================================================
-- La Livada PMS — schema completă a bazei de date (Supabase / Postgres)
--
-- Rulează acest fișier pe un proiect Supabase gol ca să reconstruiești
-- întreaga structură. NU conține date — doar tabele, funcții, indecși
-- și politici de acces.
--
-- Migrarea datelor din vechiul tabel app_state (format JSON) se află
-- la finalul fișierului, comentată. Se rulează o singură dată, doar
-- dacă mai există date vechi de recuperat.
-- =====================================================================


-- ---------------------------------------------------------------------
-- EXTENSII
-- btree_gist: necesară pentru constrângerea de suprapunere (EXCLUDE)
--             care combină egalitate pe room_id cu suprapunere pe interval
-- pgcrypto:   pentru gen_random_bytes (token-uri iCal, id-uri)
-- ---------------------------------------------------------------------
create extension if not exists btree_gist;
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------
-- CAMERE
-- ical_token: fiecare cameră are propria adresă iCal, imposibil de
--             ghicit. Fără token, oricine ar putea citi ocuparea
--             oricărei camere doar ghicind numărul.
-- ---------------------------------------------------------------------
create table rooms (
  id          text primary key,
  name        text not null,
  type        text not null check (type in ('tiny','loft')),
  capacity    int  not null default 2,
  shelly_id   text,                        -- releu boiler
  vent_id     text,                        -- releu ventilație
  sensibo_id  text,                        -- control AC
  ical_token  text not null default encode(gen_random_bytes(16),'hex'),
  active      boolean not null default true,
  sort_order  int  not null default 0
);


-- ---------------------------------------------------------------------
-- CLIENȚI
-- Câmpurile obligatorii reflectă regula din aplicație: nume, prenume,
-- telefon, oraș, județ, țară.
-- ---------------------------------------------------------------------
create table guests (
  id          text primary key,
  last_name   text not null,
  first_name  text not null,
  phone       text not null,
  email       text,
  address     text,
  city        text not null,
  county      text not null,
  country     text not null default 'România',
  notes       text,
  seeded      boolean not null default false,   -- date de test, ștergibile separat
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- GRUPURI
-- ---------------------------------------------------------------------
create table res_groups (
  id             text primary key,
  name           text not null,
  main_guest_id  text references guests(id) on delete set null,
  notes          text,
  seeded         boolean not null default false,
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- REZERVĂRI
--
-- Blocajele de mentenanță se țin TOT aici, cu source = 'blocaj', nu
-- într-un tabel separat. Motivul: constrângerea de suprapunere de mai
-- jos acoperă un singur tabel. Dacă blocajele ar sta separat, o
-- rezervare de pe site și un blocaj creat simultan nu s-ar vedea
-- reciproc și camera ar putea fi vândută peste o mentenanță.
--
-- external_uid / external_source: pentru rezervările importate din
-- Booking/Airbnb prin iCal — permit re-importul fără duplicate.
--
-- hold_expires_at: nefolosit momentan (rezervările de pe site intră
-- direct 'confirmed', fără plată). Rămâne pentru cazul în care se
-- adaugă plata online și e nevoie de rezervări temporare.
-- ---------------------------------------------------------------------
create table reservations (
  id                    text primary key,
  room_id               text not null references rooms(id) on delete restrict,
  guest_id              text references guests(id) on delete restrict,
  group_id              text references res_groups(id) on delete cascade,
  checkin               timestamptz not null,
  checkout              timestamptz not null,
  status                text not null default 'confirmed'
                          check (status in ('pending','confirmed','checkedin',
                                            'checkedout','cancelled','noshow')),
  adults                int not null default 2,
  children              int not null default 0,
  price_override        numeric,
  -- pretul "inghetat" la creare/ultima editare a datei-camerei-ocuparii,
  -- calculat din tarifele curente in acel moment. Un tarif modificat
  -- ulterior nu il mai atinge — doar o editare a rezervarii insasi
  -- (data/camera/ocupare) il recalculeaza. NULL = rezervare cu pret
  -- manual (price_override) sau inca nemigrata.
  booked_price          numeric,
  source                text not null default 'direct',
  tags                  text[] not null default '{}',
  notes                 text,
  occupant_last_name    text,               -- ocupantul real al camerei
  occupant_first_name   text,               -- (diferit de titularul grupului)
  occupant_phone        text,
  external_uid          text,               -- UID din iCal-ul OTA
  external_source       text,               -- 'booking', 'airbnb', ...
  hold_expires_at       timestamptz,
  seeded                boolean not null default false,
  created_at            timestamptz not null default now(),
  check (checkout > checkin)
);

-- Re-importul aceleiași rezervări din OTA nu creează duplicat.
create unique index res_extern_unic
  on reservations (external_source, external_uid)
  where external_uid is not null;

-- PROTECȚIA CENTRALĂ ÎMPOTRIVA SUPRAREZERVĂRII.
-- Verificarea în cod nu e suficientă: două cereri simultane trec
-- amândouă de ea. Aici baza refuză fizic a doua rezervare, indiferent
-- dacă vine din PMS, de pe site sau din import iCal.
-- Intervalul '[)' face ca plecarea la 11:00 și sosirea la 15:00 în
-- aceeași zi să NU fie considerate conflict — schimbul de oaspeți
-- în aceeași zi rămâne posibil.
alter table reservations add constraint fara_suprapunere
  exclude using gist (
    room_id with =,
    tstzrange(checkin, checkout, '[)') with &&
  ) where (status not in ('cancelled','noshow'));

create index res_perioada on reservations using gist (tstzrange(checkin, checkout, '[)'));
create index res_camera   on reservations (room_id);


-- ---------------------------------------------------------------------
-- TARIFE ȘI SEZOANE
--
-- Tarifele se calculează pe server, nu în browser. Altfel oricine ar
-- putea modifica prețul din pagina de rezervare înainte de trimitere.
--
-- Datele sezoanelor sunt recurente anual, în format 'MM-DD' — nu sunt
-- legate de un an anume. Un sezon poate trece peste Anul Nou
-- (ex. 12-20 → 01-05), caz tratat explicit în nightly_rate().
-- ---------------------------------------------------------------------
-- single_price: tarif redus pentru ocupare single (1 adult, 0 copii); NULL
--   sau 0 inseamna ca nu e configurat, se cade pe tariful standard.
-- adult_supplement / child_supplement: suplimente per noapte — adultul
--   se aplica peste 2 adulti, copilul se aplica pentru fiecare copil.
--   Sunt globale (nu variaza pe tip de camera), dar se scriu identic pe
--   ambele randuri ca sa ramana totul intr-un singur tabel.
-- ATENTIE: aceste 3 coloane sunt folosite doar de calculul din aplicatie
--   (JS). Functiile de mai jos (nightly_rate/stay_total, pentru site-ul
--   public de rezervari) inca nu le citesc — de actualizat cand se
--   construieste acel flux, altfel preturile de acolo vor diferi.
create table rates (
  room_type         text primary key check (room_type in ('tiny','loft')),
  base_price        numeric not null,
  single_price      numeric,
  adult_supplement  numeric not null default 0,
  child_supplement  numeric not null default 0
);

create table seasons (
  id         text not null,
  name       text not null,
  start_md   text not null check (start_md ~ '^\d{2}-\d{2}$'),
  end_md     text not null check (end_md   ~ '^\d{2}-\d{2}$'),
  room_type  text not null check (room_type in ('tiny','loft')),
  price      numeric not null,
  priority   int not null default 0,      -- la suprapunere, câștigă prioritatea mai mare
  primary key (id, room_type)
);


-- ---------------------------------------------------------------------
-- PERSONAL
-- Leagă conturile din Supabase Auth de rolurile aplicației.
-- Înlocuiește vechiul sistem cu PIN-uri stocate în clar.
-- ---------------------------------------------------------------------
create table staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  name     text not null,
  role     text not null check (role in ('admin','receptionist','housekeeping'))
);


-- ---------------------------------------------------------------------
-- SETĂRI DIVERSE (rămășiță din structura veche)
-- Ține ce nu a fost migrat în tabele proprii: jurnal, housekeeping,
-- preferințe. Poate fi desființat pe măsură ce restul se mută.
-- ---------------------------------------------------------------------
create table if not exists app_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);


-- =====================================================================
-- FUNCȚII
-- =====================================================================

-- Tariful unei nopți pentru un tip de cameră, la o dată dată.
-- Sezonul cu prioritatea cea mai mare câștigă; dacă nu se potrivește
-- niciunul, se aplică tariful de bază.
-- Ramura 'else' tratează sezoanele care trec peste Anul Nou.
create or replace function nightly_rate(p_room_type text, p_date date)
returns numeric language sql stable as $$
  select coalesce(
    (select s.price from seasons s
      where s.room_type = p_room_type
        and case when s.start_md <= s.end_md
                 then to_char(p_date,'MM-DD') between s.start_md and s.end_md
                 else to_char(p_date,'MM-DD') >= s.start_md
                   or to_char(p_date,'MM-DD') <= s.end_md
            end
      order by s.priority desc limit 1),
    (select r.base_price from rates r where r.room_type = p_room_type),
    0
  );
$$;


-- Totalul unui sejur: suma tarifelor pe nopți.
-- Ziua plecării NU e noapte vândută, de aici '- 1' din generate_series.
create or replace function stay_total(p_room_id text, p_checkin timestamptz, p_checkout timestamptz)
returns numeric language sql stable as $$
  select coalesce(sum(nightly_rate(r.type, d::date)), 0)
  from rooms r,
       generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day') d
  where r.id = p_room_id;
$$;


-- Camerele libere într-un interval, cu prețul total.
-- Singura funcție de citire pe care o folosește site-ul public.
-- Rezervările 'pending' blochează camera doar cât timp rezervarea
-- temporară e validă (relevant doar dacă se adaugă plata online).
create or replace function available_rooms(p_checkin timestamptz, p_checkout timestamptz, p_guests int default 1)
returns table (room_id text, room_name text, room_type text, capacity int, total numeric)
language sql stable as $$
  select r.id, r.name, r.type, r.capacity, stay_total(r.id, p_checkin, p_checkout)
  from rooms r
  where r.active
    and r.capacity >= p_guests
    and not exists (
      select 1 from reservations res
      where res.room_id = r.id
        and res.status not in ('cancelled','noshow')
        and (res.status <> 'pending' or res.hold_expires_at > now())
        and tstzrange(res.checkin, res.checkout, '[)')
            && tstzrange(p_checkin, p_checkout, '[)')
    )
  order by r.sort_order, r.name;
$$;


-- Creează o rezervare de pe site-ul public.
--
-- security definer: rulează cu drepturi depline, deși vizitatorul nu
-- are acces la tabele. Așa poate scrie o rezervare fără să poată citi
-- clienții sau alte rezervări.
--
-- Clientul e recunoscut după telefon — dacă a mai stat, se leagă de
-- fișa existentă în loc să creeze duplicat.
--
-- Rezervarea intră direct 'confirmed', fără plată. Recepția
-- reconfirmă telefonic.
create or replace function create_booking(
  p_room_id     text,
  p_checkin     timestamptz,
  p_checkout    timestamptz,
  p_last_name   text,
  p_first_name  text,
  p_phone       text,
  p_email       text,
  p_city        text,
  p_county      text,
  p_country     text,
  p_adults      int default 2,
  p_children    int default 0,
  p_notes       text default null
) returns table (reservation_id text, total numeric)
language plpgsql security definer as $$
declare
  v_guest_id text;
  v_res_id   text;
begin
  if p_checkout <= p_checkin then
    raise exception 'Data de plecare trebuie să fie după data sosirii.';
  end if;
  if p_checkin < now() - interval '1 day' then
    raise exception 'Nu se pot face rezervări în trecut.';
  end if;
  if coalesce(trim(p_last_name),'') = '' or coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nume, prenume și telefon sunt obligatorii.';
  end if;

  select id into v_guest_id from guests
   where lower(phone) = lower(trim(p_phone)) limit 1;

  if v_guest_id is null then
    v_guest_id := 'g-' || encode(gen_random_bytes(6),'hex');
    insert into guests (id, last_name, first_name, phone, email, city, county, country)
    values (v_guest_id, trim(p_last_name), trim(p_first_name), trim(p_phone),
            nullif(trim(p_email),''), trim(p_city), trim(p_county), trim(p_country));
  end if;

  v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');

  insert into reservations (id, room_id, guest_id, checkin, checkout, status,
                            adults, children, source, notes)
  values (v_res_id, p_room_id, v_guest_id, p_checkin, p_checkout, 'confirmed',
          greatest(p_adults,1), greatest(p_children,0), 'site', nullif(trim(p_notes),''));

  return query select v_res_id, stay_total(p_room_id, p_checkin, p_checkout);
exception
  -- Doi vizitatori care rezervă simultan aceeași cameră: baza refuză,
  -- al doilea primește un mesaj clar, nu o eroare tehnică.
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă cameră sau altă perioadă.';
end;
$$;


-- =====================================================================
-- SECURITATE (Row Level Security)
--
-- Fără politici, tabelele sunt inaccesibile din exterior. Cheia
-- publică din browser nu mai dă acces la nimic.
--
-- Personalul autentificat are acces complet. Vizitatorii anonimi pot
-- executa doar cele două funcții publice de mai jos.
-- =====================================================================

alter table rooms        enable row level security;
alter table guests       enable row level security;
alter table res_groups   enable row level security;
alter table reservations enable row level security;
alter table rates        enable row level security;
alter table seasons      enable row level security;
alter table staff        enable row level security;
alter table app_state    enable row level security;

create policy "staff citeste" on rooms        for select to authenticated using (true);
create policy "staff scrie"   on rooms        for all    to authenticated using (true) with check (true);
create policy "staff citeste" on guests       for select to authenticated using (true);
create policy "staff scrie"   on guests       for all    to authenticated using (true) with check (true);
create policy "staff citeste" on res_groups   for select to authenticated using (true);
create policy "staff scrie"   on res_groups   for all    to authenticated using (true) with check (true);
create policy "staff citeste" on reservations for select to authenticated using (true);
create policy "staff scrie"   on reservations for all    to authenticated using (true) with check (true);
create policy "staff citeste" on rates        for select to authenticated using (true);
create policy "staff scrie"   on rates        for all    to authenticated using (true) with check (true);
create policy "staff citeste" on seasons      for select to authenticated using (true);
create policy "staff scrie"   on seasons      for all    to authenticated using (true) with check (true);
create policy "staff app_state" on app_state  for all    to authenticated using (true) with check (true);

-- Fiecare angajat își vede doar propriul rând (rolul).
create policy "vede propriul rand" on staff
  for select to authenticated using (user_id = auth.uid());

-- Functie ajutatoare: verifica daca userul curent e admin, ocolind RLS
-- pentru propriul query intern (evita recursivitatea infinita).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from staff where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Adminii vad si administreaza toate randurile din staff (ecranul
-- "Useri si drepturi" din aplicatie), nu doar propriul rand.
create policy "admin vede tot staff" on staff
  for select to authenticated using (is_admin());
create policy "admin scrie staff" on staff
  for insert to authenticated with check (is_admin());
create policy "admin modifica staff" on staff
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin sterge staff" on staff
  for delete to authenticated using (is_admin());

-- Vizitatorul anonim: doar căutare disponibilitate și creare rezervare.
grant execute on function available_rooms(timestamptz, timestamptz, int) to anon;
grant execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) to anon;

-- Calculul de preț NU e expus public — se apelează doar din interiorul
-- funcțiilor de mai sus.
revoke execute on function stay_total(text, timestamptz, timestamptz) from anon;
revoke execute on function nightly_rate(text, date) from anon;


-- =====================================================================
-- ATENȚIE — de făcut după crearea primului cont:
--
-- 1. Creează un utilizator în Supabase: Authentication → Users →
--    Add user (bifează "Auto Confirm User").
-- 2. Ia UUID-ul din coloana ID.
-- 3a. Pentru primul cont (înainte să existe vreun admin), rulează manual:
--
--    insert into staff (user_id, name, role)
--    values ('UUID-UL-DE-ACOLO', 'Nume Prenume', 'admin');
--
-- 3b. Pentru orice cont ulterior, un admin poate lega UUID-ul de un
--     nume și rol direct din aplicație — Setări → Useri și drepturi →
--     User nou. Nu mai e nevoie de SQL manual.
--
-- Fără un rând în staff, contul se autentifică dar nu primește acces —
-- aplicația îl respinge cu "Contul nu are drepturi in aplicatie".
-- =====================================================================


-- =====================================================================
-- MIGRARE DIN app_state (formatul JSON vechi)
--
-- Se rulează O SINGURĂ DATĂ, doar dacă mai există date vechi.
-- Ordinea contează: camere → clienți → grupuri → rezervări.
-- Decomentează blocul înainte de rulare.
-- =====================================================================
/*

-- Camere
insert into rooms (id, name, type, capacity, shelly_id, sensibo_id, sort_order)
select r->>'id', r->>'name', r->>'type',
       coalesce((r->>'capacity')::int, 2),
       nullif(r->>'shellyId',''), nullif(r->>'sensiboId',''), ord
from app_state a,
     jsonb_array_elements(a.value->'rooms') with ordinality t(r, ord)
where a.key like 'pms:core%'
on conflict (id) do nothing;

-- Clienți. Valorile '-' acoperă fișele create înainte ca aceste
-- câmpuri să devină obligatorii; fără ele migrarea ar eșua.
insert into guests (id, last_name, first_name, phone, email, address,
                    city, county, country, notes, seeded)
select g->>'id',
       coalesce(nullif(g->>'lastName',''),  '-'),
       coalesce(nullif(g->>'firstName',''), '-'),
       coalesce(nullif(g->>'phone',''),     '-'),
       nullif(g->>'email',''), nullif(g->>'address',''),
       coalesce(nullif(g->>'city',''),   '-'),
       coalesce(nullif(g->>'county',''), '-'),
       coalesce(nullif(g->>'country',''), 'România'),
       nullif(g->>'notes',''),
       coalesce((g->>'seeded')::boolean, false)
from app_state a, jsonb_array_elements(a.value->'guests') g
where a.key like 'pms:core%'
on conflict (id) do nothing;

-- Grupuri
insert into res_groups (id, name, main_guest_id, notes, seeded)
select g->>'id',
       coalesce(nullif(g->>'name',''), 'Grup'),
       (select id from guests where id = g->>'mainGuestId'),
       nullif(g->>'notes',''),
       coalesce((g->>'seeded')::boolean, false)
from app_state a, jsonb_array_elements(a.value) g
where a.key like 'pms:groups%'
on conflict (id) do nothing;

-- Rezervări
insert into reservations (
  id, room_id, guest_id, group_id, checkin, checkout, status,
  adults, children, price_override, source, tags, notes,
  occupant_last_name, occupant_first_name, occupant_phone, seeded)
select r->>'id', r->>'roomId',
       (select id from guests     where id = r->>'guestId'),
       (select id from res_groups where id = r->>'groupId'),
       (r->>'checkin')::timestamptz,
       (r->>'checkout')::timestamptz,
       coalesce(nullif(r->>'status',''), 'confirmed'),
       coalesce((r->>'adults')::int, 2),
       coalesce((r->>'children')::int, 0),
       (r->>'priceOverride')::numeric,
       coalesce(nullif(r->>'source',''), 'direct'),
       coalesce(array(select jsonb_array_elements_text(r->'tags')), '{}'),
       nullif(r->>'notes',''),
       nullif(r->>'occupantLastName',''),
       nullif(r->>'occupantFirstName',''),
       nullif(r->>'occupantPhone',''),
       coalesce((r->>'seeded')::boolean, false)
from app_state a, jsonb_array_elements(a.value) r
where a.key like 'pms:reservations%'
on conflict (id) do nothing;

-- Tarife de bază
insert into rates (room_type, base_price)
select t, (a.value->'rates'->'base'->>t)::numeric
from app_state a, unnest(array['tiny','loft']) t
where a.key like 'pms:core%'
on conflict (room_type) do update set base_price = excluded.base_price;

-- Sezoane. lpad() completează luna/ziua la două cifre: în JSON-ul
-- vechi datele erau scrise '9-15', iar formatul cerut e '09-15'.
-- Se creează câte un rând pentru fiecare tip de cameră.
insert into seasons (id, name, start_md, end_md, room_type, price)
select s->>'id', s->>'name',
       lpad(split_part(s->>'start','-',1),2,'0') || '-' || lpad(split_part(s->>'start','-',2),2,'0'),
       lpad(split_part(s->>'end','-',1),2,'0')   || '-' || lpad(split_part(s->>'end','-',2),2,'0'),
       t, (s->>t)::numeric
from app_state a,
     jsonb_array_elements(a.value->'rates'->'seasons') s,
     unnest(array['tiny','loft']) t
where a.key like 'pms:core%';

-- Verificare finală: 350, 450, 500, 500
-- select nightly_rate('tiny','2026-03-10'), nightly_rate('tiny','2026-07-01'),
--        nightly_rate('tiny','2026-12-28'), nightly_rate('tiny','2027-01-03');

*/
