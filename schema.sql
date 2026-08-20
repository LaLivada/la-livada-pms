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
  sort_order       int not null default 0
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
create index accounting_exports_created_by   on accounting_exports (created_by);
create index billing_permissions_granted_by  on billing_permissions (granted_by);
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

create or replace function has_billing_permission(perm text)
returns boolean language sql security definer set search_path = public stable as $$
  select is_admin() or exists (
    select 1 from billing_permissions
    where user_id = auth.uid() and permission = perm
  );
$$;


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
  fingerprint text not null,           -- 'phone:<telefon>' sau 'ip:<adresă>'
  created_at  timestamptz not null default now()
);
create index booking_attempts_fp_created on booking_attempts (fingerprint, created_at desc);
alter table booking_attempts enable row level security;


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
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for', ''
    ), ',', 1), '');
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
  status           text not null default 'confirmed'
                     check (status in ('confirmed','cancelled')),
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
create or replace function create_public_booking(
  p_idempotency_key uuid,
  p_checkin timestamptz, p_checkout timestamptz,
  p_last_name text, p_first_name text, p_phone text, p_email text,
  p_city text, p_county text, p_country text,
  p_rooms jsonb,
  p_notes text default null
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
begin
  -- 1. IDEMPOTENȚĂ
  if p_idempotency_key is null then
    raise exception 'Lipsește cheia de idempotență.';
  end if;
  select * into v_ex from public_bookings where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('success', true, 'repeat', true,
      'confirmationNumber', v_ex.confirmation_number,
      'publicToken', v_ex.public_token, 'status', v_ex.status,
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

  -- 3. RATE-LIMIT, același mecanism ca la create_booking
  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for',''),',',1),'');
  exception when others then v_ip := null; end;

  delete from booking_attempts where created_at < now() - interval '1 day';
  if (select count(*) from booking_attempts
       where fingerprint = 'phone:' || lower(trim(p_phone))
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Prea multe cereri cu acest număr de telefon. Sună recepția.';
  end if;
  if v_ip is not null and (select count(*) from booking_attempts
       where fingerprint = 'ip:' || v_ip
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Prea multe cereri de la această adresă. Încearcă mai târziu.';
  end if;
  insert into booking_attempts (fingerprint) values ('phone:' || lower(trim(p_phone)));
  if v_ip is not null then
    insert into booking_attempts (fingerprint) values ('ip:' || v_ip);
  end if;

  -- 4. SERIALIZARE. Ține până la COMMIT. La 16 camere costul e neglijabil,
  --    iar alternativa (reîncercare la exclusion_violation) ar complica
  --    alocarea multi-cameră fără câștig real.
  perform pg_advisory_xact_lock(hashtext('lalivada:booking'));

  -- 5. OASPETE, recunoscut după telefon ca în restul PMS-ului
  select id into v_guest_id from guests
   where lower(phone) = lower(trim(p_phone)) limit 1;
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
                              status, adults, children, source, notes)
    values (v_res_id, v_room_id, v_guest_id, v_group_id, p_checkin, p_checkout,
            'confirmed', v_ad, v_cop, 'site', nullif(trim(p_notes),''))
    returning booked_price into v_pret;   -- prețul pus de trigger

    v_total   := v_total + coalesce(v_pret, 0);
    v_res_ids := v_res_ids || v_res_id;
  end loop;

  -- 8. CONFIRMARE
  v_nr := next_confirmation_number();
  insert into public_bookings (id, idempotency_key, confirmation_number, guest_id,
                               group_id, reservation_ids, checkin, checkout,
                               rooms_count, total_amount, request_ip)
  values ('pb-' || encode(gen_random_bytes(6),'hex'), p_idempotency_key, v_nr,
          v_guest_id, v_group_id, v_res_ids, p_checkin, p_checkout,
          v_nr_camere, v_total, v_ip)
  returning public_token into v_token;

  return jsonb_build_object('success', true, 'confirmationNumber', v_nr,
    'publicToken', v_token, 'status', 'confirmed',
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

-- CITIRE: tot personalul autentificat vede tot. Nemodificat de auditul
-- de securitate — separarea pe roluri se aplică la scriere, mai jos.
create policy "staff citeste" on rooms        for select to authenticated using (true);
create policy "staff citeste" on guests       for select to authenticated using (true);
create policy "staff citeste" on res_groups   for select to authenticated using (true);
create policy "staff citeste" on reservations for select to authenticated using (true);
create policy "staff citeste" on rates        for select to authenticated using (true);
create policy "staff citeste" on seasons      for select to authenticated using (true);
create policy "citeste app_state" on app_state for select to authenticated using (true);
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

-- Rolul userului curent, pentru politicile de scriere de mai jos.
-- Acelasi pattern ca is_admin(): security definer ca sa nu recurseze
-- prin RLS-ul propriu al tabelului staff.
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
--   · app_state                     → admin/recepționer peste tot;
--     cameristele doar pe două chei: statusul de curățenie
--     (updateHousekeeping) și jurnalul de activitate — schimbarea unui
--     status scrie în ambele, iar fără a doua propriile lor acțiuni n-ar
--     mai apărea în audit, exact pe dos față de rostul jurnalului.
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
create policy "sterge oaspeti" on guests
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

create policy "scrie grupuri" on res_groups
  for insert to authenticated with check (is_admin() or staff_role() = 'receptionist');
create policy "modifica grupuri" on res_groups
  for update to authenticated using (is_admin() or staff_role() = 'receptionist')
  with check (is_admin() or staff_role() = 'receptionist');
create policy "sterge grupuri" on res_groups
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

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

create policy "scrie app_state" on app_state
  for insert to authenticated with check (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );
create policy "modifica app_state" on app_state
  for update to authenticated using (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  ) with check (
    is_admin() or staff_role() = 'receptionist'
    or (staff_role() = 'housekeeping' and key in ('pms:housekeeping:v3', 'pms:log:v3'))
  );
create policy "sterge app_state" on app_state
  for delete to authenticated using (is_admin() or staff_role() = 'receptionist');

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
create policy "sterge clienti facturare" on billing_customers for delete to authenticated
  using (has_billing_permission('create_invoice'));

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
create policy "sterge folio" on folios for delete to authenticated
  using (has_billing_permission('create_invoice'));

create policy "citeste folio_items" on folio_items for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie folio_items" on folio_items for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica folio_items" on folio_items for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge folio_items" on folio_items for delete to authenticated
  using (has_billing_permission('create_invoice'));

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
create policy "sterge linii factura" on invoice_items for delete to authenticated
  using (has_billing_permission('create_invoice'));

create policy "citeste linkuri factura" on invoice_item_links for select to authenticated
  using (has_billing_permission('view_invoices'));
create policy "scrie linkuri factura" on invoice_item_links for insert to authenticated
  with check (has_billing_permission('create_invoice'));
create policy "modifica linkuri factura" on invoice_item_links for update to authenticated
  using (has_billing_permission('create_invoice')) with check (has_billing_permission('create_invoice'));
create policy "sterge linkuri factura" on invoice_item_links for delete to authenticated
  using (has_billing_permission('create_invoice'));

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


-- SUPRAFAȚA PUBLICĂ — exact patru funcții, nimic altceva.
--
-- Site-ul public de rezervări nu are acces la niciun tabel: tot ce poate
-- face trece prin funcțiile de mai jos, fiecare `security definer` și
-- fiecare cu propriile validări și limite.
grant execute on function available_rooms(timestamptz, timestamptz, int) to anon;
grant execute on function public_availability(timestamptz, timestamptz, int, int) to anon;
grant execute on function public_capacity() to anon, authenticated, service_role;
grant execute on function create_public_booking(uuid, timestamptz, timestamptz, text, text,
  text, text, text, text, text, jsonb, text) to anon;
grant execute on function public_booking_by_token(text) to anon;
grant execute on function cancel_public_booking(text) to anon;

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


-- Audit propriu, separat de jurnalul aplicației.
--
-- `audit.push` scrie într-un blob JSON din app_state, plafonat la 400 de
-- intrări și neinterogabil. Operațiunile pe yale au nevoie de altceva: se
-- caută după rezervare și după yală, și nu trebuie să dispară după 400 de
-- rânduri — tocmai fiindcă răspund la întrebarea „cine a deschis ușa aia".
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
