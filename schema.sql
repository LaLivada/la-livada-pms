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
  -- Nu exista aici id-uri de dispozitiv. Releele stau in `devices`, legate
  -- de camere prin `device_rooms`: un canal Shelly poate servi doua camere
  -- (boiler, iluminat exterior), deci relatia nu incape intr-o coloana.
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
  salutation  text check (salutation in ('Dl','Dna')),  -- pentru mesajul WhatsApp predefinit
  seeded      boolean not null default false,   -- date de test, ștergibile separat
  created_at  timestamptz not null default now()
);

-- Plafoane de lungime — vezi explicația de la reservations mai jos.
alter table guests add constraint guests_lungimi_text check (
  length(coalesce(last_name, ''))  <= 100 and
  length(coalesce(first_name, '')) <= 100 and
  length(coalesce(address, ''))    <= 300 and
  length(coalesce(city, ''))       <= 100 and
  length(coalesce(county, ''))     <= 100 and
  length(coalesce(country, ''))    <= 100 and
  length(coalesce(email, ''))      <= 200 and
  length(coalesce(phone, ''))      <= 40  and
  length(coalesce(notes, ''))      <= 2000
);

-- Validare de format pentru telefon si email — plasa de siguranta pentru
-- orice cale de scriere in afara UI-ului (inclusiv create_booking,
-- apelabila public). Nu duplica regula fina din front-end (PhoneDialPicker,
-- "0 redundant dupa prefixul de tara") — aia are nevoie de lista de
-- prefixuri, care exista doar in JS. Aici se verifica doar forma generala.
-- NOT VALID: cel putin o inregistrare existenta (email fara domeniu real)
-- ar fi picat o validare retroactiva — regula se aplica de acum inainte.
alter table guests add constraint guests_format_contact check (
  (phone = '' or (phone ~ '^[+]?[0-9 ()-]+$'
                   and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15))
  and
  (email is null or email = '' or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
) not valid;


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

alter table res_groups add constraint res_groups_lungimi_text check (
  length(coalesce(name, ''))  <= 200 and
  length(coalesce(notes, '')) <= 2000
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
                          check (status in ('pending','confirmed','protocol','checkedin',
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
  -- Codul din linkul de guest app: lalivada.ro/guest/Ajh6k. Cinci caractere
  -- din 62, puse de triggerul de mai jos. Vezi sectiunea GUEST APP de la
  -- finalul fisierului si docs/guest-app.md 4.1 — cu un cod atat de scurt,
  -- plafonul de cautari esuate nu e o imbunatatire, e lacatul.
  guest_code            text,
  seeded                boolean not null default false,
  created_at            timestamptz not null default now(),
  -- Vezi triggerul de mai jos: e mecanismul care împiedică doi
  -- utilizatori să-și suprascrie tăcut modificările.
  updated_at            timestamptz not null default now(),
  check (checkout > checkin)
);

-- CONCURENȚĂ OPTIMISTĂ.
-- Aplicația trimite rândul întreg din starea ei locală, deci doi
-- utilizatori care editează aceeași rezervare în paralel și-ar suprascrie
-- reciproc modificările, fără nicio eroare — al doilea salvat readuce
-- pur și simplu valorile pe care le avea el la încărcare.
--
-- Clientul trimite înapoi `updated_at` exact așa cum l-a citit. Dacă
-- rândul s-a schimbat între timp, valoarea lui e mai veche decât cea din
-- baza de date și scrierea e refuzată; aplicația prinde eroarea,
-- reîncarcă datele reale și cere reluarea modificării.
create or replace function stamp_reservation_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Valoarea trimisă de client la inserare e ignorată: rândul e nou.
    new.updated_at := now();
    return new;
  end if;

  -- Un client care NU trimite updated_at (null) nu e blocat — verificarea
  -- se aplică doar celor care participă la protocol. Așa rămân posibile
  -- scripturile de întreținere/backfill, fără să slăbească protecția
  -- pentru aplicație, care trimite mereu valoarea citită.
  if new.updated_at is not null and old.updated_at is not null
     and new.updated_at < old.updated_at then
    raise exception 'Rezervarea a fost modificata de altcineva intre timp. Datele se reincarca — reia modificarea.'
      using errcode = '40001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
create trigger reservations_stamp_updated_at
  before insert or update on reservations
  for each row execute function stamp_reservation_updated_at();

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
-- PLAFOANE DE LUNGIME PE TEXTELE LIBERE.
--
-- Generarea PDF-ului (fișa de sosire, factura) rasterizează DOM-ul
-- sincron, pe firul principal: un text foarte lung — lipit din greșeală
-- sau introdus intenționat — umflă pagina și poate bloca tabul cât ține
-- randarea.
--
-- Plafonul stă în bază, nu doar în formular, ca să acopere și importul
-- iCal, și rezervările venite de pe site, și orice request direct către
-- API — nu doar căile pe care le știe interfața. Valorile sunt largi
-- față de uzul real (maximul din datele existente la introducere era 30
-- de caractere).
--
-- Constrângerile pentru celelalte tabele sunt lângă definițiile lor.
alter table reservations add constraint reservations_lungimi_text check (
  length(coalesce(notes, ''))               <= 2000 and
  length(coalesce(occupant_last_name, ''))  <= 100  and
  length(coalesce(occupant_first_name, '')) <= 100  and
  length(coalesce(occupant_phone, ''))      <= 40
);

alter table reservations add constraint fara_suprapunere
  exclude using gist (
    room_id with =,
    tstzrange(checkin, checkout, '[)') with &&
  ) where (status not in ('cancelled','noshow'));

create index res_perioada on reservations using gist (tstzrange(checkin, checkout, '[)'));

-- PREȚUL STOCAT E CALCULAT DE SERVER, NU DE CLIENT.
--
-- JS-ul își păstrează calculul sincron pentru previzualizare (e apelat în
-- bucle de randare — calendar, rapoarte, liste — deci nu poate deveni un
-- apel de rețea), dar ce ajunge în bază trece pe aici. Un preț trimis din
-- browser nu are nicio putere: se recalculează peste el.
--
-- Regula de recalculare o oglindește pe cea din ReservationModal: prețul
-- înghețat rămâne neatins până se schimbă ceva ce chiar îl afectează —
-- camera, datele, ocuparea. O editare de notă, sau un tarif modificat
-- ulterior, nu îl ating; altfel o schimbare de tarife ar rescrie
-- retroactiv sume deja acceptate de clienți.
create or replace function pret_server_rezervare()
returns trigger language plpgsql set search_path = public as $$
declare v_recalc boolean;
begin
  -- Blocajele de mentenanță nu au preț.
  if new.source = 'blocaj' then
    return new;
  end if;

  -- Prețul manual are mereu prioritate; cel calculat se golește, ca să nu
  -- existe două surse pentru aceeași sumă.
  if new.price_override is not null then
    new.booked_price := null;
    return new;
  end if;

  v_recalc := (tg_op = 'INSERT')
    or new.room_id  is distinct from old.room_id
    or new.checkin  is distinct from old.checkin
    or new.checkout is distinct from old.checkout
    or new.adults   is distinct from old.adults
    or new.children is distinct from old.children
    or old.booked_price is null;   -- rezervare veche, fără preț înghețat

  if v_recalc then
    new.booked_price := stay_total(
      new.room_id, new.checkin, new.checkout,
      greatest(coalesce(new.adults, 2), 1),
      greatest(coalesce(new.children, 0), 0),
      new.source = 'site',         -- ajustarea pe ocupare doar pentru site
      -- Rezervarea nu se numără pe sine în ocupare. La INSERT nu conta
      -- (trigger BEFORE, rândul încă nu e în tabel), dar la editare da:
      -- o cameră în plus înseamnă 6,25 puncte la 16 camere, destul cât
      -- să sară un prag. JS o exclude la fel, prin res.id.
      new.id);
  end if;

  return new;
end; $$;
create trigger reservations_pret_server
  before insert or update on reservations
  for each row execute function pret_server_rezervare();
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
-- OPTIMIZATOR DE PREȚ PE GRAD DE OCUPARE (doar rezervări "site")
--
-- Se aplică STRICT rezervărilor cu source = 'site' (site propriu de
-- rezervări, facute de oaspete) — NU și celor introduse manual de
-- recepție (direct/phone/walkin/other), chiar dacă sunt tot "directe".
-- Booking.com/Airbnb nu pot primi prețuri prin feedul iCal — acesta duce
-- doar disponibilitate, nu tarife — așa că rămân la tariful standard
-- pana la o eventuala integrare de channel-manager separată.
--
-- Ocuparea se calculează ca medie pe toată perioada sejurului, la nivel
-- de proprietate (toate camerele), nu per tip de cameră.
-- ---------------------------------------------------------------------
create table online_pricing_tiers (
  id               text primary key,
  min_occ          int not null check (min_occ >= 0 and min_occ <= 100),
  max_occ          int not null check (max_occ >= 0 and max_occ <= 100),
  adjustment_pct   numeric not null default 0,   -- ex. -5, 0, 10 → procent aplicat peste pretul standard
  sort_order       int not null default 0,
  check (min_occ < max_occ)
);


-- ---------------------------------------------------------------------
-- PERSONAL
-- Leagă conturile din Supabase Auth de rolurile aplicației.
-- Înlocuiește vechiul sistem cu PIN-uri stocate în clar.
-- ---------------------------------------------------------------------
create table staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  name     text not null,
  role     text not null check (role in ('admin','receptionist','housekeeping')),
  -- Tine minte daca setul implicit de permisiuni de facturare a fost deja
  -- acordat o data acestui user (vezi acorda_permisiuni_facturare_implicite
  -- mai jos). Fara ea, un rol care oscileaza receptionist -> altceva ->
  -- receptionist re-declanseaza acordarea si anuleaza tacit o permisiune
  -- pe care un admin o retrasese manual intre timp (ON CONFLICT DO NOTHING
  -- nu ajuta aici: randul revocat chiar lipseste, deci INSERT-ul reuseste).
  permisiuni_implicite_acordate boolean not null default false
);

-- Cele două funcții de rol stau AICI, lângă tabelul pe care îl citesc și
-- înaintea a tot ce le folosește. Ordinea nu e cosmetică: și
-- `create policy ... using (is_admin())`, și corpul unei funcții
-- `language sql` care o cheamă, sunt analizate la creare și eșuează dacă
-- funcția nu există încă (verificat). Fișierul ăsta trebuie să poată fi
-- rulat de sus în jos pe un proiect gol — e singurul drum de refacere.
--
-- `security definer` la amândouă, ca să nu recurseze prin RLS-ul propriu al
-- tabelului `staff`: politica de pe `staff` cheamă `is_admin()`, care ar
-- citi `staff`, care ar chema iar politica.
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

-- Rolul userului curent, pentru politicile de scriere și pentru vederea de
-- ocupare.
create or replace function staff_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from staff where user_id = auth.uid();
$$;


-- ---------------------------------------------------------------------
-- SETĂRI DIVERSE (rămășiță din structura veche)
-- Ține ce nu a fost migrat în tabele proprii: housekeeping, setările
-- accesului, preferințe. Poate fi desființat pe măsură ce restul se mută.
--
-- Jurnalul de activitate a plecat de aici pe 9 septembrie 2026, în
-- `activity_log` — vezi comentariul de acolo. Cheia veche `pms:log:v3`
-- rămâne ca rând, dar GOLITĂ (`[]`): filele deschise cu bundle-ul vechi tot
-- au unde scrie, fără eroare, dar rândul nu mai ține numele oaspeților în
-- `detail` — și acolo politica de citire îl lasă încă la îndemâna unui cont
-- de curățenie. Cele 400 de intrări au fost verificate una câte una în
-- `activity_log` (oră, acțiune, detaliu identice) înainte de golire.
-- ---------------------------------------------------------------------
create table if not exists app_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);


-- =====================================================================
-- FACTURARE
--
-- Strat nou peste rezervări, fără să le modifice structura de bază.
-- Nu se transmite nimic automat în e-Factura — doar se genereaza si
-- stocheaza factura in PMS, cu export XML periodic pentru contabilitate
-- (vezi sectiunea "EXPORT CONTABILITATE" mai jos).
--
-- Flux: Rezervare -> Folio (1:1, auto-creat) -> FolioItem (cazare +
-- extra) -> Invoice (0..N per folio, selecteaza pozitii din folio) ->
-- InvoiceItem -> Payment. O pozitie de folio poate fi facturata o
-- singura data cat timp factura care o contine e activa (vezi
-- invoice_item_links).
-- =====================================================================

-- ---------------------------------------------------------------------
-- CLIENT DE FACTURARE
-- Separat de `guests` — oaspetele care sta in camera si entitatea catre
-- care se emite factura pot fi persoane/entitati diferite (ex. compania
-- plateste pentru un angajat). `guest_id` leaga optional inapoi la
-- oaspete (pentru pre-completare), fara sa duplice datele — o firma
-- poate factura pentru mai multi oaspeti/rezervari.
-- ---------------------------------------------------------------------
create table billing_customers (
  id            text primary key,
  kind          text not null check (kind in ('person','company')),
  -- persoana fizica
  last_name     text,
  first_name    text,
  cnp           text,                          -- optional
  -- firma
  company_name  text,
  cui           text,                          -- validat la nivel de format in UI
  reg_com       text,
  contact_name  text,                          -- persoana de contact la firma
  -- comune ambelor tipuri
  address       text not null,
  city          text not null,
  county        text not null,
  postal_code   text,
  country       text not null default 'România',
  email         text,
  phone         text,
  guest_id      text references guests(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (
    (kind = 'person'  and last_name is not null and first_name is not null) or
    (kind = 'company' and company_name is not null and cui is not null)
  )
);
create index billing_customers_guest on billing_customers(guest_id);
alter table billing_customers add constraint billing_customers_lungimi_text check (
  length(coalesce(company_name, '')) <= 200 and
  length(coalesce(last_name, ''))    <= 100 and
  length(coalesce(first_name, ''))   <= 100 and
  length(coalesce(contact_name, '')) <= 200 and
  length(coalesce(address, ''))      <= 300 and
  length(coalesce(city, ''))         <= 100 and
  length(coalesce(county, ''))       <= 100 and
  length(coalesce(country, ''))      <= 100 and
  length(coalesce(email, ''))        <= 200 and
  length(coalesce(phone, ''))        <= 40  and
  length(coalesce(reg_com, ''))      <= 50
);
-- Acelasi rationament ca la guests_format_contact mai sus.
alter table billing_customers add constraint billing_customers_format_contact check (
  (phone is null or phone = '' or (phone ~ '^[+]?[0-9 ()-]+$'
                   and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15))
  and
  (email is null or email = '' or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
) not valid;
-- Previne duplicarea clientilor de facturare cu acelasi CUI/CNP, chiar
-- daca UI-ul e ocolit (ex. request direct). Normalizeaza CUI-ul (fara
-- prefix RO, uppercase) la fel ca validateCUIFormat din front-end.
create unique index billing_customers_cui_unique
  on billing_customers (upper(regexp_replace(cui, '^(RO|ro)', '')))
  where cui is not null and cui <> '';
create unique index billing_customers_cnp_unique
  on billing_customers (cnp)
  where cnp is not null and cnp <> '';

-- Rezervarea poate specifica explicit catre cine se factureaza; daca
-- ramane null, facturarea foloseste implicit oaspetele rezervarii.
alter table reservations add column billing_customer_id text
  references billing_customers(id) on delete set null;


-- ---------------------------------------------------------------------
-- COTE DE TVA — configurabile, nu hardcodate in cod.
-- Cotele curente in România: 21% standard, 11% redusă (cazare/alimentație).
-- ---------------------------------------------------------------------
create table vat_rates (
  id      text primary key,
  label   text not null,
  rate    numeric not null check (rate >= 0),
  active  boolean not null default true
);
insert into vat_rates (id, label, rate) values
  ('vat-21', 'Standard 21%', 21),
  ('vat-11', 'Redusă 11%', 11),
  ('vat-0',  'Scutit 0%', 0);


-- ---------------------------------------------------------------------
-- NOMENCLATOR PRODUSE/SERVICII
-- category e text liber (nu enum) — se gestioneaza din UI, nu din cod.
-- billing_mode marcheaza doar CE POATE fi agregat in cazare la
-- facturare; decizia finala (separat/agregat) se ia per-pozitie, la
-- generarea facturii (vezi invoice_item_links).
-- ---------------------------------------------------------------------
create table products (
  id               text primary key,
  name             text not null,
  internal_code    text unique,
  accounting_code  text,
  category         text not null,
  unit             text not null default 'buc',
  vat_rate_id      text not null references vat_rates(id),
  default_price    numeric not null default 0,
  active           boolean not null default true,
  billing_mode     text not null default 'separate' check (billing_mode in ('separate','aggregatable')),
  sort_order       int not null default 0,
  -- Pentru meniul de minibar din guest app (vezi sectiunea GUEST APP).
  -- `public_visible` exista fiindca nu tot ce e aici are ce cauta sub ochii
  -- oaspetelui: grila contine si pozitii de uz intern. Implicit fals, deci
  -- un produs nou nu apare pe ecranul nimanui pana nu se cere anume.
  public_description text,
  public_visible     boolean not null default false
);
insert into products (id, name, internal_code, category, unit, vat_rate_id, default_price, billing_mode, sort_order) values
  ('prod-cazare', 'Cazare', 'CAZARE', 'cazare', 'noapte', 'vat-11', 0, 'separate', 0);


-- ---------------------------------------------------------------------
-- METODE DE PLATĂ — configurabile, nu hardcodate in cod. `payments.method`
-- ramane text liber (fara FK) ca sa nu blocheze un istoric daca o metoda
-- e stearsa ulterior; e doar id-ul uneia din aceste optiuni la momentul
-- inregistrarii.
-- ---------------------------------------------------------------------
create table payment_methods (
  id          text primary key,
  label       text not null,
  active      boolean not null default true,
  sort_order  int not null default 0
);
insert into payment_methods (id, label, sort_order) values
  ('cash', 'Numerar', 0),
  ('card', 'Card', 1),
  ('bank_transfer', 'Transfer bancar', 2),
  ('other', 'Altă metodă', 3);


-- ---------------------------------------------------------------------
-- FOLIO — cel mult unul per rezervare (unique pe reservation_id).
-- ---------------------------------------------------------------------
create table folios (
  id              text primary key,
  reservation_id  text not null unique references reservations(id) on delete cascade,
  status          text not null default 'open' check (status in ('open','closed')),
  created_at      timestamptz not null default now()
);

-- Pozitiile din folio — cazarea e sincronizata automat din rezervare
-- (vezi aplicatia, nu se editeaza manual din grila de produse); extra-
-- urile sunt adaugate liber din UI. unit_price e CU TVA inclus.
-- Niciodata nu se sterge fizic o pozitie odata legata de o factura —
-- vezi invoice_item_links.
create table folio_items (
  id              text primary key,
  folio_id        text not null references folios(id) on delete cascade,
  product_id      text references products(id) on delete restrict,
  name            text not null,
  category        text not null,
  quantity        numeric not null default 1 check (quantity > 0),
  unit_price      numeric not null check (unit_price >= 0),
  vat_rate        numeric not null check (vat_rate >= 0),
  net_amount      numeric not null,
  vat_amount      numeric not null,
  total_amount    numeric not null,
  occurred_at     timestamptz not null default now(),
  notes           text,
  created_by      uuid references staff(user_id),
  created_at      timestamptz not null default now(),
  invoiced_status text not null default 'uninvoiced' check (invoiced_status in ('uninvoiced','invoiced'))
);
create index folio_items_folio on folio_items(folio_id);
alter table folio_items add constraint folio_items_lungimi_text check (
  length(coalesce(name, ''))  <= 300 and
  length(coalesce(notes, '')) <= 2000
);


-- ---------------------------------------------------------------------
-- SERII DE NUMEROTARE — alocarea numarului e transactionala (vezi
-- functia next_invoice_number mai jos), niciodata calculata in JS cu
-- max(number)+1, ca sa nu existe race condition la doi useri simultan.
-- ---------------------------------------------------------------------
create table invoice_series (
  id           text primary key,
  series       text not null unique,
  next_number  int not null default 1,
  active       boolean not null default true
);
insert into invoice_series (id, series) values ('series-liv', 'LIV');


-- ---------------------------------------------------------------------
-- FACTURI
-- O factura emisa nu se mai sterge si nu se mai editeaza liber — orice
-- corectie trece prin stornare (factura noua, cu sume negative,
-- credit_note_of -> factura originala). Draft-urile (inca fara numar)
-- pot fi editate/sterse liber.
-- ---------------------------------------------------------------------
create table invoices (
  id                   text primary key,
  series               text,
  number               int,
  folio_id             text not null references folios(id) on delete restrict,
  billing_customer_id  text not null references billing_customers(id) on delete restrict,
  status               text not null default 'draft'
                         check (status in ('draft','issued','partially_paid','paid','cancelled','credited')),
  issue_date           timestamptz,
  service_date_start   timestamptz,
  service_date_end     timestamptz,
  subtotal_net         numeric not null default 0,
  subtotal_vat         numeric not null default 0,
  total_amount         numeric not null default 0,
  paid_amount          numeric not null default 0,
  notes                text,
  credit_note_of       text references invoices(id),
  created_by           uuid references staff(user_id),
  issued_by            uuid references staff(user_id),
  created_at           timestamptz not null default now(),
  unique (series, number)
);
create index invoices_folio on invoices(folio_id);
create index invoices_billing_customer on invoices(billing_customer_id);
create index invoices_status on invoices(status);
create index invoices_issue_date on invoices(issue_date);
alter table invoices add constraint invoices_lungimi_text check (
  length(coalesce(notes, '')) <= 2000
);

create table invoice_items (
  id             text primary key,
  invoice_id     text not null references invoices(id) on delete cascade,
  product_id     text references products(id),
  name           text not null,
  quantity       numeric not null,
  unit_price     numeric not null,
  vat_rate       numeric not null,
  net_amount     numeric not null,
  vat_amount     numeric not null,
  total_amount   numeric not null,
  sort_order     int not null default 0
);
create index invoice_items_invoice on invoice_items(invoice_id);

-- Leaga liniile de factura inapoi la pozitiile de folio din care provin
-- (un invoice_item poate proveni dintr-un singur folio_item — pozitie
-- separata — sau din mai multe — agregare, ex. mic dejun agregat in
-- cazare). Previne dubla facturare: orice folio_item deja legat de o
-- factura activa (status != 'cancelled') e exclus din ce mai poate fi
-- facturat.
create table invoice_item_links (
  invoice_item_id  text not null references invoice_items(id) on delete cascade,
  folio_item_id    text not null references folio_items(id) on delete restrict,
  primary key (invoice_item_id, folio_item_id)
);
create index invoice_item_links_folio_item on invoice_item_links(folio_item_id);

-- Pana acum prevenirea dublei facturari era doar la nivel de UI (clientul
-- incarca folio_items neinvoiced_status si le exclude pe cele deja
-- facturate) — o cursa (doi useri, doua tab-uri) putea produce doua
-- facturi active pe aceeasi pozitie de folio, fara ca baza de date sa
-- blocheze nimic. Trigger-ul de mai jos impune regula si la insert.
create or replace function guard_invoice_item_link()
returns trigger language plpgsql set search_path = public as $$
declare v_conflict_invoice text;
begin
  select ii.invoice_id into v_conflict_invoice
  from invoice_item_links l
  join invoice_items ii on ii.id = l.invoice_item_id
  join invoices inv on inv.id = ii.invoice_id
  where l.folio_item_id = new.folio_item_id
    and inv.status <> 'cancelled'
    and ii.invoice_id <> (select invoice_id from invoice_items where id = new.invoice_item_id)
  limit 1;
  if v_conflict_invoice is not null then
    raise exception 'Poziția de folio este deja facturată pe o altă factură activă (%).', v_conflict_invoice;
  end if;
  return new;
end;
$$;
create trigger invoice_item_links_guard
  before insert on invoice_item_links
  for each row execute function guard_invoice_item_link();


-- ---------------------------------------------------------------------
-- PLĂȚI
-- ---------------------------------------------------------------------
create table payments (
  id                 text primary key,
  invoice_id         text not null references invoices(id) on delete restrict,
  amount             numeric not null check (amount > 0),
  method             text not null,
  paid_at            timestamptz not null default now(),
  reference          text,
  notes              text,
  -- incasari numerar: numar de chitanta alocat automat (vezi
  -- next_receipt_number mai jos) — la fel ca la facturi, niciodata
  -- calculat in JS cu max(number)+1.
  receipt_series     text,
  receipt_number     int,
  -- incasari card: numarul bonului de POS si data lui, completate manual
  -- (pot diferi de data la care se inregistreaza plata in aplicatie).
  card_receipt_number text,
  card_receipt_date   date,
  created_by   uuid references staff(user_id),
  created_at   timestamptz not null default now()
);
create index payments_invoice on payments(invoice_id);

-- ---------------------------------------------------------------------
-- SERIE DE CHITANTE — numerar. Un singur rand, seria e personalizabila
-- din UI (Financiar -> Incasari); numerotarea e alocata transactional,
-- la fel ca la facturi.
-- ---------------------------------------------------------------------
create table receipt_series (
  id           text primary key,
  series       text not null unique,
  next_number  int not null default 1,
  active       boolean not null default true
);
insert into receipt_series (id, series) values ('series-ch', 'CH');

create or replace function next_receipt_number(p_series text)
returns table(series text, number int) language plpgsql security definer set search_path = public as $$
declare v_number int;
begin
  -- Fiind security definer, functia ruleaza cu privilegii ridicate si e
  -- apelabila de orice user autentificat prin RPC — fara acest control,
  -- oricine (chiar fara nicio permisiune de facturare) ar putea consuma
  -- numere din serie direct, ocolind canBilling() din UI, care e doar
  -- cosmetic (nu impune nimic la nivel de baza de date).
  if not has_billing_permission('record_payment') then
    raise exception 'Nu ai permisiunea de a înregistra încasări.';
  end if;
  update receipt_series set next_number = next_number + 1
    where receipt_series.series = p_series and active
    returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'Serie de chitanțe inexistentă sau inactivă: %', p_series;
  end if;
  return query select p_series, v_number;
end;
$$;

-- Recalculeaza paid_amount si statusul facturii la fiecare plata
-- inregistrata/stearsa, ca suma sa nu poata diverge de realitate.
create or replace function recalc_invoice_payment_status()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice_id text := coalesce(new.invoice_id, old.invoice_id);
  v_paid       numeric;
  v_total      numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = v_invoice_id;
  select total_amount into v_total from invoices where id = v_invoice_id;

  update invoices set
    paid_amount = v_paid,
    status = case
      when status in ('cancelled','credited') then status
      when v_paid <= 0 then 'issued'
      when v_paid < v_total then 'partially_paid'
      else 'paid'
    end
  where id = v_invoice_id;

  return null;
end;
$$;
create trigger payments_recalc_invoice
  after insert or update or delete on payments
  for each row execute function recalc_invoice_payment_status();

-- Politica "modifica factura" (mai jos) are doar USING, fara WITH CHECK —
-- orice utilizator cu vreo permisiune de facturare putea in trecut
-- rescrie orice coloana a oricarei facturi printr-un request direct,
-- ocolind complet regulile de business din UI (ex. schimba suma unei
-- facturi deja emise). RLS nu poate exprima usor "ce valori noi sunt
-- valide" cand regulile depind de starea veche a rândului (masina de
-- stari pe status) — un trigger, ca la invoice_item_links_guard, e mult
-- mai clar si poate da mesaje de eroare explicite.
create or replace function guard_invoice_update()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Draft: editare libera (linii, sume, client) — dar tranzitia de status
  -- e permisa doar spre 'issued', ca sa nu se ocoleasca alocarea
  -- serie+numar din next_invoice_number.
  if old.status = 'draft' then
    if new.status not in ('draft', 'issued') then
      raise exception 'Tranziție de status invalidă: draft -> %.', new.status;
    end if;
    return new;
  end if;

  -- Stari terminale — nicio actiune posibila dupa anulare/stornare.
  if old.status in ('cancelled', 'credited') and new.status is distinct from old.status then
    raise exception 'Factura % este % — nu mai poate schimba status.', old.id, old.status;
  end if;

  -- O factura emisa nu se mai "redefineste" — orice corectie trece prin
  -- stornare. Coloanele astea raman fixe indiferent cine scrie (UI sau
  -- un request direct catre API).
  if new.series is distinct from old.series
    or new.number is distinct from old.number
    or new.folio_id is distinct from old.folio_id
    or new.billing_customer_id is distinct from old.billing_customer_id
    or new.subtotal_net is distinct from old.subtotal_net
    or new.subtotal_vat is distinct from old.subtotal_vat
    or new.total_amount is distinct from old.total_amount
    or new.issue_date is distinct from old.issue_date
    or new.service_date_start is distinct from old.service_date_start
    or new.service_date_end is distinct from old.service_date_end
    or new.credit_note_of is distinct from old.credit_note_of
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.issued_by is distinct from old.issued_by
  then
    raise exception 'Factura % este emisă — datele ei nu mai pot fi modificate (doar stornare).', old.id;
  end if;

  if new.status is distinct from old.status then
    -- issued/partially_paid/paid circula liber intre ele in ambele
    -- directii — asa functioneaza recalcularea automata la inregistrarea
    -- SAU stergerea unei plati (vezi recalc_invoice_payment_status), care
    -- poate impinge statusul si inapoi (ex. paid -> partially_paid daca
    -- se sterge o plata gresit introdusa).
    if old.status in ('issued','partially_paid','paid') and new.status in ('issued','partially_paid','paid') then
      null;
    elsif new.status = 'cancelled' then
      if old.status <> 'issued' or old.paid_amount <> 0 then
        raise exception 'O factură se poate anula doar din stadiul "emisă" și fără plăți înregistrate.';
      end if;
    elsif new.status = 'credited' then
      null; -- stornare, permisa din orice stare activa (issued/partially_paid/paid)
    else
      raise exception 'Tranziție de status invalidă: % -> %.', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;
create trigger invoices_update_guard
  before update on invoices
  for each row execute function guard_invoice_update();

-- Aloca urmatorul numar dintr-o serie, transactional — apelata o
-- singura data, exact la tranzitia draft -> issued.
create or replace function next_invoice_number(p_series text)
returns table(series text, number int) language plpgsql security definer set search_path = public as $$
declare v_number int;
begin
  -- Vezi observatia identica de la next_receipt_number mai sus.
  if not has_billing_permission('issue_invoice') then
    raise exception 'Nu ai permisiunea de a emite facturi.';
  end if;
  update invoice_series set next_number = next_number + 1
    where invoice_series.series = p_series and active
    returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'Serie de facturare inexistentă sau inactivă: %', p_series;
  end if;
  return query select p_series, v_number;
end;
$$;


-- ---------------------------------------------------------------------
-- EXPORT CONTABILITATE
-- Fisierul XML nu se stocheaza in DB (se regenereaza on-demand din
-- datele facturilor la fiecare descarcare) — ce se pastreaza e lista de
-- facturi incluse si cand, ca sa nu existe desincronizare intre "ce s-a
-- exportat" si continutul fisierului. O factura NU e blocata de un
-- export anterior — poate fi reexportata oricand, dar fiecare export
-- (prim sau re-) e inregistrat cu utilizator+data.
-- ---------------------------------------------------------------------
create table accounting_exports (
  id             text primary key,
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  status_filter  text[],
  series_filter  text,
  format         text not null default 'generic_v1',
  file_name      text,
  created_by     uuid references staff(user_id),
  created_at     timestamptz not null default now()
);

create table accounting_export_items (
  export_id     text not null references accounting_exports(id) on delete cascade,
  invoice_id    text not null references invoices(id),
  is_reexport   boolean not null default false,
  primary key (export_id, invoice_id)
);
create index accounting_export_items_invoice on accounting_export_items(invoice_id);


-- ---------------------------------------------------------------------
-- INDECȘI PE CHEI STRĂINE
--
-- Postgres nu indexează automat partea care REFERĂ dintr-o cheie străină
-- (doar cea referită). Fără index, orice ștergere sau actualizare în
-- tabelul-părinte forțează o parcurgere completă a copilului ca să
-- verifice constrângerea, iar join-urile obișnuite (factură → cine a
-- emis-o, rezervare → oaspete) devin scanări întregi.
--
-- La volumul de acum nu se simte; contează după câteva luni de istoric.
-- ---------------------------------------------------------------------
-- `billing_permissions_granted_by` lipsește din listă: tabelul lui se crează
-- abia mai jos, deci indexul stă acolo, imediat după el.
create index accounting_exports_created_by   on accounting_exports (created_by);
create index folio_items_created_by          on folio_items (created_by);
create index folio_items_product             on folio_items (product_id);
create index invoice_items_product           on invoice_items (product_id);
create index invoices_created_by             on invoices (created_by);
create index invoices_credit_note_of         on invoices (credit_note_of);
create index invoices_issued_by              on invoices (issued_by);
create index payments_created_by             on payments (created_by);
create index products_vat_rate               on products (vat_rate_id);
create index res_groups_main_guest           on res_groups (main_guest_id);
create index reservations_billing_customer   on reservations (billing_customer_id);
create index reservations_group              on reservations (group_id);
create index reservations_guest              on reservations (guest_id);


-- ---------------------------------------------------------------------
-- PERMISIUNI GRANULARE PENTRU FACTURARE
-- Matrice utilizator x permisiune, separata de cele 3 roluri fixe
-- (admin/receptionist/housekeeping) — nu inlocuieste rolurile, doar
-- adauga control fin pe actiunile sensibile de facturare. Adminii au
-- automat toate drepturile (vezi has_billing_permission mai jos), fara
-- randuri explicite aici.
-- ---------------------------------------------------------------------
create table billing_permissions (
  user_id      uuid not null references staff(user_id) on delete cascade,
  permission   text not null check (permission in (
                 'view_invoices','create_invoice','issue_invoice','cancel_invoice',
                 'create_credit_note','record_payment','export_accounting','reexport_accounting'
               )),
  granted_by   uuid references staff(user_id),
  granted_at   timestamptz not null default now(),
  primary key (user_id, permission)
);

-- Perechea indexului de cheie străină de mai sus (vezi comentariul de acolo).
create index billing_permissions_granted_by on billing_permissions (granted_by);

-- ROLUL ȘI RÂNDUL, amândouă. Până pe 9 septembrie 2026 se verifica doar
-- rândul din `billing_permissions`, fără nicio legătură cu rolul. Rândurile
-- nu se șterg la retrogradare (nici n-ar trebui — flagul
-- `permisiuni_implicite_acordate` de mai sus există tocmai ca o repromovare
-- să nu reacorde tacit o permisiune retrasă manual). Deci un recepționer
-- trecut pe „curățenie" continua să vadă facturile.
--
-- Măsurat înainte de fix, cu rolul comutat: 1 factură, 55 de folio-uri și 91
-- de clienți de facturare (nume, CUI, adresă). După: 0 / 0 / 0, iar la
-- repromovare totul revine exact cum era.
create or replace function has_billing_permission(perm text)
returns boolean language sql security definer set search_path = public stable as $$
  select is_admin() or (
    staff_role() = 'receptionist'
    and exists (
      select 1 from billing_permissions
      where user_id = auth.uid() and permission = perm
    )
  );
$$;

-- Recepția are dreptul să factureze, ca politică standard — cerut explicit
-- pe 21 august 2026, nu doar pentru cei deja existenți. Setul include și
-- create_credit_note (stornarea), adăugat explicit la cerere după ce
-- setul inițial o excludea deliberat — a rămas doar exportul de
-- contabilitate ca decizie separată, acordată manual din Useri →
-- Permisiuni dacă e nevoie.
--
-- Rândurile se scriu în tabelul obișnuit, nu hardcodate în
-- has_billing_permission(): un admin tot poate retrage o permisiune unui
-- recepționer anume din ecranul de Permisiuni, fără o excepție de cod.
--
-- ON CONFLICT DO NOTHING: nu suprascrie o permisiune deja acordată sau
-- retrasă manual — doar completează ce lipsește.
--
-- Acordarea se face O SINGURĂ DATĂ per user (vezi coloana
-- permisiuni_implicite_acordate de la tabelul staff), nu de fiecare dată
-- când rolul redevine 'receptionist'. Fără garda asta, un admin care
-- retrage manual o permisiune (șterge rândul din billing_permissions) ar
-- risca s-o vadă reapărută singură dacă userul iese și reintră din rolul
-- de receptionist — găsit la recenzia din 21 august 2026, înainte să
-- apuce să se întâmple real.
create or replace function acorda_permisiuni_facturare_implicite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'receptionist' and not new.permisiuni_implicite_acordate then
    insert into billing_permissions (user_id, permission)
    select new.user_id, p
    from unnest(array['view_invoices','create_invoice','issue_invoice','record_payment','cancel_invoice','create_credit_note']) as p
    on conflict (user_id, permission) do nothing;
    -- Nu atinge coloana role, deci nu redeclanșează acest trigger
    -- ("update of role") — fără risc de recursie.
    update staff set permisiuni_implicite_acordate = true where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger staff_permisiuni_facturare_implicite
  after insert or update of role on staff
  for each row execute function acorda_permisiuni_facturare_implicite();


-- =====================================================================
-- FUNCȚII
-- =====================================================================

-- Tariful unei nopți pentru un tip de cameră, la o dată dată.
-- Sezonul cu prioritatea cea mai mare câștigă; dacă nu se potrivește
-- niciunul, se aplică tariful de bază.
--
-- PARITATE CU JS: această funcție trebuie să producă exact aceleași
-- valori ca nightlyRate() din src/lib/pricing.js. Până în august 2026
-- nu primea deloc ocuparea, deci nu putea aplica tariful single sau
-- suplimentele — 22 din 24 de combinații difereau, iar site-ul public
-- cota alt preț decât înregistra PMS-ul.
-- Contractul e în src/lib/pricing-matrice.js; verificarea, în
-- tests/paritate-pret.sql.
--
-- Tariful single se aplică STRICT la 1 adult și 0 copii, și înlocuiește
-- standardul (nu se adaugă peste el).
create function nightly_rate(
  p_room_type text, p_date date,
  p_adults int default 2, p_children int default 0
) returns numeric language sql stable set search_path = public as $$
  with t as (
    select
      coalesce(
        (select s.price from seasons s
          where s.room_type = p_room_type
            and case when s.start_md <= s.end_md
                     then to_char(p_date,'MM-DD') between s.start_md and s.end_md
                     else to_char(p_date,'MM-DD') >= s.start_md
                       or to_char(p_date,'MM-DD') <= s.end_md
                end
          order by s.priority desc limit 1),
        (select r.base_price from rates r where r.room_type = p_room_type),
        0) as standard,
      (select coalesce(r.single_price, 0)      from rates r where r.room_type = p_room_type) as single,
      (select coalesce(r.adult_supplement, 0)  from rates r where r.room_type = p_room_type) as sup_a,
      (select coalesce(r.child_supplement, 0)  from rates r where r.room_type = p_room_type) as sup_c
  )
  select case
           when coalesce(p_adults,2) = 1 and coalesce(p_children,0) = 0 and t.single > 0
           then t.single
           else t.standard
              + greatest(0, coalesce(p_adults,2) - 2) * t.sup_a
              + coalesce(p_children,0) * t.sup_c
         end
  from t;
$$;


-- Ocuparea medie a proprietății, în procente, pe durata unui sejur.
-- Oglindește occupancyForStay() din src/lib/availability.js: media pe
-- nopți, nu pe zile-cameră. Numitorul e numărul TOTAL de camere, ca în
-- JS (unde lista de camere nu e filtrată după `active`).
create function occupancy_for_stay(
  p_checkin timestamptz, p_checkout timestamptz, p_exclude_id text default null
) returns numeric language sql stable set search_path = public as $$
  with nopti as (
    select generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day')::date as zi
  ), total as (
    select nullif(count(*), 0)::numeric as n from rooms
  )
  select coalesce(avg(
    (select count(*) from reservations r
      where r.status not in ('cancelled','noshow')
        and (p_exclude_id is null or r.id <> p_exclude_id)
        and r.checkin::date <= nopti.zi
        and r.checkout::date > nopti.zi
    )::numeric / (select n from total) * 100
  ), 0)
  from nopti;
$$;


-- Ajustarea online pentru O SINGURĂ noapte, după gradul de ocupare al
-- acelei nopți.
--
-- Doar majorările se aplică; sub tariful de bază nu se coboară niciodată.
-- Motivul e în datele reale: din 90 de zile în față, 59 aveau ocupare
-- exact 0%, iar între ziua 8 și 30 erau 15 zile goale și 5 peste 70%.
-- O zi plină peste trei săptămâni chiar înseamnă cerere și merită tarif
-- mai mare; o zi goală peste trei săptămâni înseamnă doar că e devreme,
-- iar o reducere acolo ar fi bani lăsați pe masă.
-- Ajustarea aplicată pentru un grad de ocupare dat.
--
-- Există ca funcție separată ca să poată fi verificată pe o matrice de
-- valori: online_night_adjustment_pct() își calculează singură ocuparea
-- din rezervările reale, deci nu se poate fixa într-un contract.
-- Perechea JS e onlineNightAdjustmentPct(); matricea comună stă în
-- src/lib/pricing-matrice.js, verificarea în tests/paritate-pret.sql.
create function online_adjustment_for_occupancy(p_occ numeric)
returns numeric language plpgsql stable set search_path = public as $$
declare v_max numeric; v_eff numeric; v_pct numeric;
begin
  if not exists (select 1 from online_pricing_tiers) then return 0; end if;

  -- Ultimul prag e inclusiv la capătul de sus, altfel 100% n-ar cădea
  -- în niciun prag.
  select max(max_occ) into v_max from online_pricing_tiers;
  v_eff := least(coalesce(p_occ, 0), v_max - 0.0001);
  select t.adjustment_pct into v_pct from online_pricing_tiers t
   where v_eff >= t.min_occ and v_eff < t.max_occ limit 1;

  return greatest(0, coalesce(v_pct, 0));
end; $$;


-- Punctul de intrare pentru o zi anume. Calculul pragului trece prin
-- funcția de mai sus, ca să existe o singură definiție a lui.
create function online_night_adjustment_pct(p_zi date, p_exclude_id text default null)
returns numeric language sql stable set search_path = public as $$
  -- Intervalul [p_zi, p_zi+1) are exact o noapte.
  select online_adjustment_for_occupancy(
           occupancy_for_stay(p_zi::timestamptz, (p_zi + 1)::timestamptz, p_exclude_id));
$$;


-- Totalul unui sejur: suma tarifelor pe nopți.
-- Ziua plecării NU e noapte vândută, de aici '- 1' din generate_series.
-- p_online aplică ajustarea pe grad de ocupare — doar rezervările făcute
-- prin site-ul propriu o primesc, exact ca liveReservationTotalOnline().
create function stay_total(
  p_room_id text, p_checkin timestamptz, p_checkout timestamptz,
  p_adults int default 2, p_children int default 0, p_online boolean default false,
  -- Rezervarea care se recalculează, ca să nu se numere pe sine în ocupare.
  -- Implicit null: la disponibilitatea publică rezervarea nici nu există încă.
  p_exclude_id text default null
) returns numeric language plpgsql stable set search_path = public as $$
declare v_tip text; v_baza numeric; v_online numeric;
begin
  select type into v_tip from rooms where id = p_room_id;
  if v_tip is null then return 0; end if;

  select coalesce(sum(nightly_rate(v_tip, d::date, p_adults, p_children)), 0)
    into v_baza
    from generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day') d;
  v_baza := round(v_baza, 2);

  if not coalesce(p_online, false) then return v_baza; end if;

  -- Fiecare noapte se ajustează după ocuparea EI, nu după media sejurului:
  -- un sejur care prinde un weekend plin și trei zile goale nu trebuie să
  -- dilueze majorarea weekendului într-o medie.
  -- Aceeași regulă e impusă și în JS, în liveReservationTotalOnline.
  --
  -- Scris ca (100 + pct) / 100, aceeași formă ca în JS: acolo e singura
  -- care păstrează exacte valorile de tip „.5" în virgulă mobilă, iar
  -- aici e echivalentă — deci cele două implementări se citesc la fel.
  select coalesce(sum(
           nightly_rate(v_tip, d::date, p_adults, p_children)
             * (100 + online_night_adjustment_pct(d::date, p_exclude_id)) / 100
         ), 0)
    into v_online
    from generate_series(p_checkin::date, p_checkout::date - 1, interval '1 day') d;

  return round(v_online);
end; $$;


-- Camerele libere într-un interval, cu prețul total.
-- Singura funcție de citire pe care o folosește site-ul public.
-- Rezervările 'pending' blochează camera doar cât timp rezervarea
-- temporară e validă (relevant doar dacă se adaugă plata online).
--
-- security definer: rulează cu drepturile proprietarului, ca să poată citi
-- rooms/reservations pentru un vizitator nelogat. Fără asta, RLS îi blochează
-- citirea și funcția întoarce listă goală.
-- Ce se expune public e exact ce întoarce semnătura: id, denumire, tip,
-- capacitate și preț total. Datele oaspeților rămân inaccesibile.
--
-- p_guests se interpretează ca număr de adulți: la acest nivel nu se
-- cunoaște defalcarea. Site-ul public folosește o funcție separată, care
-- primește adulți și copii distinct.
create function available_rooms(p_checkin timestamptz, p_checkout timestamptz, p_guests int default 1)
returns table (room_id text, room_name text, room_type text, capacity int, total numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.type, r.capacity,
         stay_total(r.id, p_checkin, p_checkout, greatest(1, p_guests), 0, true)
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


-- Contorul de cereri pentru rate-limiting-ul funcției publice de
-- rezervare de mai jos. RLS activat DAR fără nicio politică: nimeni nu
-- ajunge la el prin API (nici anon, nici authenticated) — se citește și
-- se scrie exclusiv din interiorul create_booking, care fiind
-- `security definer` ocolește RLS pentru propriile query-uri.
create table booking_attempts (
  id          bigint generated always as identity primary key,
  -- 'phone:<telefon>', 'ip:<adresă>' sau 'toate' — ultimul e contorul
  -- pe toată pensiunea, singurul care nu poate fi ocolit prin rotirea
  -- telefonului și a adresei.
  fingerprint text not null,
  created_at  timestamptz not null default now()
);
create index booking_attempts_fp_created on booking_attempts (fingerprint, created_at desc);
alter table booking_attempts enable row level security;


-- Adresa reală a clientului. O folosesc toate plafoanele pe IP de mai jos.
--
-- DE CE NU x-forwarded-for. Antetul e scris de client, iar Cloudflare doar
-- ADAUGĂ la el — deci primul element, cel citit până acum peste tot, era
-- chiar valoarea trimisă de atacator. Măsurat pe producție: o cerere cu
-- "X-Forwarded-For: 198.51.100.9" ajunge aici ca "198.51.100.9,86.124.62.94",
-- iar split_part(...,1) întorcea exact minciuna. Toate plafoanele pe IP erau
-- ocolibile rotind antetul la fiecare cerere.
--
-- DE CE cf-connecting-ip. E pus de Cloudflare și nu poate fi falsificat: o
-- cerere care îl trimite singură e respinsă la margine cu 403 (error 1000),
-- deci nici nu ajunge la bază. sb-forwarded-for e a doua plasă —
-- falsificarea lui e ignorată în tăcere, adresa reală rămâne.
--
-- Perechea din funcțiile edge e ipClient() din src/lib/ip.js. Se schimbă
-- împreună.
create or replace function ip_client()
returns text language plpgsql stable security definer
set search_path = public as $$
declare v jsonb;
begin
  begin
    v := current_setting('request.headers', true)::jsonb;
  exception when others then
    -- Chemată din afara unei cereri PostgREST (editor SQL, job): fără IP.
    return null;
  end;
  -- ORDINEA E CEA MĂSURATĂ, ŞI A FOST DEJA GREŞITĂ O DATĂ.
  --
  -- La 9 septembrie 2026 a fost inversată aici, cu `sb-forwarded-for` primul,
  -- pe motiv că un antet pus de platformă e mai sigur decât unul pus de
  -- Cloudflare. Motivul suna bine şi era o presupunere: `src/lib/ip.js`
  -- răspunsese deja la ea, din măsurători pe producţie. Schimbarea a fost
  -- dată înapoi în aceeaşi zi.
  --
  -- `cf-connecting-ip` NU poate fi falsificat, şi nu fiindcă e rescris: o
  -- cerere care îl trimite singură e respinsă la marginea Cloudflare cu 403
  -- (error 1000), deci nici nu ajunge până aici. E o garanţie mai tare decât
  -- rescrierea. `sb-forwarded-for` e a doua plasă — falsificarea lui e
  -- ignorată în tăcere, adresa reală rămâne.
  --
  -- SE SCHIMBĂ ÎMPREUNĂ cu `ipClient()` din `src/lib/ip.js` — iar dacă vreuna
  -- pare că merită schimbată singură, citeşte întâi comentariul celeilalte.
  return nullif(coalesce(v ->> 'cf-connecting-ip', v ->> 'sb-forwarded-for'), '');
end $$;

-- Nu e chemată niciodată direct de client, doar din funcțiile de mai jos,
-- care rulează security definer.
revoke execute on function ip_client() from public, anon, authenticated;


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
--
-- RATE-LIMITING (adăugat după auditul de producție): fiind apelabilă
-- fără autentificare și fără cost economic, funcția putea fi folosită ca
-- să se umple calendarul cu rezervări false. Se limitează la 5 rezervări
-- pe oră per număr de telefon și 20 per adresă IP.
--
-- Numărătoarea reflectă doar rezervările REUȘITE: un apel care eșuează
-- (cameră inexistentă, suprapunere) face rollback la toată tranzacția,
-- inclusiv la rândul de contorizare. E exact ce trebuie aici — scenariul
-- vizat e flood-ul cu rezervări valide, nu cererile respinse, care nu
-- ocupă nimic în calendar.
--
-- Limită cunoscută: oprește un script naiv (telefon/IP fix). Un atacator
-- care le rotește pe amândouă cere CAPTCHA sau token de sesiune pe
-- site-ul public — infrastructură care nu există în acest repo.
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
-- search_path include `extensions`: acolo traieste gen_random_bytes
-- (pgcrypto), iar cu doar `public` funcția eșua cu "function
-- gen_random_bytes(integer) does not exist".
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_guest_id    text;
  v_res_id      text;
  v_phone_key   text;
  v_ip          text;
  v_count_phone int;
  v_count_ip    int;
begin
  if coalesce(trim(p_last_name),'') = '' or coalesce(trim(p_first_name),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nume, prenume și telefon sunt obligatorii.';
  end if;
  -- Validare de format — site-ul public nu trece prin PMS, deci nu are
  -- validarea din front-end (PhoneDialPicker); e nevoie de ea aici,
  -- înainte de orice scriere. Aceeași regulă generală ca la nivel de
  -- tabel (guests_format_contact), verificată devreme ca să iasă cu un
  -- mesaj clar, nu cu eroarea brută de constraint.
  if not (p_phone ~ '^[+]?[0-9 ()-]+$'
          and length(regexp_replace(p_phone, '[^0-9]', '', 'g')) between 6 and 15) then
    raise exception 'Numărul de telefon nu pare valid.';
  end if;
  if p_email is not null and trim(p_email) <> '' and p_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Adresa de email nu are un format valid.';
  end if;

  -- Telefonul e mereu disponibil (obligatoriu mai sus). IP-ul vine din
  -- X-Forwarded-For, expus de PostgREST prin GUC-ul request.headers; dacă
  -- acel GUC lipsește sau are alt format, IP-ul rămâne necunoscut și doar
  -- limita pe telefon se aplică — funcția nu eșuează din cauza asta.
  v_phone_key := lower(trim(p_phone));
  begin
    v_ip := ip_client();
  exception when others then
    v_ip := null;
  end;

  -- Auto-curățare, fără job separat: volumul e mic la scara unei pensiuni.
  delete from booking_attempts where created_at < now() - interval '1 day';

  select count(*) into v_count_phone from booking_attempts
    where fingerprint = 'phone:' || v_phone_key and created_at > now() - interval '1 hour';
  if v_count_phone >= 5 then
    raise exception 'Prea multe cereri de rezervare cu acest număr de telefon. Sună recepția pentru asistență.';
  end if;

  if v_ip is not null then
    select count(*) into v_count_ip from booking_attempts
      where fingerprint = 'ip:' || v_ip and created_at > now() - interval '1 hour';
    if v_count_ip >= 20 then
      raise exception 'Prea multe cereri de rezervare de la această adresă. Încearcă mai târziu sau sună recepția.';
    end if;
  end if;

  insert into booking_attempts (fingerprint) values ('phone:' || v_phone_key);
  if v_ip is not null then
    insert into booking_attempts (fingerprint) values ('ip:' || v_ip);
  end if;

  if p_checkout <= p_checkin then
    raise exception 'Data de plecare trebuie să fie după data sosirii.';
  end if;
  if p_checkin < now() - interval '1 day' then
    raise exception 'Nu se pot face rezervări în trecut.';
  end if;

  select id into v_guest_id from guests
   where lower(phone) = v_phone_key limit 1;

  if v_guest_id is null then
    v_guest_id := 'g-' || encode(gen_random_bytes(6),'hex');
    insert into guests (id, last_name, first_name, phone, email, city, county, country)
    values (v_guest_id, trim(p_last_name), trim(p_first_name), trim(p_phone),
            nullif(trim(p_email),''), trim(p_city), trim(p_county), trim(p_country));
  end if;

  v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');

  insert into reservations (id, room_id, guest_id, checkin, checkout, status,
                            adults, children, source, notes, booked_price)
  values (v_res_id, p_room_id, v_guest_id, p_checkin, p_checkout, 'confirmed',
          greatest(coalesce(p_adults,2),1), greatest(coalesce(p_children,0),0),
          'site', nullif(trim(p_notes),''),
          stay_total(p_room_id, p_checkin, p_checkout,
                     greatest(coalesce(p_adults,2),1),
                     greatest(coalesce(p_children,0),0), true));

  -- Prețul, cu ocuparea reală și ajustarea pentru site. Calculat înainte
  -- de insert, ca să fie și înghețat în rând, și întors clientului —
  -- aceeași valoare în ambele locuri, prin construcție. Fără asta, PMS-ul
  -- îl recalcula singur la următoarea încărcare, cu alt rezultat.
  return query select v_res_id, stay_total(p_room_id, p_checkin, p_checkout,
                                           greatest(coalesce(p_adults,2),1),
                                           greatest(coalesce(p_children,0),0), true);
exception
  -- Doi vizitatori care rezervă simultan aceeași cameră: baza refuză,
  -- al doilea primește un mesaj clar, nu o eroare tehnică.
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă cameră sau altă perioadă.';
end;
$$;


-- =====================================================================
-- REZERVĂRI DE PE SITE-UL PUBLIC
--
-- Site-ul nu atinge niciun tabel. Tot ce poate face trece prin trei
-- funcții `security definer`, fiecare cu propriile validări și limite:
--   · public_availability      — ce camere sunt libere și la ce preț
--   · create_public_booking    — creează rezervarea, atomic
--   · public_booking_by_token  — pagina de confirmare
--
-- PMS-ul rămâne singura autoritate: disponibilitatea se verifică din nou
-- în momentul creării, iar prețul e calculat de server (vezi triggerul
-- pret_server_rezervare). Ce trimite browserul e doar o intenție.
-- =====================================================================

-- Un rând per rezervare făcută online. Acoperă simultan patru nevoi care
-- altfel ar fi cerut patru mecanisme separate: idempotența, numărul de
-- confirmare, tokenul paginii de confirmare și trasabilitatea.
create table public_bookings (
  id               text primary key,
  -- Cheia generată de browser. UNIQUE = garanția anti-duplicat: două
  -- cereri cu aceeași cheie nu pot produce două rezervări.
  idempotency_key  uuid not null unique,
  confirmation_number text not null unique,
  -- 128 de biți: pagina /confirmare/{token} nu poate fi enumerată.
  public_token     text not null unique default encode(gen_random_bytes(16),'hex'),
  guest_id         text references guests(id) on delete set null,
  group_id         text references res_groups(id) on delete set null,
  -- Rezervările PMS produse de această cerere. Array, nu tabel de
  -- legătură: se citesc mereu împreună.
  reservation_ids  text[] not null,
  checkin          timestamptz not null,
  checkout         timestamptz not null,
  rooms_count      int not null,
  total_amount     numeric not null,
  -- 'pending' = camera e doar ținută, până confirmă clientul; 'expired' =
  -- n-a confirmat la timp și camera s-a eliberat singură.
  status           text not null default 'confirmed'
                     check (status in ('pending','confirmed','cancelled','expired')),
  -- Cât ține camera până la confirmare. NULL = rezervare fermă din prima
  -- clipă, adică drumul pe care intră rezervările făcute de recepție.
  hold_expires_at  timestamptz,
  request_ip       text,
  created_at       timestamptz not null default now(),
  email_sent_at    timestamptz,   -- o singură trimitere per rezervare
  cancelled_at     timestamptz,
  check (checkout > checkin),
  check (rooms_count > 0)
);
create index public_bookings_token   on public_bookings (public_token);
create index public_bookings_created on public_bookings (created_at desc);
create index public_bookings_guest   on public_bookings (guest_id);
create index public_bookings_hold    on public_bookings (hold_expires_at)
  where status = 'pending';

-- RLS activat, fără nicio politică: inaccesibil prin API pentru orice
-- rol. Se scrie și se citește doar din funcțiile de mai jos.
alter table public_bookings enable row level security;

-- Numărul de confirmare: prefix + secvență. Secvență, nu valoare
-- aleatoare, fiindcă trebuie dictat la telefon și căutat ușor.
create sequence public_booking_seq start 1000;

create or replace function next_confirmation_number()
returns text language sql volatile set search_path = public as $$
  select 'LDV-' || lpad(nextval('public_booking_seq')::text, 6, '0');
$$;


-- Alocarea unui grup pe camere libere.
--
-- STRATEGIA: câte DOI adulți pe cameră, răspândiți pe cât mai multe
-- camere. Al treilea adult apare abia când nu mai sunt camere — adică
-- peste de două ori numărul de camere libere. Al treilea loc e ținut
-- pentru copii.
--
-- Nu e doar preferință de confort, e și mai bine vândut: șase adulți în
-- trei camere de doi fac 900 lei/noapte, iar împachetați în două camere
-- de trei doar 760. Suplimentul de adult (80) nu acoperă niciodată
-- tariful unei camere în plus (300).
--
-- p_type null înseamnă „orice tip" — varianta amestecată, folosită când
-- grupul nu încape într-un singur tip SAU când amestecul deschide mai
-- multe camere decât oricare tip separat.
--
-- Alegerea camerelor:
--   · fără copii — întâi cele mici, fiindcă o cameră de 2 e exact o
--     pereche de adulți, iar cele de 3 rămân libere pentru familii;
--   · cu copii — întâi cele mari, ca al treilea loc să fie disponibil.
--
-- Restul regulilor:
--   · fiecare cameră primește cel puțin un adult, altfel ar rămâne copii
--     singuri într-o cameră;
--   · adulții și copiii se așază pe rând, câte unul în fiecare cameră —
--     așa toate camerele ajung la doi adulți înainte ca vreuna să
--     primească al treilea, și nu se adună adulții într-o cameră și
--     copiii în alta.
--
-- Întoarce fie o propunere completă, fie motivul pentru care nu se poate,
-- ca interfața să poată spune omului ce anume să schimbe.
create function allocate_group(
  p_checkin timestamptz, p_checkout timestamptz,
  p_adults int, p_children int, p_type text default null
) returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_pers int := p_adults + p_children;
  v_cap_toate int[]; v_tip_toate text[];
  v_n_libere int; v_k_min int := null; v_cum int := 0;
  v_nr int; v_cap_alese int;
  v_adulti int[]; v_copii int[];
  v_i int; v_pus boolean;
  v_rest_ad int; v_rest_cop int;
  v_camere jsonb := '[]'::jsonb;
  v_total numeric;
begin
  if p_adults < 1 then
    return jsonb_build_object('ok', false, 'reason', 'adulti', 'roomsNeeded', 1);
  end if;

  select array_agg(capacity order by rn), array_agg(type order by rn), count(*)
    into v_cap_toate, v_tip_toate, v_n_libere
  from (
    select r.type, r.capacity,
           row_number() over (
             order by case when p_children > 0 then -r.capacity else r.capacity end,
                      r.type, r.sort_order) as rn
      from rooms r
     where r.active
       and (p_type is null or r.type = p_type)
       and not exists (
         select 1 from reservations res
          where res.room_id = r.id
            and res.status not in ('cancelled','noshow')
            and (res.status <> 'pending' or res.hold_expires_at > now())
            and tstzrange(res.checkin, res.checkout, '[)')
                && tstzrange(p_checkin, p_checkout, '[)')
       )
  ) l;

  if coalesce(v_n_libere, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;

  -- Câte camere sunt strict necesare ca să încapă toată lumea.
  for v_i in 1 .. v_n_libere loop
    v_cum := v_cum + v_cap_toate[v_i];
    if v_cum >= v_pers then v_k_min := v_i; exit; end if;
  end loop;
  if v_k_min is null then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;

  -- Câte camere vindem: una la fiecare doi adulți, dar cel puțin cât cere
  -- capacitatea, și niciodată mai multe decât camerele libere sau decât
  -- numărul de adulți.
  v_nr := greatest(ceil(p_adults / 2.0)::int, v_k_min);
  v_nr := least(v_nr, v_n_libere, p_adults);

  select coalesce(sum(v_cap_toate[i]), 0) into v_cap_alese
    from generate_series(1, v_nr) i;
  if v_cap_alese < v_pers then
    -- Locuri ar fi, dar nu și adulți câți camere ar trebui deschise.
    return jsonb_build_object('ok', false, 'reason', 'adulti', 'roomsNeeded', v_k_min);
  end if;

  v_adulti := array_fill(0, array[v_nr]);
  v_copii  := array_fill(0, array[v_nr]);
  v_rest_ad := p_adults;
  v_rest_cop := p_children;

  while v_rest_ad > 0 loop
    v_pus := false;
    for v_i in 1 .. v_nr loop
      exit when v_rest_ad = 0;
      if v_adulti[v_i] + v_copii[v_i] < v_cap_toate[v_i] then
        v_adulti[v_i] := v_adulti[v_i] + 1; v_rest_ad := v_rest_ad - 1; v_pus := true;
      end if;
    end loop;
    exit when not v_pus;
  end loop;

  while v_rest_cop > 0 loop
    v_pus := false;
    for v_i in 1 .. v_nr loop
      exit when v_rest_cop = 0;
      if v_adulti[v_i] + v_copii[v_i] < v_cap_toate[v_i] then
        v_copii[v_i] := v_copii[v_i] + 1; v_rest_cop := v_rest_cop - 1; v_pus := true;
      end if;
    end loop;
    exit when not v_pus;
  end loop;

  if v_rest_ad > 0 or v_rest_cop > 0 then
    return jsonb_build_object('ok', false, 'reason', 'locuri');
  end if;

  for v_i in 1 .. v_nr loop
    v_camere := v_camere || jsonb_build_object(
      'roomType', v_tip_toate[v_i], 'adults', v_adulti[v_i], 'children', v_copii[v_i]);
  end loop;

  -- Prețul depinde de tip, dată și ocupare — nu de camera individuală.
  select coalesce(sum(stay_total(
           (select id from rooms where active and type = c->>'roomType' limit 1),
           p_checkin, p_checkout,
           (c->>'adults')::int, (c->>'children')::int, true)), 0)
    into v_total
    from jsonb_array_elements(v_camere) c;

  return jsonb_build_object(
    'ok', true, 'roomType', coalesce(p_type, 'mixt'),
    'roomsNeeded', v_nr, 'rooms', v_camere, 'total', v_total);
end; $$;


-- Plafoanele fizice ale pensiunii, pentru limitele din formular.
--
-- Formularul trebuie să știe CE poate cere înainte să ceară: până în 19
-- august 2026 oferea 4 adulți, deși cea mai mare cameră are 3 locuri, deci
-- căutarea întorcea gol de fiecare dată, pentru orice perioadă.
--
-- Nu spune nimic despre disponibilitate — aceea depinde de perioadă și
-- vine din public_availability.
create function public_capacity()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maxPerRoom', coalesce(max(capacity), 0),
    'maxRooms',   count(*),
    'maxGuests',  coalesce(sum(capacity), 0)
  ) from rooms where active;
$$;


-- Disponibilitatea pentru un grup întreg.
--
-- p_adults/p_children sunt TOTALUL grupului, nu ocuparea unei camere.
-- Serverul împarte grupul pe câte camere sunt necesare și întoarce, pentru
-- fiecare tip care îl poate găzdui, o propunere completă — exact lista pe
-- care clientul o trimite înapoi la create_public_booking.
--
-- Per tip, nu o singură propunere amestecată: altfel un cuplu ar pierde
-- alegerea între Tiny house și Loft, iar aceea e o diferență de produs și
-- de preț, nu un detaliu. Varianta mixtă apare doar când niciun tip singur
-- nu încape grupul.
create or replace function public_availability(
  p_checkin timestamptz, p_checkout timestamptz,
  p_adults int default 2, p_children int default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ad   int := greatest(coalesce(p_adults, 2), 1);
  v_cop  int := greatest(coalesce(p_children, 0), 0);
  v_pers int;
  v_max_online int;
  v_tip text;
  v_rez jsonb;
  v_optiuni jsonb := '[]'::jsonb;
  v_min_camere int := null;
  v_max_camere_tip int := 0;
begin
  v_pers := v_ad + v_cop;

  if p_checkin is null or p_checkout is null or p_checkout <= p_checkin then
    return jsonb_build_object('error', 'Perioadă invalidă.');
  end if;
  if p_checkout::date - p_checkin::date > 30 then
    return jsonb_build_object('error', 'Sejurul nu poate depăși 30 de nopți.');
  end if;
  if p_checkin < now() - interval '1 day' then
    return jsonb_build_object('error', 'Data sosirii este în trecut.');
  end if;
  if p_checkin > now() + interval '400 day' then
    return jsonb_build_object('error', 'Se pot căuta date doar în următoarele 400 de zile.');
  end if;

  select (public_capacity()->>'maxGuests')::int into v_max_online;
  if v_pers > v_max_online then
    return jsonb_build_object('error', format(
      'Pensiunea are %s locuri în total. Pentru grupuri mai mari, sună-ne.', v_max_online));
  end if;

  for v_tip in select distinct type from rooms where active order by 1 loop
    v_rez := allocate_group(p_checkin, p_checkout, v_ad, v_cop, v_tip);
    if (v_rez->>'ok')::boolean then
      v_optiuni := v_optiuni || (v_rez - 'ok');
      v_max_camere_tip := greatest(v_max_camere_tip, (v_rez->>'roomsNeeded')::int);
    elsif v_rez->>'reason' = 'adulti' then
      v_min_camere := least(coalesce(v_min_camere, (v_rez->>'roomsNeeded')::int),
                            (v_rez->>'roomsNeeded')::int);
    end if;
  end loop;

  -- Varianta amestecată se oferă când niciun tip singur nu încape grupul,
  -- sau când deschide MAI MULTE camere decât oricare tip separat. A doua
  -- contează pentru grupuri mari: peste 28 de adulți, cele 14 căsuțe Tiny
  -- ar trebui să primească al treilea adult, în timp ce toate cele 16
  -- camere îi țin câte doi.
  v_rez := allocate_group(p_checkin, p_checkout, v_ad, v_cop, null);
  if (v_rez->>'ok')::boolean
     and (jsonb_array_length(v_optiuni) = 0
          or (v_rez->>'roomsNeeded')::int > v_max_camere_tip) then
    v_optiuni := v_optiuni || (v_rez - 'ok');
  elsif not (v_rez->>'ok')::boolean and v_rez->>'reason' = 'adulti'
        and jsonb_array_length(v_optiuni) = 0 then
    v_min_camere := least(coalesce(v_min_camere, (v_rez->>'roomsNeeded')::int),
                          (v_rez->>'roomsNeeded')::int);
  end if;

  -- Dacă vreo variantă reușește cu cel mult doi adulți pe cameră, le
  -- scoatem pe cele care ar pune un al treilea. Altfel varianta înghesuită
  -- ar sta alături, mai ieftină, și ar fi aleasă tocmai fiindcă e mai
  -- ieftină — adică exact ce nu vrem. Al treilea adult e ultima soluție,
  -- nu o alternativă.
  if exists (
    select 1 from jsonb_array_elements(v_optiuni) o
     where (select max((x->>'adults')::int) from jsonb_array_elements(o->'rooms') x) <= 2)
  then
    select coalesce(jsonb_agg(o), '[]'::jsonb) into v_optiuni
      from jsonb_array_elements(v_optiuni) o
     where (select max((x->>'adults')::int) from jsonb_array_elements(o->'rooms') x) <= 2;
  end if;

  if jsonb_array_length(v_optiuni) = 0 then
    return jsonb_build_object(
      'checkIn', p_checkin, 'checkOut', p_checkout,
      'nights',  p_checkout::date - p_checkin::date,
      'guests',  jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
      'options', v_optiuni,
      'error',
        case when v_min_camere is not null then format(
          'Pentru %s persoane sunt necesare %s camere, iar în fiecare trebuie să fie cel puțin un adult. Ai nevoie de cel puțin %s adulți sau de mai puține persoane.',
          v_pers, v_min_camere, v_min_camere)
        else 'Nu mai sunt camere libere pentru perioada și numărul de persoane alese.'
        end);
  end if;

  return jsonb_build_object(
    'checkIn',  p_checkin,
    'checkOut', p_checkout,
    'nights',   p_checkout::date - p_checkin::date,
    'guests',   jsonb_build_object('adults', v_ad, 'children', v_cop, 'total', v_pers),
    'options',  v_optiuni);
end; $$;


-- Crearea unei rezervări de pe site. O singură tranzacție: ori se creează
-- tot, ori nimic.
--
-- Ordinea pașilor nu e arbitrară:
--   · idempotența e PRIMA, ca un retry legitim să nu consume rate-limit;
--   · lock-ul vine înainte de alocare, ca două cereri simultane să nu
--     vadă aceeași cameră liberă;
--   · prețul NU se calculează aici — îl pune triggerul, iar noi îl citim
--     înapoi cu RETURNING. O singură formulă, nu două care pot diverge.
--
-- search_path include `extensions` pentru gen_random_bytes (pgcrypto).
-- Eliberarea rezervărilor ținute care n-au fost confirmate la timp.
--
-- Fără job separat: se apelează din funcțiile publice, singurele căi prin
-- care se ajunge oricum la aceste rânduri. Nu e doar pentru
-- disponibilitate — acolo allocate_group ignoră deja holdurile expirate —
-- ci și pentru calendarul din PMS, care altfel s-ar umple cu rezervări
-- moarte pe care le-ar vedea recepția ca fiind reale.
create or replace function expira_rezervari_neconfirmate()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public_bookings
     set status = 'expired'
   where status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at <= now();
  get diagnostics v_n = row_count;

  -- Doar rezervările PMS ale acelor rezervări online, nu orice 'pending':
  -- recepția poate avea propriile rezervări în așteptare, fără nicio
  -- legătură cu site-ul.
  update reservations r
     set status = 'cancelled'
    from public_bookings b
   where r.id = any(b.reservation_ids)
     and b.status = 'expired'
     and r.status = 'pending';

  return v_n;
end; $$;


-- Confirmarea de către client a unei rezervări ținute.
--
-- Idempotentă: un link deschis de două ori nu e o eroare. Nu primește
-- nimic în afară de token — pe calea asta nu se poate schimba nimic din
-- rezervare, doar trecerea din „ținută" în „fermă".
create or replace function confirm_public_booking(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  perform expira_rezervari_neconfirmate();

  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'confirmed' then
    return jsonb_build_object('success', true, 'repeat', true, 'status', 'confirmed',
      'confirmationNumber', v_b.confirmation_number);
  end if;
  if v_b.status = 'cancelled' then
    raise exception 'Rezervarea a fost anulată.' using errcode = 'P0003';
  end if;
  if v_b.status = 'expired' then
    -- Nu e o eroare tehnică, e un rezultat: interfața trebuie să-i spună
    -- omului că poate relua căutarea.
    return jsonb_build_object('success', false, 'status', 'expired',
      'confirmationNumber', v_b.confirmation_number);
  end if;

  update reservations set status = 'confirmed', hold_expires_at = null
   where id = any(v_b.reservation_ids) and status = 'pending';

  update public_bookings set status = 'confirmed', hold_expires_at = null
   where id = v_b.id;

  return jsonb_build_object('success', true, 'status', 'confirmed',
    'confirmationNumber', v_b.confirmation_number);
end; $$;


create or replace function create_public_booking(
  p_idempotency_key uuid,
  p_checkin timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null,
  -- 0 = rezervare fermă pe loc. >0 = camera e doar ținută atâtea minute,
  -- până confirmă clientul; vezi comentariul de la
  -- expira_rezervari_neconfirmate.
  p_hold_minutes int default 0,
  -- IP-ul vizitatorului, transmis explicit. Crearea trece printr-o funcție
  -- edge (verificarea Turnstile cere o cheie secretă, iar PostgREST nu
  -- face apeluri HTTP), iar de acolo `request.headers` conține adresa
  -- funcției edge, nu a omului — limita pe IP ar fi numărat toate
  -- rezervările pe aceeași adresă. Parametrul e de încredere fiindcă
  -- singurul care poate apela funcția e service_role, adică funcția edge,
  -- care citește adresa din propria cerere.
  p_client_ip text default null
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
      'total', v_ex.total_amount, 'rooms', v_ex.rooms_count);
  end if;

  -- 2. VALIDĂRI ȘI LIMITE
  -- Plafon dinamic: se poate rezerva toata pensiunea. O cifra fixa ar
  -- ramane in urma daca se mai adauga camere.
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
  -- Când rezervarea e doar ținută, confirmarea vine pe email: fără adresă
  -- n-ar avea cum să devină fermă niciodată. Regula stă aici, nu doar în
  -- formular — un formular ocolit nu trebuie să producă o rezervare care
  -- expiră oricum.
  if coalesce(p_hold_minutes, 0) > 0 and coalesce(trim(p_email),'') = '' then
    raise exception 'Emailul e obligatoriu pentru rezervarea online.';
  end if;

  -- 3. RATE-LIMIT, pe trei paliere.
  --
  --    Telefonul e o identitate reală, dar se poate inventa. IP-ul se
  --    poate roti (proxy rezidențial, rețea mobilă). Plafonul zilnic pe
  --    toată pensiunea nu se poate ocoli în niciun fel — de aceea există.
  --
  --    Prețul plafonului global: dacă cineva îl epuizează, și clienții
  --    reali sunt opriți până a doua zi. Alegerea e deliberată. Un client
  --    oprit sună recepția și rezervă la telefon; un calendar umplut cu
  --    rezervări false trebuie curățat rând cu rând, iar până atunci
  --    camerele apar ocupate și pentru cei care chiar ar fi venit.
  --    25 pe zi la 16 camere e mult peste orice zi reală — de la pornirea
  --    site-ului au fost 3 rezervări online în total.
  --
  --    Se numără doar rezervările REUȘITE: un apel care eșuează face
  --    rollback la toată tranzacția, inclusiv la rândul de contorizare.
  --    E exact ce trebuie — scenariul vizat e umplerea calendarului cu
  --    rezervări valide, nu cererile respinse, care nu ocupă nimic.
  -- Adresa transmisă de funcția edge are prioritate; antetul rămâne
  -- rezerva pentru cazul în care parametrul lipsește.
  v_ip := nullif(trim(coalesce(p_client_ip, '')), '');
  if v_ip is null then
    begin
      v_ip := ip_client();
    exception when others then v_ip := null; end;
  end if;

  -- Două zile, nu una: ferestrele de mai jos se uită 24 de ore în urmă,
  -- iar o curățare la exact 24 de ore ar tăia din ce tocmai numărăm.
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

  -- Pragurile pe IP stau între două cerințe care trag în sensuri opuse.
  --
  -- LARGI, fiindcă rețelele mobile din România pun mulți abonați în spatele
  -- aceleiași adrese: o limită strânsă ar opri oameni fără nicio legătură
  -- între ei.
  --
  -- Dar STRICT SUB PLAFONUL GLOBAL de 25/zi. Cât erau 30/zi, o singură
  -- adresă putea consuma toate rezervările online ale zilei, iar site-ul
  -- începea să răspundă tuturor „Rezervările online sunt oprite temporar" —
  -- plasa de siguranță se transforma în butonul de oprire al atacatorului.
  --
  -- 12/zi împarte diferența: e nevoie de cel puțin trei adrese ca să se
  -- ajungă la plafonul global, și e mult peste câte rezervări poate face
  -- într-o zi un grup de abonați care chiar împarte un IP, la o pensiune cu
  -- sub 25 de rezervări online pe zi în total.
  --
  -- Nimic din toate astea nu înlocuiește Turnstile: fără TURNSTILE_SECRET,
  -- `booking-create` lasă să treacă orice cerere, iar plafoanele rămân
  -- singura apărare.
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

  -- 4. SERIALIZARE. Ține până la COMMIT. La 16 camere costul e neglijabil,
  --    iar alternativa (reîncercare la exclusion_violation) ar complica
  --    alocarea multi-cameră fără câștig real.
  perform pg_advisory_xact_lock(hashtext('lalivada:booking'));

  -- Holdurile trecute se eliberează ÎNAINTE de căutarea camerelor, altfel
  -- o rezervare abandonată acum o oră ar bloca una reală.
  perform expira_rezervari_neconfirmate();

  -- 5. OASPETE, recunoscut după telefon ȘI nume.
  --
  -- Cu telefonul singur, cine află numărul cuiva putea face o rezervare
  -- atașată fișei aceluia, iar pagina cu token îi arăta înapoi numele real
  -- al proprietarului numărului — un oracol nume-din-telefon, ieftin de
  -- pornit. În plus, rezervarea murdărea fișa unui client adevărat.
  --
  -- Clientul fidel care își scrie numele la fel e recunoscut ca înainte.
  -- Cine îl scrie altfel primește o fișă nouă, pe care recepția o poate uni
  -- la loc — o dublă în listă supără mult mai puțin decât datele unui om
  -- arătate altcuiva.
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

  -- 6. GRUP, doar la mai multe camere. Numele vine din câmpul "Nume" al
  --    formularului — nu se ghicește din despicarea unui string.
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

    -- Camera cea mai potrivită, nu cea mai mare: ordonarea după capacitate
    -- evită risipa unei camere de 3 locuri pentru două persoane.
    select r.id into v_room_id
      from rooms r
     where r.active and r.type = v_tip and r.capacity >= v_ad + v_cop
       and not exists (
         select 1 from reservations res
          where res.room_id = r.id
            and res.status not in ('cancelled','noshow')
            -- Un hold trecut nu mai blochează. Expresia e IDENTICĂ cu cea
            -- din allocate_group, intenționat: căutarea de disponibilitate
            -- și crearea trebuie să răspundă la fel, altfel site-ul oferă
            -- o cameră pe care funcția asta o refuză.
            and (res.status <> 'pending' or res.hold_expires_at > now())
            and tstzrange(res.checkin, res.checkout, '[)')
                && tstzrange(p_checkin, p_checkout, '[)')
       )
     order by r.capacity, r.sort_order
     limit 1;

    if v_room_id is null then
      -- Anulează TOT: grupul, oaspetele nou, camerele deja alocate.
      raise exception 'Nu mai sunt camere disponibile pentru perioada aleasă.'
        using errcode = 'P0002';
    end if;

    v_res_id := 'r-' || encode(gen_random_bytes(6),'hex');
    insert into reservations (id, room_id, guest_id, group_id, checkin, checkout,
                              status, adults, children, source, notes, hold_expires_at)
    values (v_res_id, v_room_id, v_guest_id, v_group_id, p_checkin, p_checkout,
            v_status, v_ad, v_cop, 'site', nullif(trim(p_notes),''), v_hold)
    returning booked_price into v_pret;   -- prețul pus de trigger

    v_total   := v_total + coalesce(v_pret, 0);
    v_res_ids := v_res_ids || v_res_id;
  end loop;

  -- 8. CONFIRMARE
  v_nr := next_confirmation_number();
  insert into public_bookings (id, idempotency_key, confirmation_number, guest_id,
                               group_id, reservation_ids, checkin, checkout,
                               rooms_count, total_amount, request_ip,
                               status, hold_expires_at)
  values ('pb-' || encode(gen_random_bytes(6),'hex'), p_idempotency_key, v_nr,
          v_guest_id, v_group_id, v_res_ids, p_checkin, p_checkout,
          v_nr_camere, v_total, v_ip, v_status, v_hold)
  returning public_token into v_token;

  return jsonb_build_object('success', true, 'confirmationNumber', v_nr,
    'publicToken', v_token, 'status', v_status, 'holdExpiresAt', v_hold,
    'total', v_total, 'rooms', v_nr_camere);

exception
  when exclusion_violation then
    raise exception 'Camera tocmai a fost rezervată de altcineva. Alege altă perioadă.'
      using errcode = 'P0002';
end; $$;


-- Pagina de confirmare. Tokenul e singura cheie; id-urile interne nu apar
-- niciodată în URL și nu se pot enumera.
create or replace function public_booking_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'status', b.status, 'checkIn', b.checkin, 'checkOut', b.checkout,
    'nights', b.checkout::date - b.checkin::date,
    'rooms', b.rooms_count, 'total', b.total_amount,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    -- Interfața are nevoie să știe dacă mai poate arăta butonul de
    -- anulare; regula reală e impusă oricum în cancel_public_booking.
    'canCancel', (b.status = 'confirmed' and b.checkin > now()),
    'cancelledAt', b.cancelled_at)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;


-- ANULAREA DE CĂTRE CLIENT.
--
-- Nu șterge nimic: rezervările trec pe 'cancelled', deci camerele redevin
-- libere (constrângerea de suprapunere le ignoră), dar istoricul rămâne
-- intact în PMS.
--
-- Fereastra e generoasă fiindcă nu există plată în avans: se poate anula
-- oricând până la ora sosirii. După aceea clientul trebuie să sune — o
-- rezervare din ziua sosirii poate fi deja pregătită.
create or replace function cancel_public_booking(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public_bookings;
begin
  select * into v_b from public_bookings where public_token = p_token;
  if not found then
    raise exception 'Rezervarea nu a fost găsită.' using errcode = 'P0002';
  end if;

  if v_b.status = 'cancelled' then
    -- Idempotent: un link deschis de două ori nu e o eroare.
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

  return jsonb_build_object('success', true, 'status', 'cancelled',
    'confirmationNumber', v_b.confirmation_number);
end; $$;


-- Datele pentru emailul de confirmare. Conține adresa clientului, deci NU
-- e accesibilă anonim: o apelează doar funcția edge booking-email, cu
-- service_role.
create or replace function booking_email_payload(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'confirmationNumber', b.confirmation_number,
    'publicToken', b.public_token,
    'email', g.email,
    'guestName', trim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')),
    'checkIn', b.checkin, 'checkOut', b.checkout,
    'nights', b.checkout::date - b.checkin::date,
    'rooms', b.rooms_count, 'total', b.total_amount, 'status', b.status,
    'alreadySent', b.email_sent_at is not null)
  from public_bookings b
  left join guests g on g.id = b.guest_id
  where b.public_token = p_token;
$$;

create or replace function mark_booking_email_sent(p_token text)
returns void language sql volatile security definer set search_path = public as $$
  update public_bookings set email_sent_at = now() where public_token = p_token;
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
alter table online_pricing_tiers enable row level security;
alter table staff        enable row level security;
alter table app_state    enable row level security;

-- CITIRE. Camerista vede camerele, ocuparea lor (prin vederea
-- `rezervari_ocupare`, mai jos) și cheia ei de curățenie din `app_state`.
-- Restul — oaspeții, rezervările, grupurile — sunt ale adminului și
-- recepției. Prețurile (`rates`, `seasons`, tierele online) rămân deschise:
-- sunt oricum publice, le afișează pagina de rezervări.
create policy "staff citeste" on rooms        for select to authenticated using (true);

-- OASPEȚII: doar adminul și recepționerul.
--
-- Avea și el `using (true)`, fără nicio condiție de rol. Nu s-a scurs nimic —
-- în `staff` există doar admin și recepționer — dar rolul `housekeeping` e
-- cablat prin toată aplicația, iar în ziua în care se face un cont de
-- curățenie, acela ar fi citit numele, telefonul, emailul și adresa fiecărui
-- om care a trecut vreodată pe la pensiune.
--
-- Aici s-a închis ARHIVA. `guests` e singurul loc cu telefon, email și
-- adresă pentru toți oaspeții dintotdeauna.
--
-- Comentariul de aici spunea, până pe 9 septembrie 2026, că `reservations`
-- și `res_groups` pot rămâne deschise, fiindcă „o cameristă vede oricum cine
-- e cazat — intră în camere". Raționamentul ăla e despre NUME, și pentru
-- nume chiar ține. Dar în rândul rezervării mai stă și `guest_code`, codul
-- din linkul care deschide ușa — iar ăla nu se învață intrând în camere. Cu
-- el, un cont de curățenie (sau oricine îi ia parola) deschidea de la
-- distanță orice cameră ocupată, ocolind chiar glisorul din ecranul ei, care
-- e blocat tocmai pe camerele ocupate. Nu prețurile și nu numele au mutat
-- decizia, ci codul. Vezi `rezervari_ocupare` mai jos.
--
-- Funcțiile sunt învelite în `(select ...)`: altfel Postgres le tratează ca
-- volatile față de rând și le reevaluează O DATĂ PE RÂND la citirea întregului
-- tabel. Așa devin InitPlan, calculat o dată. Nu contează pentru housekeeping,
-- care primește zero rânduri — contează pentru cine le citește pe toate.
--
-- La modificare se folosește ALTER POLICY, nu DROP + CREATE: între cele două
-- comenzi tabelul rămâne fără nicio politică de SELECT, deci gol pentru TOATĂ
-- lumea, inclusiv admin, și fără nicio eroare — doar liste goale.
create policy "staff citeste" on guests       for select to authenticated
  using ((select is_admin()) or (select staff_role()) = 'receptionist');

-- Numele unui grup e adesea un nume de familie, deci merge cu `guests`.
create policy "staff citeste" on res_groups   for select to authenticated
  using ((select is_admin()) or (select staff_role()) = 'receptionist');
create policy "staff citeste" on reservations for select to authenticated
  using ((select is_admin()) or (select staff_role()) = 'receptionist');

-- Tarifele rămân deschise: sunt aceleași pe care le arată pagina publică de
-- rezervări, deci nu e nimic de ascuns de propriul personal.
create policy "staff citeste" on rates        for select to authenticated using (true);
create policy "staff citeste" on seasons      for select to authenticated using (true);

-- `pms:core:v3` ține datele de emitent ale facturii (CUI, adresă, cont),
-- `pms:access:v1` setările yalelor. Camerista citește doar cheia ei de
-- curățenie și `pms:log:v3`, cheia moartă a jurnalului — aceleași două ca la
-- scriere.
create policy "citeste app_state" on app_state for select to authenticated using (
  is_admin() or staff_role() = 'receptionist'
  or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
);
create policy "staff citeste" on online_pricing_tiers for select to authenticated using (true);
create policy "scrie tiere pret" on online_pricing_tiers for insert to authenticated with check (is_admin());
create policy "modifica tiere pret" on online_pricing_tiers for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge tiere pret" on online_pricing_tiers for delete to authenticated using (is_admin());

-- Fiecare angajat își vede propriul rând (rolul); adminii îi văd pe toți
-- (ecranul "Useri și drepturi"). O singură politică, nu două — altfel
-- Postgres le evaluează pe amândouă la fiecare citire.
-- `(select auth.uid())` se evaluează o dată pe query, nu o dată pe rând.
create policy "vede staff" on staff
  for select to authenticated using (user_id = (select auth.uid()) or is_admin());

-- ---------------------------------------------------------------------
-- OCUPAREA, pentru cameristă: ce cameră e prinsă în ce zile, și atât.
--
-- DE CE O VEDERE, ȘI NU O POLITICĂ. RLS filtrează RÂNDURI, nu coloane, iar
-- tot personalul folosește același rol Postgres (`authenticated`), deci nici
-- GRANT pe coloane nu poate separa camerista de recepție — un grant s-ar
-- aplica la amândouă. Singurul mecanism care poate e o relație care nu are
-- coloanele interzise.
--
-- Deliberat FĂRĂ `security_invoker`: vederea TREBUIE să treacă peste RLS-ul
-- tabelului de dedesubt, care de acum e doar pentru admin/recepție — ăsta e
-- chiar rostul ei, nu o scăpare. Linterul Supabase o marchează
-- `security_definer_view` (ERROR); e semnalul lui obișnuit pentru tiparul
-- ăsta, nu un bug de reparat. Ce o ține închisă:
--   · `where staff_role() is not null` — cine nu e în `staff` primește zero
--     rânduri, chiar dacă i-ar ajunge grantul cumva;
--   · `revoke all from public, anon` — vizitatorii n-o văd deloc;
--   · `security_barrier` — oprește trecerea funcțiilor de filtrare ale
--     apelantului sub proiecție, adică drumul prin care un
--     `where scump(...)` ar fi putut adulmeca tocmai coloanele lipsă.
create view rezervari_ocupare
with (security_barrier = true) as
select r.id,
       r.room_id,
       r.checkin,
       r.checkout,
       r.status,
       r.source,
       -- Motivul unui blocaj („Reparație instalație") se vede pe calendar și
       -- la cameristă — e informație de treabă. `notes` de pe o rezervare
       -- adevărată nu: acolo scrie despre oaspete.
       case when r.source = 'blocaj' then r.notes end as notes
from reservations r
where staff_role() is not null;

revoke all on rezervari_ocupare from public, anon;
grant select on rezervari_ocupare to authenticated;


-- ---------------------------------------------------------------------
-- SCRIERE — separată pe rol.
--
-- Înainte, o singură politică `for all using(true)` per tabel însemna că
-- orice cont autentificat, inclusiv unul de cameristă, putea șterge orice
-- rezervare sau schimba tarifele printr-un request direct către API.
-- Sistemul de roluri exista doar în interfață (VIEW_ROLES din
-- pms-app.jsx), unde nu impune nimic.
--
-- Împărțirea de mai jos oglindește exact acel model din interfață, ca să
-- nu existe două definiții diferite ale acelorași drepturi:
--   · rezervări / oaspeți / grupuri → admin sau recepționer
--   · camere / tarife / sezoane     → doar admin ("Camere și tarife")
--   · app_state                     → admin peste tot; recepționerul peste
--     tot în afară de `pms:access:v1`; cameristele doar pe două chei:
--     statusul de curățenie (updateHousekeeping) și `pms:log:v3`, cheia
--     moartă a jurnalului — grantul rămâne doar pentru filele deschise cu
--     bundle-ul vechi, care încă scriu acolo (vezi `activity_log`).
-- ---------------------------------------------------------------------
create policy "scrie rezervari" on reservations
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica rezervari" on reservations
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
create policy "sterge rezervari" on reservations
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

create policy "scrie oaspeti" on guests
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica oaspeti" on guests
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
-- Ștergerea oaspeților e doar a adminului — recepția editează și adaugă,
-- nu curăță fișe (cerut explicit pe 21 august 2026). Scrierea și
-- modificarea rămân la fel pentru recepționer.
create policy "sterge oaspeti" on guests
  for delete to authenticated using (is_admin());

create policy "scrie grupuri" on res_groups
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica grupuri" on res_groups
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
-- Același rationament ca la oaspeți: doar adminul șterge un grup (și,
-- prin cascadă, rezervările lui).
create policy "sterge grupuri" on res_groups
  for delete to authenticated using (is_admin());

create policy "scrie camere" on rooms
  for insert to authenticated with check (is_admin());
create policy "modifica camere" on rooms
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge camere" on rooms
  for delete to authenticated using (is_admin());

create policy "scrie tarife" on rates
  for insert to authenticated with check (is_admin());
create policy "modifica tarife" on rates
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge tarife" on rates
  for delete to authenticated using (is_admin());

create policy "scrie sezoane" on seasons
  for insert to authenticated with check (is_admin());
create policy "modifica sezoane" on seasons
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge sezoane" on seasons
  for delete to authenticated using (is_admin());

-- `pms:access:v1` ține setările yalelor: `codeLength` (câte cifre are codul
-- de ușă) și `graceMinutes` (cât mai merge ușa după ora plecării). Până pe
-- 9 septembrie 2026 orice recepționer le putea rescrie printr-o cerere
-- directă către API — `codeLength` pus pe 1 face codul de ușă ghicibil din
-- a zecea încercare. Cheia nu e scrisă din interfață de nimeni, doar citită
-- (features/acces.jsx și cele două funcții edge), deci restricția nu taie
-- niciun flux de lucru.
create policy "scrie app_state" on app_state
  for insert to authenticated with check (
    is_admin()
    or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );
create policy "modifica app_state" on app_state
  for update to authenticated using (
    is_admin()
    or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  ) with check (
    is_admin()
    or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );
create policy "sterge app_state" on app_state
  for delete to authenticated using (
    is_admin() or (staff_role() = 'receptionist' and key <> 'pms:access:v1')
  );

-- Administrarea conturilor (ecranul "Useri si drepturi") e strict a
-- adminilor. Citirea e acoperita de politica "vede staff" de mai sus.
create policy "admin scrie staff" on staff
  for insert to authenticated with check (is_admin());
create policy "admin modifica staff" on staff
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin sterge staff" on staff
  for delete to authenticated using (is_admin());


-- ---------------------------------------------------------------------
-- RLS FACTURARE — restrans pe permisiuni granulare (has_billing_permission,
-- definita mai sus), nu doar pe rol. Fara politica de delete pe invoices
-- => stergerea fizica a unei facturi e imposibila prin RLS, indiferent
-- de status; draft-urile se sterg logic din UI (nu au numar alocat inca,
-- dar randul ramane fizic — simplu si suficient, nu creeaza confuzie de
-- audit fiindca un draft nu a fost niciodata "emis").
-- ---------------------------------------------------------------------
alter table billing_customers      enable row level security;
alter table vat_rates              enable row level security;
alter table products               enable row level security;
alter table payment_methods        enable row level security;
alter table folios                 enable row level security;
alter table folio_items            enable row level security;
alter table invoice_series         enable row level security;
alter table invoices               enable row level security;
alter table invoice_items          enable row level security;
alter table invoice_item_links     enable row level security;
alter table payments               enable row level security;
alter table receipt_series         enable row level security;
alter table accounting_exports     enable row level security;
alter table accounting_export_items enable row level security;
alter table billing_permissions    enable row level security;

-- Client de facturare, nomenclator, TVA, folio: oricine cu acces la
-- facturi poate citi/scrie — nu sunt poziții sensibile separat.
create policy "citeste clienti facturare" on billing_customers for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie clienti facturare" on billing_customers for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica clienti facturare" on billing_customers for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
-- Ștergerea NU e legată de permisiunea de facturare — altfel orice
-- recepționer cu drept de facturare (implicit, de la 21 august 2026, vezi
-- trigger-ul de mai jos) ar putea șterge firme la fel de liber ca un
-- admin. E aceeași regulă ca la oaspeți și grupuri: doar adminul șterge.
create policy "sterge clienti facturare" on billing_customers for delete to authenticated
  using (is_admin());

create policy "citeste tva" on vat_rates for select to authenticated using (true);
create policy "scrie tva" on vat_rates for insert to authenticated with check (is_admin());
create policy "modifica tva" on vat_rates for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge tva" on vat_rates for delete to authenticated using (is_admin());

create policy "citeste produse" on products for select to authenticated using (true);
create policy "scrie produse" on products for insert to authenticated with check (is_admin());
create policy "modifica produse" on products for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge produse" on products for delete to authenticated using (is_admin());

create policy "citeste metode plata" on payment_methods for select to authenticated using (true);
create policy "scrie metode plata" on payment_methods for insert to authenticated with check (is_admin());
create policy "modifica metode plata" on payment_methods for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge metode plata" on payment_methods for delete to authenticated using (is_admin());

create policy "citeste folio" on folios for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie folio" on folios for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica folio" on folios for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
-- Neatinsa din UI azi (nicio ștergere de folio în cod) — is_admin() în loc
-- de has_billing_permission, ca să nu se lărgească odată cu recepționerii
-- care primesc acum implicit create_invoice (vezi trigger-ul de mai sus).
create policy "sterge folio" on folios for delete to authenticated
  using (is_admin());

create policy "citeste folio_items" on folio_items for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie folio_items" on folio_items for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica folio_items" on folio_items for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
-- "Niciodată nu se șterge fizic o poziție odată legată de o factură" (vezi
-- comentariul de la tabelul folio_items) era impusă doar în interfață
-- (facturare.jsx blochează butonul când invoiced_status = 'invoiced'),
-- deși un comentariu din folio.js pretindea că RLS e plasa de siguranță —
-- nu era. invoice_item_links are FK on delete restrict spre folio_items,
-- deci o poziție încă legată tot nu se putea șterge fizic — dar ștergerea
-- LEGĂTURII întâi (altă politică, mai jos) ar fi ocolit și asta. Adăugăm
-- garda direct aici, ca RLS să chiar facă ce pretinde comentariul.
create policy "sterge folio_items" on folio_items for delete to authenticated
  using (has_billing_permission('create_invoice') and invoiced_status <> 'invoiced');

create policy "citeste serii" on invoice_series for select to authenticated using (true);
create policy "scrie serii" on invoice_series for insert to authenticated with check (is_admin());
create policy "modifica serii" on invoice_series for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge serii" on invoice_series for delete to authenticated using (is_admin());

-- Facturi: draft se creeaza/edita cu create_invoice; tranzitia de status
-- (emitere/anulare/stornare) cere permisiunea specifica actiunii —
-- verificata si in cod (JS), dar impusa aici indiferent de UI.
create policy "citeste facturi" on invoices for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "creeaza draft factura" on invoices for insert to authenticated
  with check (has_billing_permission('create_invoice') and status = 'draft');
-- O nota de credit NU e un draft care se emite ulterior: se naste direct
-- 'issued', fiindca e documentul care anuleaza altul. Fara politica asta,
-- politica de mai sus (care cere status = 'draft') respingea fiecare
-- stornare cu "Nu ai dreptul sa faci aceasta modificare" — defect
-- descoperit abia pe 21 august 2026, ascuns sub un al doilea care oprea
-- fluxul mai devreme (seria ceruta, "LIV", nu exista).
-- Deliberat ingusta: doar randuri care chiar SUNT note de credit
-- (credit_note_of not null), deci nu poate fi folosita ca sa se strecoare o
-- factura obisnuita direct in 'issued', ocolind fluxul draft -> emitere.
create policy "creeaza nota de credit" on invoices for insert to authenticated
  with check (
    has_billing_permission('create_credit_note')
    and credit_note_of is not null
    and status = 'issued'
  );
create policy "modifica factura" on invoices for update to authenticated
  using (
    (status = 'draft' and has_billing_permission('create_invoice'))
    or has_billing_permission('issue_invoice')
    or has_billing_permission('cancel_invoice')
    or has_billing_permission('create_credit_note')
    or has_billing_permission('record_payment')
  );
-- Fara policy "for delete" => nicio factura, nici draft, nu poate fi
-- stearsa fizic prin API; UI-ul ascunde/marcheaza draft-urile abandonate.

create policy "citeste linii factura" on invoice_items for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie linii factura" on invoice_items for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica linii factura" on invoice_items for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
-- Ca la "sterge folio": neatinsă din UI azi (nicio ștergere de linie de
-- factură în cod, doar update pe liniile de draft) — is_admin() în loc de
-- has_billing_permission, acum că orice recepționer are implicit
-- create_invoice.
create policy "sterge linii factura" on invoice_items for delete to authenticated
  using (is_admin());

create policy "citeste linkuri factura" on invoice_item_links for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie linkuri factura" on invoice_item_links for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica linkuri factura" on invoice_item_links for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
-- Ca mai sus: neatinsă din UI azi (legăturile se doar inserează, niciodată
-- șterse din cod). is_admin() închide și ocolul "șterge legătura, apoi
-- poziția de folio devine liberă" pe care garda de invoiced_status de la
-- "sterge folio_items" singură n-ar fi acoperit-o.
create policy "sterge linkuri factura" on invoice_item_links for delete to authenticated
  using (is_admin());

create policy "citeste plati" on payments for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie plati" on payments for insert to authenticated
  with check (has_billing_permission('record_payment'));
create policy "modifica plati" on payments for update to authenticated
  using (has_billing_permission('record_payment')) with check (has_billing_permission('record_payment'));
create policy "sterge plati" on payments for delete to authenticated
  using (has_billing_permission('record_payment'));

create policy "citeste serie chitante" on receipt_series for select to authenticated using (true);
create policy "scrie serie chitante" on receipt_series for insert to authenticated with check (is_admin());
create policy "modifica serie chitante" on receipt_series for update to authenticated using (is_admin()) with check (is_admin());
create policy "sterge serie chitante" on receipt_series for delete to authenticated using (is_admin());

create policy "citeste exporturi" on accounting_exports for select to authenticated
  using (has_billing_permission('export_accounting'));
create policy "scrie exporturi" on accounting_exports for insert to authenticated
  with check (has_billing_permission('export_accounting'));
create policy "modifica exporturi" on accounting_exports for update to authenticated
  using (has_billing_permission('export_accounting')) with check (has_billing_permission('export_accounting'));
create policy "sterge exporturi" on accounting_exports for delete to authenticated
  using (has_billing_permission('export_accounting'));

create policy "citeste exporturi items" on accounting_export_items for select to authenticated
  using (has_billing_permission('export_accounting'));
create policy "scrie exporturi items" on accounting_export_items for insert to authenticated
  with check (
    has_billing_permission('export_accounting') and (
      not is_reexport or has_billing_permission('reexport_accounting')
    )
  );

-- Doar adminii gestioneaza matricea de permisiuni — altfel un
-- receptioner cu create_invoice si-ar putea auto-acorda cancel_invoice.
create policy "citeste permisiuni facturare" on billing_permissions for select to authenticated
  using (is_admin() or user_id = (select auth.uid()));
create policy "scrie permisiuni facturare" on billing_permissions for insert to authenticated
  with check (is_admin());
create policy "modifica permisiuni facturare" on billing_permissions for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "sterge permisiuni facturare" on billing_permissions for delete to authenticated
  using (is_admin());


-- SUPRAFAȚA PUBLICĂ — exact cinci funcții, nimic altceva.
--
-- Site-ul public de rezervări nu are acces la niciun tabel: tot ce poate
-- face trece prin funcțiile de mai jos, fiecare `security definer` și
-- fiecare cu propriile validări și limite.
grant execute on function public_availability(timestamptz, timestamptz, int, int) to anon;
grant execute on function public_capacity() to anon, authenticated, service_role;
-- Crearea rezervarii NU e apelabila cu cheia publica.
--
-- Singurul apelant e functia edge booking-create, care verifica jetonul
-- Turnstile inainte sa scrie ceva. Cat timp anon putea apela direct,
-- verificarea era o sugestie, nu o restrictie: cheia publica apare in
-- fiecare filă deschisa pe site, deci oricine putea sari peste poarta.
--
-- Revocarea de la PUBLIC, nu doar de la anon: in PostgreSQL orice functie
-- noua primeste EXECUTE pentru PUBLIC, iar rolurile mostenesc de acolo.
-- Verificat pe viu — dupa un `revoke ... from anon`, un apel direct cu
-- cheia publica a creat in continuare o rezervare.
revoke execute on function create_public_booking(uuid, timestamptz, timestamptz, text, text,
  text, text, text, text, text, jsonb, text, int, text) from public, anon, authenticated;
grant execute on function create_public_booking(uuid, timestamptz, timestamptz, text, text,
  text, text, text, text, text, jsonb, text, int, text) to service_role;

-- Celelalte raman deschise: cautarea nu scrie nimic, iar confirmarea si
-- anularea cer un token de 128 de biti, care nu se poate ghici.
grant execute on function public_booking_by_token(text) to anon;
grant execute on function cancel_public_booking(text) to anon;
grant execute on function confirm_public_booking(text) to anon, authenticated, service_role;

-- CE A FOST SCOS DIN SUPRAFAȚA PUBLICĂ, și de ce.
--
-- `available_rooms` arată exact ce cameră e ocupată în ce zile — harta
-- ocupării pensiunii, servită oricui o cere. Site-ul folosește
-- `public_availability`, care întoarce variante de cazare, nu harta;
-- căutare în ambele proiecte (PMS și site): zero apeluri către ea.
revoke execute on function available_rooms(timestamptz, timestamptz, int) from anon;

-- `expira_rezervari_neconfirmate` SCRIE. E chemată dinăuntru de
-- `create_public_booking` și de `confirm_public_booking`, amândouă
-- `security definer` — deci rulează ca proprietar, iar revocarea nu atinge
-- drumul real al rezervărilor.
--
-- Revocarea e de la PUBLIC, nu doar de la `anon`: prima încercare a tăiat
-- doar de la anon, iar verificarea de după a arătat că tot putea executa —
-- orice funcție nouă primește EXECUTE pentru PUBLIC și rolurile moștenesc
-- de acolo. (`available_rooms` a mers din prima fiindcă avea un grant
-- explicit către anon, nu unul moștenit.)
revoke execute on function expira_rezervari_neconfirmate() from public, anon, authenticated;
grant  execute on function expira_rezervari_neconfirmate() to service_role;

-- `acorda_permisiuni_facturare_implicite` rămâne DELIBERAT deschisă.
--
-- E funcția unui trigger pe `staff`. Revocarea ar fi fost pură curățenie:
-- Postgres refuză oricum apelul direct al unei funcții de trigger. Dar exact
-- zona asta a produs deja o pană de 12 ore aici — migrația
-- `guest_app_revoca_functia_de_trigger` a tăiat EXECUTE pe o funcție chemată
-- dintr-un trigger și fiecare creare de rezervare a început să cadă cu
-- 42501. Regula spune că pentru funcția de trigger dreptul se verifică la
-- CREATE TRIGGER, nu la fiecare declanșare; am mai crezut o regulă despre
-- triggere în proiectul ăsta și m-a costat o zi de producție.
--
-- Beneficiu zero, risc cunoscut: se lasă în pace.

-- Datele pentru email conțin adresa clientului: doar service_role, adică
-- doar funcția edge care trimite mesajul.
revoke execute on function booking_email_payload(text)    from public, anon, authenticated;
revoke execute on function mark_booking_email_sent(text)  from public, anon, authenticated;
grant  execute on function booking_email_payload(text)    to service_role;
grant  execute on function mark_booking_email_sent(text)  to service_role;

-- create_booking (o singură cameră) NU mai e apelabilă public: e complet
-- acoperită de create_public_booking, iar două drumuri publice de creare
-- înseamnă două locuri în care se poate strecura o regulă diferită.
--
-- ATENȚIE la revocare: nu e suficient `from anon`. Postgres acordă
-- implicit EXECUTE către PUBLIC, iar rolul îl moștenește pe acolo —
-- prima încercare de revocare aici n-a avut niciun efect din acest motiv.
revoke execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) from public, anon;
grant execute on function create_booking(text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, int, int, text) to authenticated, service_role;

-- Restul funcțiilor NU sunt expuse public.
--
-- ATENȚIE la felul în care se revocă: Postgres acordă implicit EXECUTE
-- către PUBLIC pentru orice funcție nouă, iar Supabase mai adaugă și un
-- grant nominal către `anon`. Un simplu `revoke ... from anon` nu are
-- niciun efect cât timp grantul către PUBLIC rămâne — rolul îl
-- moștenește pe acolo. Trebuie revocate amândouă, apoi acordat explicit
-- rolurilor care chiar au nevoie.
--
-- Versiunea anterioară a acestui fișier revoca doar de la `anon`, deci
-- comentariul de aici („nu e expus public") descria o intenție care nu
-- era de fapt aplicată. Descoperit de testele din tests/integration.
revoke execute on function allocate_group(timestamptz, timestamptz, int, int, text) from public, anon;
revoke execute on function public_capacity() from public;
revoke execute on function online_adjustment_for_occupancy(numeric) from public, anon;
revoke execute on function online_night_adjustment_pct(date, text) from public, anon;
revoke execute on function stay_total(text, timestamptz, timestamptz, int, int, boolean, text) from public, anon;
revoke execute on function nightly_rate(text, date, int, int)                             from public, anon;
revoke execute on function occupancy_for_stay(timestamptz, timestamptz, text)             from public, anon;
revoke execute on function is_admin()                                 from public, anon;
revoke execute on function has_billing_permission(text)               from public, anon;
revoke execute on function staff_role()                               from public, anon;
revoke execute on function next_invoice_number(text)                  from public, anon;
revoke execute on function next_receipt_number(text)                  from public, anon;

grant execute on function allocate_group(timestamptz, timestamptz, int, int, text) to authenticated, service_role;
grant execute on function online_adjustment_for_occupancy(numeric) to authenticated, service_role;
grant execute on function online_night_adjustment_pct(date, text) to authenticated, service_role;
grant execute on function stay_total(text, timestamptz, timestamptz, int, int, boolean, text) to authenticated, service_role;
grant execute on function nightly_rate(text, date, int, int)                             to authenticated, service_role;
grant execute on function occupancy_for_stay(timestamptz, timestamptz, text)             to authenticated, service_role;
grant execute on function is_admin()                                 to authenticated, service_role;
grant execute on function has_billing_permission(text)               to authenticated, service_role;
grant execute on function staff_role()                               to authenticated, service_role;
grant execute on function next_invoice_number(text)                  to authenticated, service_role;
grant execute on function next_receipt_number(text)                  to authenticated, service_role;

-- Implicit, Supabase acordă rolului `anon` drepturi complete de tabel
-- (INSERT/SELECT/UPDATE/DELETE) pe tot ce se creează în `public`. Azi
-- asta nu se vede, fiindcă nicio politică RLS nu menționează `anon`, deci
-- orice cerere anonimă e refuzată oricum. Problema e că RLS rămâne
-- singurul strat: o singură politică viitoare scrisă din greșeală ca
-- `using (true)` pentru anon ar deschide instant tot tabelul, fără nimic
-- dedesubt care să prindă greșeala.
--
-- Revocarea de mai jos adaugă al doilea strat. Nu schimbă nimic pentru
-- fluxurile publice: `available_rooms` și `create_booking` se apelează
-- prin `grant execute`, iar a doua e `security definer` (scrie cu
-- drepturile proprietarului funcției, nu ale rolului anon).
revoke all on all tables in schema public from anon;

-- Fără liniile astea, orice tabel adăugat de o migrare viitoare ar primi
-- din nou grantul complet și problema ar reveni tăcut.
alter default privileges for role postgres      in schema public revoke all on tables from anon;
alter default privileges for role supabase_admin in schema public revoke all on tables from anon;

-- staff_role() servește exclusiv politicile de mai sus, pentru utilizatori
-- autentificați — un vizitator anonim nu are ce face cu ea.
revoke execute on function staff_role() from anon;


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
insert into rooms (id, name, type, capacity, sort_order)
select r->>'id', r->>'name', r->>'type',
       coalesce((r->>'capacity')::int, 2), ord
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

-- Jurnalul de activitate (rulat pe 9 septembrie 2026). `activity_log` e
-- definit mai jos în fișier — blocul ăsta oricum se rulează abia după ce
-- schema întreagă există.
--
-- Trigger-ul de semnătură se oprește cât ține mutarea: el pune ora și omul
-- CURENT, iar aici tocmai istoricul trebuie păstrat așa cum a fost.
-- `user_id` se recuperează după nume, singurul lucru pe care blobul îl
-- ținea despre autor.
alter table activity_log disable trigger activity_log_semnatura;

insert into activity_log (at, user_id, user_name, user_role, action, detail)
select (e->>'ts')::timestamptz, s.user_id,
       coalesce(nullif(e->>'userName',''), '?'),
       coalesce(nullif(e->>'userRole',''), '?'),
       left(e->>'action', 200), left(e->>'detail', 1000)
from app_state a,
     jsonb_array_elements(a.value) e
     left join staff s on s.name = e->>'userName'
where a.key = 'pms:log:v3' and e->>'action' is not null
order by (e->>'ts')::timestamptz asc;

alter table activity_log enable trigger activity_log_semnatura;

*/


-- ====================================================================
-- ACCES ELECTRONIC LA CAMERE (yale inteligente)
-- ====================================================================
--
-- Neutru față de furnizor: coloana `provider` există de la început, ca
-- adăugarea altui sistem de yale să fie un modul nou, nu o migrare.
-- Primul furnizor implementat e TTLock (Open Platform, regiunea EU).
--
-- De ce prin Edge Function și nu direct din browser: autentificarea
-- TTLock cere client_id + client_secret + userul și PAROLA contului care
-- administrează toate yalele. Acelea nu au ce căuta într-un bundle
-- descărcat de oricine. Interfața cere „generează cod", funcția edge
-- vorbește cu TTLock.

-- Asocierea cameră → yală. Nu se hardcodează nicăieri în cod.
alter table rooms add column access_provider  text;
alter table rooms add column access_lock_id   text;
alter table rooms add column access_lock_name text;


-- Codurile de acces.
--
-- Un rând de rezervare are deja exact o cameră, deci „câte un cod per
-- cameră" iese natural: codul se leagă de rezervare. O rezervare de grup
-- primește câte un cod pentru fiecare rezervare din grup.
create table access_codes (
  id              text primary key,
  reservation_id  text not null references reservations(id) on delete cascade,
  room_id         text not null references rooms(id),
  provider        text not null default 'ttlock',
  lock_id         text not null,
  code            text not null,
  -- Identificatorul codului la furnizor (keyboardPwdId la TTLock). Fără el
  -- codul nu poate fi șters sau modificat mai târziu — de aceea generarea
  -- se face cu keyboardPwd/add, care îl întoarce, nu cu keyboardPwd/get.
  external_id     text,
  valid_from      timestamptz not null,
  valid_until     timestamptz not null,
  -- active     — codul curent, singurul valabil
  -- superseded — înlocuit de altul (perioadă schimbată, cameră schimbată)
  -- revoked    — anulat la furnizor
  -- failed     — generarea a eșuat; păstrat ca să se vadă de ce
  status          text not null default 'active'
                  check (status in ('active','superseded','revoked','failed')),
  generated_at    timestamptz not null default now(),
  generated_by    text,
  revoked_at      timestamptz,
  error_message   text,
  created_at      timestamptz not null default now()
);

-- Un singur cod ACTIV per rezervare. Așa cerința „nu genera un cod nou la
-- fiecare deschidere a rezervării" e impusă de bază, nu de disciplina
-- interfeței: a doua inserare activă cade, oricâte tab-uri ar fi deschise.
create unique index access_codes_activ_unic
  on access_codes (reservation_id) where status = 'active';

create index access_codes_rezervare on access_codes (reservation_id);
create index access_codes_camera    on access_codes (room_id);


-- Trimiterile către oaspete, cu status și motivul eșecului.
create table access_notifications (
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

create index access_notifications_cod on access_notifications (access_code_id);


-- ---------------------------------------------------------------------
-- JURNALUL DE ACTIVITATE — doar cu adăugare.
--
-- A stat până pe 9 septembrie 2026 într-un blob JSON din `app_state`, cheia
-- `pms:log:v3`: fiecare intrare nouă rescria tot vectorul. Cine putea
-- adăuga o linie putea, cu aceeași cerere, să trimită `[]` și să șteargă
-- tot — inclusiv camerista, care avea grant explicit pe cheia aia. Iar
-- `userName` și `userRole` plecau din browser, deci o acțiune putea fi
-- semnată cu numele altcuiva. Un jurnal pe care îl poate rescrie chiar cel
-- despre care scrie nu e jurnal.
--
-- Aici INSERT are politică, UPDATE și DELETE n-au niciuna — deci pentru
-- `authenticated` rândul e definitiv odată scris. Ștergerea rămâne posibilă
-- doar din SQL, cu `service_role`.
--
-- Verificat pe producție, ca atac, nu ca presupunere: cu JWT-ul
-- recepționerului, un insert care cerea „Ovidiu / admin / 2020-01-01" s-a
-- scris „Razvan / receptionist / azi"; UPDATE și DELETE au atins 0 rânduri.
--
-- Blobul vechi a fost mutat aici întreg (400 de intrări, 21 aug — 8 sep
-- 2026); plafonul lui tăiase deja definitiv tot ce era mai vechi. Tabelul
-- nu mai are plafon, doar ecranul cere ultimele 400.
create table activity_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  user_id   uuid references auth.users(id) on delete set null,
  -- Numele și rolul se păstrează ca text, nu doar prin `user_id`: jurnalul
  -- trebuie să spună cine a făcut acțiunea ATUNCI, chiar dacă între timp
  -- omul a fost șters din `staff` sau i s-a schimbat rolul.
  user_name text not null default '?',
  user_role text not null default '?',
  action    text not null check (length(action) <= 200),
  detail    text check (length(detail) <= 1000)
);

create index activity_log_moment on activity_log (at desc);

-- Semnătura nu vine din browser, se pune aici. Clientul trimite doar
-- `action` și `detail`; restul coloanelor sunt rescrise, orice ar fi
-- trimis. `security definer` fiindcă citește `staff`, pe care camerista
-- oricum n-o poate citi singură.
create or replace function activity_log_semneaza()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  new.at      := now();
  new.user_id := auth.uid();
  select s.name, s.role into new.user_name, new.user_role
    from staff s where s.user_id = auth.uid();
  new.user_name := coalesce(new.user_name, '?');
  new.user_role := coalesce(new.user_role, '?');
  return new;
end $$;

create trigger activity_log_semnatura
  before insert on activity_log
  for each row execute function activity_log_semneaza();

-- Postgres verifică dreptul de EXECUTE la CREATE TRIGGER, nu la fiecare
-- declanșare, deci revocarea nu oprește trigger-ul (verificat). Ce oprește e
-- expunerea lui ca `/rest/v1/rpc/activity_log_semneaza`, endpoint care n-are
-- ce căuta în API.
revoke execute on function activity_log_semneaza() from public, anon, authenticated;

alter table activity_log enable row level security;

-- Citirea e a adminului și a recepției, ca ecranul „Jurnal" (VIEW_ROLES în
-- pms-app.jsx).
create policy "citeste jurnal" on activity_log
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

-- Scrie oricine e în `staff`, camerista inclusiv: schimbarea unui status de
-- curățenie trebuie să apară în jurnal, altfel tocmai acțiunile făcute fără
-- martori ar lipsi din el. Un cont autentificat care nu e în `staff` nu
-- scrie nimic.
create policy "scrie jurnal" on activity_log
  for insert to authenticated with check (staff_role() is not null);

-- Fără politici de update/delete. Asta e tot mecanismul.


-- Audit propriu pentru yale, separat de jurnalul de mai sus.
--
-- Jurnalul aplicației răspunde la „cine a schimbat prețul"; ăsta la „cine a
-- deschis ușa aia". Se caută după rezervare și după yală, are câmpuri
-- proprii (provider, lock_id, external_ref) și e scris exclusiv din
-- funcțiile edge, nu din browser.
create table access_audit (
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

create index access_audit_rezervare on access_audit (reservation_id, at desc);
create index access_audit_moment    on access_audit (at desc);


-- RLS: codul deschide o ușă, deci nu îl vede oricine.
alter table access_codes         enable row level security;
alter table access_notifications enable row level security;
alter table access_audit         enable row level security;

-- Citire: admin și recepție. Housekeeping NU — n-are nevoie de codurile
-- oaspeților ca să facă curat.
create policy "citeste coduri acces" on access_codes
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste trimiteri acces" on access_notifications
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste audit acces" on access_audit
  for select to authenticated using (is_admin());

-- Scrierea se face DOAR din Edge Function (service_role): nicio politică de
-- insert/update pentru `authenticated`. Altfel un cod ar putea fi inventat
-- din browser, fără ca yala să știe de el.


-- =====================================================================
-- GUEST APP — codul de sejur si poarta de acces
-- =====================================================================
-- Pagina proprie fiecarei cazari, deschisa de oaspete dintr-un link, activa
-- doar pe durata sejurului. Plan complet: docs/guest-app.md.
--
-- Adresa are forma guest.lalivada.ro/#Q7moVrzk — opt caractere.
--
-- A avut cinci, cerute asa, iar alegerea aceea muta securitatea din lungimea
-- codului in limitarea de rata. Socoteala scrisa aici arata ca merge:
--
--   62^5              = 916.132.832 de coduri
--   valabile deodata  = cate sejururi sunt in curs (~18)
--   ghiciri pt. 50%   = ~40 de milioane
--   la 200 pe ora     = 22 de ani
--
-- Numai ca 200 nu era numarul din cod. `guest_poarta` avea PLAFON_GLOBAL la
-- 5000, de 25 de ori mai larg, unsprezece randuri mai jos: 40 de milioane la
-- 5000 pe ora inseamna 8.000 de ore, adica 11 luni. Argumentul si codul au
-- stat unul langa altul si spuneau numere diferite, iar la capatul linkului
-- e o usa. De aici toata schimbarea — 8 septembrie 2026.
--
-- Cu opt caractere intrebarea nu se mai pune:
--
--   62^8              = 218.340.105.584.896 de coduri
--   ghiciri pt. 50%   = ~8,4 x 10^12
--   la 5000 pe ora    = ~192.000 de ani
--
-- Si, mai important decat cifra: plafonul global nu mai are ce apara. El era
-- singurul mod in care cineva putea inchide usa TUTUROR oaspetilor deodata —
-- se ardeau 5000 de esecuri pe ora si toata lumea primea 'prea-multe'. Acum
-- se aplica doar codurilor de 5, cate mai sunt.
--
-- TRECEREA. Cele 134 de coduri ale rezervarilor necazate au fost regenerate
-- pe loc; linkul pleaca odata cu codul de acces, adica la check-in, deci
-- niciunul nu era inca in mana cuiva. Cele cazate in acel moment au ramas cu
-- codul vechi, ca sa nu li se rupa linkul din telefon.
--
-- DUPA ultimul checkout cu cod de 5 (13 septembrie 2026): regexul din
-- `guest_poarta` devine {8} si tot blocul PLAFON_GLOBAL se sterge.

create or replace function guest_code_nou()
returns text language plpgsql volatile
set search_path = public as $$
declare
  ALFABET constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  -- Constanta, nu cifra scrisa in bucla: lungimea e chiar numarul din
  -- socoteala de mai sus, si trebuie sa se vada ca atare.
  LUNGIME constant int := 8;
  v_cod   text;
  v_octet int;
begin
  loop
    v_cod := '';
    while length(v_cod) < LUNGIME loop
      -- gen_random_bytes, nu random(): random() e previzibil daca ii afli
      -- starea, iar un cod ghicibil din context ar anula toata socoteala
      -- de mai sus — acolo se presupune ca singura cale e ghicirea oarba.
      --
      -- Calificat cu `extensions.`, fiindca acolo sta pgcrypto in Supabase,
      -- iar functia isi fixeaza search_path la public. Defaulturile din
      -- fisierul asta il gasesc fara calificare doar fiindca ele se
      -- evalueaza cu search_path-ul sesiunii.
      v_octet := get_byte(extensions.gen_random_bytes(1), 0);
      -- Respingere, nu modulo pe tot intervalul: 256 nu se imparte la 62,
      -- deci un `% 62` aplicat oricarui octet ar face primele 8 litere ale
      -- alfabetului mai probabile decat restul. Aruncam octetii de la 248
      -- in sus (4 x 62 = 248) si pastram distributia uniforma. Verificat pe
      -- 4000 de coduri: chi-patrat 49,7 la un prag de 1% de ~89.
      if v_octet < 248 then
        v_cod := v_cod || substr(ALFABET, 1 + (v_octet % 62), 1);
      end if;
    end loop;
    -- Coliziunile sunt rare la 916 milioane, dar nu imposibile; se reia.
    exit when not exists (select 1 from reservations where guest_code = v_cod);
  end loop;
  return v_cod;
end $$;

create unique index reservations_guest_code on reservations (guest_code);

-- Rezervarile noi isi primesc codul singure. Trigger, nu `default`: un
-- insert care trimite explicit null ar ocoli un default, nu si triggerul.
--
-- SECURITY DEFINER, SI NU E OPTIONAL. `guest_code_nou` e revocata de la
-- `authenticated` (mai jos), fiindca n-are ce cauta in API. Dar triggerul
-- asta o cheama, iar fara `security definer` apelul ruleaza cu drepturile
-- celui care insereaza — adica ale receptionerului logat in PMS. Efectul,
-- vazut in productie pe 6 septembrie 2026: ORICE creare de rezervare din
-- aplicatie pica cu 42501, „permission denied for function
-- guest_code_nou", afisat drept „Nu ai dreptul sa faci aceasta
-- modificare".
--
-- Capcana e ca Postgres verifica EXECUTE pe functia de trigger doar la
-- CREATE TRIGGER, nu la fiecare declansare — deci triggerul pornea, si
-- abia apelul dinauntru era refuzat. Verificarile facute cu cheia de
-- serviciu nu prind asta niciodata: ea ocoleste tot.
--
-- `set search_path` nu mai e igiena, ci obligatoriu: intr-o functie
-- definer, un search_path venit de la client ar putea indrepta apelul
-- catre alta functie cu acelasi nume.
create or replace function pune_guest_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.guest_code is null then
    new.guest_code := guest_code_nou();
  end if;
  return new;
end $$;
create trigger reservations_pune_guest_code
  before insert on reservations
  for each row execute function pune_guest_code();

-- Contorul de cautari esuate. RLS activat fara nicio politica: nimeni nu
-- ajunge la el prin API — se scrie doar din guest_poarta, care fiind
-- security definer ocoleste RLS pentru propriile query-uri. Acelasi tipar
-- ca booking_attempts.
create table guest_code_attempts (
  id         bigint generated always as identity primary key,
  -- Codul incercat, retinut pentru analiza: o insiruire de coduri apropiate
  -- arata enumerare, nu greseli de tastare.
  cod        text,
  ip         text,
  created_at timestamptz not null default now()
);
create index guest_code_attempts_created on guest_code_attempts (created_at desc);
create index guest_code_attempts_ip      on guest_code_attempts (ip, created_at desc);
alter table guest_code_attempts enable row level security;

-- Poarta: intoarce rezervarea SI motivul, in loc sa arunce exceptie.
--
-- Nu e preferinta de stil, e necesitate. O exceptie face rollback la toata
-- tranzactia, deci ar sterge chiar randul de contorizare tocmai scris —
-- plafonul n-ar mai numara niciodata nimic si ar sta degeaba pe usa
-- deschisa. In create_public_booking rollback-ul e DORIT, fiindca acolo se
-- numara reusitele; aici se numara esecurile, deci regula se inverseaza.
create or replace function guest_poarta(
  p_cod text,
  out rezervare reservations,
  out motiv text)
language plpgsql volatile security definer
set search_path = public as $$
declare
  -- Plafonul global se aplica DOAR codurilor de 5 caractere. Vezi blocul de
  -- deasupra lui `guest_code_nou`: la 8 caractere n-are ce apara, iar singurul
  -- lucru pe care il facea in plus era sa-i dea unui atacator butonul de
  -- inchis usa tuturor oaspetilor deodata.
  PLAFON_GLOBAL  constant int := 200;  -- cifra din socoteala originala
  PLAFON_IP      constant int := 20;   -- esecuri pe ora, de la o adresa
  PLAFON_FARA_IP constant int := 100;  -- esecuri pe ora, cand adresa nu se stie
  v_esecuri int;
  v_ip      text;
  v_vechi   boolean;
begin
  begin
    v_ip := ip_client();
  exception when others then
    v_ip := null;
  end;

  delete from guest_code_attempts where created_at < now() - interval '1 day';

  -- Forma gresita se opreste prima, inaintea oricarui plafon: e cea mai
  -- ieftina verificare si nu atinge tabelul de rezervari. Doua lungimi cat
  -- tine trecerea — 8 pentru codurile noi, 5 pentru cele mostenite — si
  -- nimic intre ele, ca lungimea sa spuna limpede care e care.
  if p_cod is null or p_cod !~ '^([A-Za-z0-9]{5}|[A-Za-z0-9]{8})$' then
    insert into guest_code_attempts (cod, ip) values (left(coalesce(p_cod, ''), 16), v_ip);
    motiv := 'necunoscut';
    return;
  end if;

  v_vechi := length(p_cod) = 5;

  if v_vechi then
    select count(*) into v_esecuri from guest_code_attempts
      where created_at > now() - interval '1 hour';
    if v_esecuri >= PLAFON_GLOBAL then
      motiv := 'prea-multe';
      return;
    end if;
  end if;

  -- Adresa necunoscuta NU e o scutire, cum era: `if v_ip is not null` sarea
  -- peste verificare cu totul, deci necunoscutul deschidea poarta larga in
  -- loc s-o inchida. Acum e o galeata a ei, mai larga fiindca poate aduna
  -- mai multi oameni la un loc.
  if v_ip is not null then
    select count(*) into v_esecuri from guest_code_attempts
      where ip = v_ip and created_at > now() - interval '1 hour';
    if v_esecuri >= PLAFON_IP then
      motiv := 'prea-multe';
      return;
    end if;
  else
    select count(*) into v_esecuri from guest_code_attempts
      where ip is null and created_at > now() - interval '1 hour';
    if v_esecuri >= PLAFON_FARA_IP then
      motiv := 'prea-multe';
      return;
    end if;
  end if;

  select * into rezervare from reservations where guest_code = p_cod;

  if not found then
    -- Singurul caz numarat ca esec. Un cod care EXISTA, dar al carui sejur
    -- n-a inceput sau s-a terminat, e un oaspete, nu un atacator — daca ar
    -- intra la socoteala, cineva care isi reincarca pagina cu o zi inainte
    -- de sosire ar consuma din bugetul care tine usile inchise.
    insert into guest_code_attempts (cod, ip) values (p_cod, v_ip);
    rezervare := null;
    motiv := 'necunoscut';
    return;
  end if;

  -- Fereastra de valabilitate: legata de status, nu de o comparatie de date.
  -- Codul de acces are deja o regula gandita pentru check-in devreme (vezi
  -- src/lib/acces.js), iar legand linkul de status mostenim acea decizie in
  -- loc sa inventam a doua definitie a lui „e cazat acum". La celalalt
  -- capat, check-out-ul omoara linkul in aceeasi clipa in care moare codul.
  --
  -- Starile distincte nu sunt doar pentru mesaje frumoase: guest app-ul
  -- trebuie sa spuna „sejurul n-a inceput inca" altfel decat „link gresit".
  -- Da, asta dezvaluie ca un cod exista — dar numai cuiva care il are deja.
  if rezervare.status = 'checkedin' then
    motiv := 'ok';
  elsif rezervare.status in ('pending', 'confirmed', 'protocol') then
    motiv := 'neinceput';
    rezervare := null;
  elsif rezervare.status = 'checkedout' then
    motiv := 'incheiat';
    rezervare := null;
  else
    motiv := 'anulat';
    rezervare := null;
  end if;
end $$;

-- Fiecare functie noua primeste EXECUTE pentru PUBLIC — o revocare scrisa
-- doar pentru `anon` arata corect si nu face nimic. Poarta e interna:
-- functiile de citire ale guest app-ului o cheama din interior, iar ele
-- fiind security definer ruleaza ca proprietar, deci n-au nevoie de drept.
revoke execute on function guest_poarta(text) from public, anon, authenticated;
-- ATENTIE la revocarea de mai jos: `guest_code_nou` e chemata din
-- `pune_guest_code`, triggerul de pe `reservations`. Revocarea e in regula
-- DOAR fiindca triggerul e `security definer` si apelul ruleaza deci ca
-- proprietar. Daca cineva scoate vreodata `security definer` de acolo,
-- randul asta blocheaza crearea oricarei rezervari din PMS. S-a intamplat,
-- pe 6 septembrie 2026, si a tinut pana seara.
revoke execute on function guest_code_nou() from public, anon, authenticated;
-- Si functia de trigger. Ea nu se poate chema oricum din afara (Postgres
-- refuza: „trigger functions can only be called as triggers"), dar n-are
-- motiv sa aiba EXECUTE pentru toata lumea doar fiindca asa e implicit.
-- Drepturile pe o functie de trigger se verifica la CREATE TRIGGER, nu la
-- fiecare declansare, deci revocarea nu opreste triggerul. Ce NU se
-- verifica la CREATE TRIGGER sunt apelurile dinauntrul ei — vezi mai sus.
revoke execute on function pune_guest_code() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Citirile guest app-ului
-- ---------------------------------------------------------------------
-- Toate trei sunt security definer si intorc un jsonb construit CAMP CU
-- CAMP, niciodata `select *`. Regula din docs/guest-app.md 4.3: din server
-- nu ies datele altor rezervari, lock_id-ul yalei, preturi interne sau
-- notele receptiei.

-- Numele afisat in pagina oaspetelui: doua cazuri, nu o cascada de rezerve.
--
-- FARA GRUP, numele de pe rezervare e si al ocupantului — regula spusa de
-- proprietar, si singura care se tine: campurile de ocupant al camerei se
-- pot edita DOAR din ecranul de grup, deci pe o rezervare fara grup ele nu
-- se vad si nu se pot corecta din aplicatie. Daca ar avea intaietate, un
-- nume ramas acolo (de pe o rezervare scoasa candva dintr-un grup) ar sta
-- lipit pentru totdeauna pe ecranul oaspetelui, fara nicio cale de reparat
-- in afara de SQL. S-a intamplat, pe 6 septembrie 2026.
--
-- CU GRUP, ocupantul camerei, iar daca lipseste, eticheta grupului.
-- NICIODATA titularul: intr-un grup el e o persoana straina de camera
-- asta, iar datele lui n-au ce cauta pe ecranul altcuiva.
create or replace function guest_stay_by_cod(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p record;
  v_nume text;
  v_ocupant text;
  v_camera record;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  select r.name, r.type into v_camera from rooms r where r.id = (v_p.rezervare).room_id;

  v_ocupant := nullif(trim(concat_ws(' ',
    (v_p.rezervare).occupant_first_name, (v_p.rezervare).occupant_last_name)), '');

  if (v_p.rezervare).group_id is null then
    select nullif(trim(concat_ws(' ', gu.first_name, gu.last_name)), '') into v_nume
      from guests gu where gu.id = (v_p.rezervare).guest_id;
    -- Ocupantul ramane doar ca rezerva, pentru o rezervare fara client.
    v_nume := coalesce(v_nume, v_ocupant);
  else
    v_nume := v_ocupant;
    if v_nume is null then
      select nullif(trim(g.name), '') into v_nume
        from res_groups g where g.id = (v_p.rezervare).group_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'stay', jsonb_build_object(
      'guestName', v_nume,
      'roomName',  v_camera.name,
      'roomType',  v_camera.type,
      'checkIn',   (v_p.rezervare).checkin,
      'checkOut',  (v_p.rezervare).checkout,
      'nights',    greatest(1, ((v_p.rezervare).checkout::date - (v_p.rezervare).checkin::date)),
      'adults',    (v_p.rezervare).adults,
      'children',  (v_p.rezervare).children,
      -- Aceeasi regula ca in src/lib/pricing.js: suprascrierea manuala bate
      -- pretul inghetat la creare. Al treilea nivel de acolo — calculul live
      -- din tarife — n-are corespondent aici si nici nu-i trebuie: PMS-ul
      -- completeaza booked_price la fiecare incarcare, iar in baza nu exista
      -- nicio rezervare activa fara pret. NULL cand lipsesc amandoua, iar
      -- pagina ascunde randul in loc sa arate 0 lei.
      'total',     coalesce((v_p.rezervare).price_override, (v_p.rezervare).booked_price)
    ));
end $$;

create or replace function guest_access_code_by_cod(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p record;
  v_c record;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  -- Doar codul si valabilitatea. `lock_id` si `external_id` raman pe server:
  -- oaspetele apasa un buton, nu trimite identificatorul unei yale.
  select ac.code, ac.valid_from, ac.valid_until into v_c
    from access_codes ac
   where ac.reservation_id = (v_p.rezervare).id and ac.status = 'active';

  if not found then
    -- Nu e o eroare: codul se genereaza la check-in si poate intarzia.
    -- Pagina trebuie sa poata spune „inca nu e gata", nu „link stricat".
    return jsonb_build_object('ok', true, 'code', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', v_c.code,
    'validFrom', v_c.valid_from,
    'validUntil', v_c.valid_until);
end $$;

-- Meniul de minibar. Fara cod: e o lista de bauturi cu preturi, care nu
-- spune nimic despre niciun oaspete.
--
-- Preturile sunt CU TVA inclus — asa e conventia din toata aplicatia (vezi
-- calcAmounts in src/lib/money.js), deci nu se mai calculeaza nimic aici.
--
-- Doar afisare. Auto-declararea consumului a fost respinsa explicit
-- (docs/guest-app.md 5.2): ar fi insemnat scriere pe facturare dintr-un
-- link public.
create or replace function guest_minibar()
returns jsonb language sql stable security definer
set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name',        p.name,
           'description', p.public_description,
           'unit',        p.unit,
           'price',       p.default_price
         ) order by p.sort_order, p.name), '[]'::jsonb)
    from products p
   where p.active and p.public_visible and lower(p.category) = 'minibar';
$$;

-- Astea TREI sunt singurele care ies la vizitator. Poarta ramane interna;
-- ele o cheama din interior, fiind ele insele security definer.
-- Revocarea de la public vine INAINTEA grantului: fara ea, `grant to anon`
-- n-ar schimba nimic, fiindca EXECUTE pentru PUBLIC e deja acolo, implicit.
revoke execute on function guest_stay_by_cod(text)        from public, authenticated;
revoke execute on function guest_access_code_by_cod(text) from public, authenticated;
revoke execute on function guest_minibar()                from public, authenticated;
grant  execute on function guest_stay_by_cod(text)        to anon, service_role;
grant  execute on function guest_access_code_by_cod(text) to anon, service_role;
grant  execute on function guest_minibar()                to anon, service_role;

-- ---------------------------------------------------------------------------
-- Deschiderea usii din pagina oaspetelui (docs/guest-app.md, pasul 4)
-- ---------------------------------------------------------------------------
--
-- Yala nu se poate atinge din PostgreSQL, deci deschiderea propriu-zisa e o
-- functie edge (supabase/functions/guest-unlock). Aici sta doar ce trebuie
-- sa fie de neocolit: dreptul de a deschide si plafoanele. Functia edge nu
-- rescrie niciuna din reguli, doar cheama `guest_poate_deschide` si se
-- opreste daca raspunsul e „nu".

-- Contorul de deschideri. Ca la guest_code_attempts: fara RLS permisiv,
-- fara grant, nimic nu ajunge la el prin API.
create table guest_unlock_attempts (
  id             bigint generated always as identity primary key,
  reservation_id text,
  ip             text,
  created_at     timestamptz not null default now()
);
create index guest_unlock_attempts_rez on guest_unlock_attempts (reservation_id, created_at desc);
create index guest_unlock_attempts_ip  on guest_unlock_attempts (ip, created_at desc);
alter table guest_unlock_attempts enable row level security;

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

  -- FEREASTRA DE TIMP. Butonul merge intre sosire si plecare, si atat.
  --
  -- Se citeste din REZERVARE, nu din `access_codes`: butonul e deliberat
  -- desprins de cod (codul poate lipsi, poate intarzia, poate esua la yala),
  -- deci fereastra lui nu are voie sa atarne de existenta codului.
  --
  -- Statusul nu e suficient. `checkedin` se pune de la recepate si ramane
  -- asa pana apasa cineva check-out — deci un oaspete cazat cu doua zile
  -- inainte ar fi putut deschide usa din prima clipa, iar unul care a plecat
  -- ar fi putut deschide-o si a doua zi. Ora decide, nu statusul.
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

-- Inchisa pentru toata lumea. O cheama functia edge, cu cheia de serviciu;
-- daca ar fi deschisa lui anon, oricine ar putea consuma plafonul unei
-- rezervari fara sa treaca prin functie.
revoke execute on function guest_poate_deschide(text, text) from public, anon, authenticated;


-- =====================================================================
-- FISA DE CAZARE
--
-- Fisa de anuntare a sosirii si plecarii, completata de oaspete din guest
-- app si semnata cu degetul. Inlocuieste hartia: fisa semnata de aici e
-- documentul care se arata la un control.
--
-- Documentul intreg de arhitectura: docs/fisa-cazare.md.
-- =====================================================================

create table fise_cazare (
  id              text primary key,
  reservation_id  text not null references reservations(id) on delete cascade,
  -- 1 = titularul. Coloana exista de la inceput ca insotitorii sa nu ceara
  -- o migratie de date mai tarziu; prima versiune scrie numai 1.
  ordine          smallint not null default 1,
  guest_id        text references guests(id),

  nume            text not null,
  prenume         text not null,
  data_nasterii   date not null,
  locul_nasterii  text not null,
  -- Doua campuri, nu unul. Coala tiparita scrie `guests.country` si la
  -- „Nationalitate" si la „Tara" (src/features/documente.jsx), deci un
  -- roman cu domiciliul in Germania iese cu „Germania" la nationalitate.
  -- Pe hartie trecea neobservat fiindca receptionerul corecta cu pixul;
  -- intr-un formular completat de oaspete, greseala se salveaza.
  nationalitate   text not null,
  tara            text not null,
  adresa          text not null,
  localitate      text not null,
  scopul          text not null,

  act_tip         text not null check (act_tip in ('ci','pasaport','permis')),
  act_seria       text,
  act_numarul     text not null,

  -- Semnatura oaspetelui SAU numele celui de la receptie care a completat
  -- fisa in locul lui. Un om de optzeci de ani fara smartphone tot trebuie
  -- cazat legal.
  semnatura_svg   text,
  completata_de   text,
  semnat_la       timestamptz not null default now(),
  semnat_ip       text,
  semnat_agent    text,
  -- Versiunea colii cu care s-a randat fisa. Vezi docs/fisa-cazare.md 4:
  -- pana se scrie congelarea in Storage, imuabilitatea randului plus
  -- versiunea asta sunt ce face documentul reproductibil.
  sablon_versiune text not null,

  anulata_la      timestamptz,
  anulata_de      text,
  anulata_motiv   text,

  -- Motivul pentru care lipseste semnatura, cand lipseste.
  fara_semnatura_motiv text,

  -- O fisa e valida fie cu semnatura, fie fara ea DAR cu motivul scris.
  --
  -- Prima varianta cerea EXACT UN autor — ori semnatura, ori numele
  -- receptionerului. Parea curata si era prea rigida: fluxul real e ca
  -- receptionerul sa tasteze si oaspetele sa semneze pe tableta lui, caz in
  -- care fisa are nevoie de amandoua. `completata_de` inseamna acum „cine a
  -- tastat", independent de semnatura. Schimbat pe 7 septembrie 2026.
  constraint fisa_semnata_sau_motivata check (
    semnatura_svg is not null or fara_semnatura_motiv is not null),

  -- MĂRIMEA. Fișa se scrie de oaspete, prin `guest_fisa_semneaza`, care e
  -- deschisă lui `anon`: cine are un cod de sejur valid poate trimite orice
  -- text, de orice lungime. Până pe 9 septembrie 2026 nicio coloană n-avea
  -- limită. Cea care contează e `semnatura_svg` — e un desen, deci exact
  -- câmpul în care încape un megabyte fără să pară ciudat, iar baza e pe
  -- planul gratuit.
  --
  -- Măsurat pe fișele reale: semnătura cea mai mare are 1247 de caractere
  -- (media 787), user-agent 137, adresa 34. Plafoanele sunt cu ordine de
  -- mărime peste, deci nu pot deranja un oaspete adevărat — verificat: o
  -- semnătură de 1500 intră, una de 200.000 e refuzată.
  --
  -- `guest_fisa_semneaza` prinde deja `check_violation` și întoarce
  -- „date-incomplete", fără să spună ce câmp: un refuz de mărime arată la
  -- fel ca oricare altul.
  constraint fise_cazare_semnatura_marime check (length(semnatura_svg) <= 100000),
  constraint fise_cazare_lungimi check (
        length(nume)                 <= 120
    and length(prenume)              <= 120
    and length(locul_nasterii)       <= 120
    and length(nationalitate)        <= 120
    and length(tara)                 <= 120
    and length(localitate)           <= 120
    and length(act_seria)            <= 120
    and length(act_numarul)          <= 120
    and length(scopul)               <= 120
    and length(adresa)               <= 300
    and length(semnat_ip)            <= 60
    and length(semnat_agent)         <= 400
    and length(sablon_versiune)      <= 60
    and length(completata_de)        <= 120
    and length(anulata_de)           <= 120
    and length(anulata_motiv)        <= 500
    and length(fara_semnatura_motiv) <= 500
  )
);

-- Index partial, nu cheie unica: o fisa anulata trebuie sa lase loc alteia
-- pe acelasi (rezervare, ordine). Cu o cheie obisnuita, prima greseala ar
-- fi blocat locul pentru totdeauna.
create unique index fise_cazare_activa
  on fise_cazare (reservation_id, ordine) where anulata_la is null;
create index fise_cazare_rezervare on fise_cazare (reservation_id);

alter table fise_cazare enable row level security;

-- Nicio politica. Accesul trece exclusiv prin functiile security definer de
-- mai jos, care ocolesc RLS pentru propriile query-uri. Acelasi tipar ca la
-- guest_code_attempts. Verificat din afara pe 7 septembrie 2026: cheia anon
-- primeste 42501 „permission denied for table fise_cazare", si la citire, si
-- la scriere (tests/integration/fisa-cazare.integration.test.js).
revoke all on table fise_cazare from public, anon, authenticated;

-- Receptia are nevoie de tabel direct — pentru indicator, pentru completarea
-- in locul oaspetelui si pentru coala tiparita — deci grantul se pune inapoi
-- pentru `authenticated`, iar RLS-ul face selectia. `anon` ramane in afara:
-- pentru el singura cale sunt cele doua functii de mai jos.
--
-- `housekeeping` NU vede fisele: cine face curat n-are ce cauta in seriile de
-- buletin. Acelasi tipar ca la `guests`, unde citirea e deja restransa la
-- admin si receptioner.
grant select, insert, update on table fise_cazare to authenticated;

create policy "receptia citeste fise" on fise_cazare
  for select to authenticated
  using ((select is_admin()) or (select staff_role()) = 'receptionist');

create policy "receptia scrie fise" on fise_cazare
  for insert to authenticated
  with check (is_admin() or staff_role() = 'receptionist');

-- UPDATE e deschis doar cat sa treaca anularea: triggerul de mai jos respinge
-- orice alta diferenta intre randul vechi si cel nou. Politica spune CINE
-- poate incerca; triggerul spune CE poate trece.
create policy "receptia anuleaza fise" on fise_cazare
  for update to authenticated
  using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');


-- Lista fișelor, pentru ecranul Clienți → Fișe.
--
-- Fără `semnatura_svg`: e de departe cel mai mare câmp din rând (~800 de
-- caractere de desen) și nu se vede în listă, ci doar când deschizi o fișă
-- anume. La câteva sute de fișe ar fi însemnat sute de kilobytes trimiși
-- degeaba la fiecare intrare în ecran. `are_semnatura` păstrează singurul
-- lucru care contează în listă: dacă există sau nu.
--
-- `security_invoker = true`, spre deosebire de `rezervari_ocupare`: aici
-- vederea NU trebuie să treacă peste RLS, ci exact invers — cine o citește e
-- chiar cel care are deja voie la tabel, prin politica de mai sus. Camerista
-- nu ajunge nici la vedere, nici la tabel (verificat: 0 rânduri).
create view fise_cazare_lista
with (security_invoker = true) as
select f.id,
       f.reservation_id,
       f.ordine,
       f.nume,
       f.prenume,
       f.semnat_la,
       f.completata_de,
       f.anulata_la,
       f.anulata_de,
       f.anulata_motiv,
       f.fara_semnatura_motiv,
       f.semnatura_svg is not null as are_semnatura
from fise_cazare f;

revoke all on fise_cazare_lista from public, anon;
grant select on fise_cazare_lista to authenticated;

-- Documentul nu se poate schimba dupa semnare. Fara trigger, „imuabil" e o
-- promisiune, nu o proprietate — iar la un control conteaza proprietatea.
--
-- Anularea e SINGURA trecere permisa, si e scrisa ca un caz anume, nu ca o
-- portita: daca triggerul ar lasa orice update „doar pentru anulare", n-ar
-- mai apara nimic.
--
-- Verificat pe 7 septembrie 2026, cu tranzactie anulata, pe patru cazuri:
-- modificarea unui camp obisnuit, stergerea si anularea care schimba si
-- altceva pe drum sunt toate refuzate; anularea curata trece.
--
-- MESAJELE PLEACĂ CU P0001, adică fără `using errcode`. Sunt scrise pentru
-- om, în română, tocmai ca recepția să știe ce are de făcut — iar
-- `src/lib/errors.js` traduce după COD și lasă neatins doar P0001. Cu
-- `errcode = check_violation`, cum era până pe 9 septembrie 2026, recepția
-- primea „Datele introduse nu respectă o regulă de validare": adevărat și
-- complet nefolositor. S-a văzut pe bune, la ștergerea unei rezervări cu
-- fișă semnată. Nimic nu prinde codul: trigger-ul e `before update or
-- delete`, iar singurul `exception when check_violation` de pe fise, din
-- `guest_fisa_semneaza`, e pe INSERT.
--
-- CE SPUNE PRIMUL MESAJ, ȘI DE CE NU ALTCEVA. Prima variantă zicea
-- „anuleaz-o întâi, apoi șterge rezervarea". E fals: ramura de DELETE de mai
-- jos nu se uită deloc la `anulata_la`, deci respinge și ștergerea unei fișe
-- deja anulate (verificat, cu tranzacție anulată). O rezervare cu fișă nu se
-- șterge NICIODATĂ — și nici n-ar trebui: fișa e document legal, iar
-- `on delete cascade` de pe `reservation_id` ar duce-o cu ea. Singurul drum
-- care chiar funcționează e statusul „Anulată" pe rezervare, iar mesajul
-- trebuie să trimită acolo, nu într-o buclă.
create or replace function fise_cazare_doar_anulare()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  vechi jsonb;
  nou   jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Rezervarea are fișă de cazare, deci nu poate fi ștearsă — o fișă nu se șterge niciodată, nici anulată. Pune-i statusul pe „Anulată”: eliberează camera și dispare de pe calendar, dar rămâne în evidență.';
  end if;

  if old.anulata_la is not null then
    raise exception 'Fișa e deja anulată și nu se mai modifică.';
  end if;

  -- `to_jsonb` minus cele trei coloane, pe ambele randuri. Comparatia ramane
  -- corecta si dupa ce cineva adauga o coloana noua tabelului — o lista
  -- scrisa de mana ar fi uitat-o, si exact aia ar fi devenit portita.
  vechi := to_jsonb(old) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';
  nou   := to_jsonb(new) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';

  if vechi is distinct from nou then
    raise exception 'O fișă de cazare semnată nu se modifică. Anuleaz-o și scrie alta.';
  end if;

  if new.anulata_la is null then
    raise exception 'Singura modificare permisă e anularea.';
  end if;

  return new;
end $$;

create trigger fise_cazare_imuabila
  before update or delete on fise_cazare
  for each row execute function fise_cazare_doar_anulare();

revoke execute on function fise_cazare_doar_anulare()
  from public, anon, authenticated;

-- Ce vede oaspetele inainte sa completeze fisa.
--
-- TACE DE INDATA CE FISA E SEMNATA. Ca sa precompleteze, functia trebuie sa
-- intoarca numele si adresa din `guests` — adica un cod scurs le-ar putea
-- citi. Ingustam fereastra in loc s-o lasam deschisa: dupa semnare raspunsul
-- e doar „gata", fara nimic din continut. In practica fereastra tine cateva
-- minute, de la check-in pana la completare.
--
-- Ce NU intoarce, niciodata: data nasterii, locul nasterii, actul de
-- identitate, semnatura. Sunt exact campurile marcate `sensibil` in
-- src/lib/fisa.js, iar motivul e in docs/fisa-cazare.md 3.
--
-- Verificat pe 7 septembrie 2026, cu tranzactie anulata: intoarce EXACT
-- cheile nume, prenume, adresa, localitate, tara.
create or replace function guest_fisa_precompletare(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p     record;
  v_g     guests;
  v_gata  boolean;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  select exists (
    select 1 from fise_cazare
    where reservation_id = (v_p.rezervare).id
      and ordine = 1 and anulata_la is null
  ) into v_gata;

  if v_gata then
    return jsonb_build_object('ok', true, 'gata', true);
  end if;

  select * into v_g from guests where id = (v_p.rezervare).guest_id;

  -- Cele cinci campuri nesensibile, si numai ele. Data si locul nasterii si
  -- actul de identitate nu se precompleteaza niciodata: se citesc de pe
  -- documentul din mana, de fiecare data (docs/fisa-cazare.md 3).
  --
  -- `nullif(..., '-')` NU e pedanterie. `snakeGuest` (src/data/mapari.js)
  -- scrie "-" cand lipsesc last_name, first_name sau city. Trecuta in
  -- formular, umplutura ARATA completata: oaspetele nu mai scrie nimic
  -- acolo, validarea o accepta ca valoare, si "-" ajunge ca localitate pe o
  -- fisa de cazare, adica pe un act oficial. Golul se vede; "-" nu.
  --
  -- Aceeasi regula, aceleasi cinci campuri, si la receptie, in
  -- `precompletareDinOaspete` (src/lib/fisa.js). Doua precompletari diferite
  -- ar fi insemnat ca aceeasi rezervare arata altfel dupa cine deschide fisa.
  --
  -- Golul se scrie ca sir vid, nu ca null: pagina oaspetelui pune valoarea
  -- direct in `value` al unui input, iar null ar face campul necontrolat.
  return jsonb_build_object(
    'ok', true,
    'gata', false,
    'date', jsonb_build_object(
      'nume',       coalesce(nullif(nullif(btrim(v_g.last_name),  ''), '-'), ''),
      'prenume',    coalesce(nullif(nullif(btrim(v_g.first_name), ''), '-'), ''),
      'adresa',     coalesce(nullif(nullif(btrim(v_g.address),    ''), '-'), ''),
      'localitate', coalesce(nullif(nullif(btrim(v_g.city),       ''), '-'), ''),
      'tara',       coalesce(nullif(nullif(btrim(v_g.country),    ''), '-'), '')
    ));
end $$;

-- Revocarea INAINTEA grantului: in Postgres orice functie noua primeste
-- EXECUTE pentru PUBLIC, iar o revocare scrisa doar pentru `anon` arata
-- corect si nu face nimic.
revoke execute on function guest_fisa_precompletare(text)
  from public, anon, authenticated;
grant  execute on function guest_fisa_precompletare(text) to anon, service_role;

-- Scrierea fisei, din link public.
--
-- NU INTOARCE NIMIC DIN CE A SCRIS. Nici la succes. Un raspuns care ar
-- oglindi datele ar fi o cale de citire pe usa din dos, exact ce inchide
-- docs/fisa-cazare.md 3.
--
-- A doua scriere pe aceeasi (rezervare, ordine) e oprita de indexul partial
-- `fise_cazare_activa`, nu de o verificare scrisa aici: doua cereri venite in
-- aceeasi clipa ar fi trecut amandoua de un `if exists`, iar indexul nu se
-- poate pacali asa.
--
-- Verificat pe 7 septembrie 2026, cu tranzactie anulata: prima scriere da
-- {ok:true}; a doua, `deja-completata`; o data a nasterii stricata,
-- `date-incomplete`; un cod inventat, `necunoscut`.
create or replace function guest_fisa_semneaza(p_cod text, p_date jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p  record;
  v_ip text;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  begin
    v_ip := ip_client();
  exception when others then v_ip := null;
  end;

  begin
    insert into fise_cazare (
      id, reservation_id, ordine, guest_id,
      nume, prenume, data_nasterii, locul_nasterii,
      nationalitate, tara, adresa, localitate, scopul,
      act_tip, act_seria, act_numarul,
      semnatura_svg, semnat_ip, semnat_agent, sablon_versiune)
    values (
      -- Calificat cu `extensions.`, fiindca acolo sta pgcrypto in Supabase,
      -- iar functia isi fixeaza search_path la public.
      'fc-' || encode(extensions.gen_random_bytes(8), 'hex'),
      (v_p.rezervare).id, 1, (v_p.rezervare).guest_id,
      p_date ->> 'nume', p_date ->> 'prenume',
      (p_date ->> 'dataNasterii')::date, p_date ->> 'loculNasterii',
      p_date ->> 'nationalitate', p_date ->> 'tara',
      p_date ->> 'adresa', p_date ->> 'localitate', p_date ->> 'scopul',
      p_date ->> 'actTip', nullif(p_date ->> 'actSeria', ''),
      p_date ->> 'actNumarul',
      p_date ->> 'semnaturaSvg', v_ip,
      left(coalesce(current_setting('request.headers', true)::json
           ->> 'user-agent', ''), 300),
      coalesce(p_date ->> 'sablonVersiune', 'necunoscuta'));
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'motiv', 'deja-completata');
    when not_null_violation or check_violation or invalid_text_representation
      or invalid_datetime_format or datetime_field_overflow then
      -- Mesajul nu spune CE camp: cine trimite date stricate din afara
      -- formularului n-are de ce sa afle forma exacta a tabelului.
      return jsonb_build_object('ok', false, 'motiv', 'date-incomplete');
  end;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function guest_fisa_semneaza(text, jsonb)
  from public, anon, authenticated;
grant  execute on function guest_fisa_semneaza(text, jsonb) to anon, service_role;


-- =====================================================================
-- DISPOZITIVE (RELEE SHELLY)
-- =====================================================================
--
-- MONTAJUL FIZIC, care explica de ce schema arata asa. Camerele sunt
-- grupate cate doua in jurul unei camere tehnice; in fiecare camera
-- tehnica sta un Shelly Pro 4PM, cu patru canale impartite asa:
--
--   iesirea 1  iluminat exterior  -> AMBELE camere ale perechii
--   iesirea 2  boiler             -> AMBELE camere ale perechii
--   iesirea 3  prize              -> doar prima camera
--   iesirea 4  prize              -> doar a doua camera
--
-- ATENTIE LA NUMEROTARE. Aplicatia Shelly numeroteaza iesirile 1-4, dar
-- API-ul v2 le adreseaza 0-3 (`switch:0` .. `switch:3`). In coloana
-- `channel` se scrie NUMARUL DIN API, adica iesirea fizica minus unu.
-- Confuzia costa scump: o comanda gresita cu unu opreste boilerul in loc
-- de iluminatul exterior.
--
-- De-aici vine tot ce urmeaza: un rand in `devices` per CANAL (nu per
-- dispozitiv fizic), si o relatie multi-la-multi spre camere. Un canal
-- partajat oprit lasa fara apa calda si vecinul, deci partajarea trebuie
-- sa fie un fapt din schema, pe care interfata sa-l poata arata, nu o
-- conventie tinuta minte de recepetie.
--
-- Cheia de cont Shelly (`auth_key`) NU e aici si nu ajunge niciodata in
-- browser: sta in Edge Function Secrets, iar comenzile trec prin
-- supabase/functions/device-provider. Vezi docs/shelly-integration.md.

create table devices (
  id                 text primary key,
  provider           text not null default 'shelly',
  provider_device_id text not null check (length(provider_device_id) between 1 and 64),
  device_gen         text not null default 'gen2' check (device_gen in ('gen1', 'gen2')),
  device_model       text check (length(device_model) <= 60),
  -- CE COMANDA canalul, nu ce tip de componenta Shelly e: toate patru sunt
  -- switch-uri pentru API, deci tipul n-ar distinge nimic, pe cand functia
  -- decide ce scrie in interfata si ce avertisment se arata. Daca apare
  -- vreodata un rulou (cover), atunci se adauga o coloana separata.
  -- 'contor' iese din tipar: e un Shelly Pro 3EM care doar MASOARA consumul
  -- pe trei faze. Sta aici fiindca tot ce e in jur (cont, apel de status in
  -- loturi, functie edge) e identic; difera doar ce se citeste din raspuns
  -- si faptul ca nu se comanda. N-are randuri in `device_rooms`: masoara
  -- toata pensiunea, nu o camera.
  kind               text not null check (kind in ('boiler', 'iluminat_exterior', 'prize', 'contor', 'altul')),
  channel            integer not null default 0 check (channel between 0 and 15),
  name               text not null check (length(name) between 1 and 60),
  enabled            boolean not null default true,
  last_status        jsonb,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, provider_device_id, channel)
);

-- Ce camere serveste fiecare canal: doua randuri pentru unul partajat,
-- unul singur pentru prize.
create table device_rooms (
  device_id text not null references devices(id) on delete cascade,
  room_id   text not null references rooms(id)   on delete cascade,
  primary key (device_id, room_id)
);

create index device_rooms_room_idx on device_rooms(room_id);

-- Jurnal append-only al comenzilor. `device_name` si `rooms` sunt
-- INGHETATE ca text: o comanda din trecut trebuie sa ramana lizibila si
-- dupa ce dispozitivul a fost redenumit sau sters.
create table device_commands (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       text not null check (length(actor) <= 120),
  device_id   text references devices(id) on delete set null,
  device_name text check (length(device_name) <= 60),
  rooms       text check (length(rooms) <= 120),
  action      text not null check (action in ('on', 'off', 'refresh')),
  result      text not null check (result in ('ok', 'error')),
  detail      text check (length(detail) <= 500)
);

alter table devices         enable row level security;
alter table device_rooms    enable row level security;
alter table device_commands enable row level security;

-- Camerista nu vede si nu comanda relee. Nu e o restrictie de principiu,
-- ci consecventa cu ecranul ei, care n-are butoanele astea.
create policy "citeste dispozitive" on devices
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "admin scrie dispozitive" on devices
  for insert to authenticated with check (is_admin());
create policy "admin modifica dispozitive" on devices
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin sterge dispozitive" on devices
  for delete to authenticated using (is_admin());

create policy "citeste legaturi dispozitiv-camera" on device_rooms
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "admin leaga dispozitive de camere" on device_rooms
  for insert to authenticated with check (is_admin());
create policy "admin dezleaga dispozitive de camere" on device_rooms
  for delete to authenticated using (is_admin());

-- Doar citire pentru personal. Scrierea o face exclusiv functia edge, cu
-- service_role, care ocoleste RLS — deci nu exista politica de insert
-- pentru `authenticated`, si nici de update sau delete pentru nimeni:
-- un jurnal pe care actorul il poate rescrie nu e jurnal.
create policy "citeste comenzi dispozitive" on device_commands
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

comment on table device_rooms is
  'Ce camere sunt servite de fiecare canal. Doua randuri pentru un canal partajat (boiler, iluminat exterior), unul pentru un canal dedicat (prize).';

-- REGULI AUTOMATE (9 septembrie 2026) — anti-legionela, lumini exterioare
-- dupa soare, preincalzire boiler. Logica de decizie e in
-- supabase/functions/device-provider/reguli-automate.ts; tabelele de aici
-- doar tin starea de care logica are nevoie intre doua tick-uri ale
-- ciclului de reconciliere (pg_cron, o data la 10 minute).

-- Anti-legionela: cadenta de 10 zile per boiler. `last_run_on` e o DATA
-- locala (Europe/Bucharest), nu un timestamp — cadenta se compara in zile.
create table device_legionella_runs (
  device_id   text primary key references devices(id) on delete cascade,
  last_run_on date not null,
  updated_at  timestamptz not null default now()
);

-- Suprascrierea manuala a automatizarii de lumini exterioare: cat timp
-- `until` e in viitor, ciclul de reconciliere sare peste dispozitivul asta.
-- Doar iluminat_exterior foloseste tabelul asta — boilerul n-a primit acest
-- mecanism (nu a fost cerut).
create table device_automation_override (
  device_id  text primary key references devices(id) on delete cascade,
  until      timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table device_legionella_runs     enable row level security;
alter table device_automation_override enable row level security;

-- Doar citire pentru personal, la fel ca device_commands — scrierea o face
-- exclusiv functia edge, prin service_role, care ocoleste RLS.
create policy "citeste rulari legionela" on device_legionella_runs
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');
create policy "citeste override automatizare" on device_automation_override
  for select to authenticated using (is_admin() or staff_role() = 'receptionist');

comment on table device_legionella_runs is
  'Cadenta anti-legionela per boiler: ultima zi (locala) in care ciclul 11:00-14:00 chiar a pornit boilerul.';
comment on table device_automation_override is
  'Suprascriere manuala a automatizarii de iluminat exterior, valabila pana la urmatoarea tranzitie rasarit/apus.';

-- pg_cron + pg_net cheama device-provider o data la 10 minute cu
-- {"action": "cron_reconciliaza"}, autentificat cu cheia service_role
-- pusa manual, o singura data, intr-un secret Vault numit
-- 'service_role_key' (pas facut de administrator, nu de acest cod —
-- vezi docs/shelly-integration.md):
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('device-automatizari', '*/10 * * * *', $$
--     select net.http_post(
--       url := '<url-proiect>/functions/v1/device-provider',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
--       ),
--       body := jsonb_build_object('action', 'cron_reconciliaza')
--     );
--   $$);
