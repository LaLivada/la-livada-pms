-- ETAPA 3 — infrastructura pentru rezervarile de pe site-ul public.
--
-- Un rand per rezervare facuta online. Acopera simultan patru nevoi care
-- altfel ar fi cerut patru mecanisme separate:
--   · idempotenta (cheia unica trimisa de browser)
--   · numarul de confirmare comunicat clientului
--   · tokenul paginii de confirmare, neghicibil
--   · trasabilitatea (ce rezervari a produs o cerere, de la ce IP)
create table public_bookings (
  id               text primary key,
  -- Cheia generata de browser. UNIQUE = garantia anti-duplicat: doua
  -- cereri cu aceeasi cheie nu pot produce doua rezervari, nici macar
  -- daca ajung simultan.
  idempotency_key  uuid not null unique,
  -- Comunicat clientului. Independent de id-urile interne, ca sa nu
  -- expuna nimic despre volumul real de rezervari... desi fiind secvential
  -- dezvaluie ordinea; acceptabil pentru o pensiune, unde numarul e
  -- oricum tiparit pe documente.
  confirmation_number text not null unique,
  -- 128 de biti: pagina /confirmare/{token} nu poate fi enumerata.
  public_token     text not null unique default encode(gen_random_bytes(16),'hex'),
  guest_id         text references guests(id) on delete set null,
  group_id         text references res_groups(id) on delete set null,
  -- Rezervarile PMS produse de aceasta cerere. Array, nu tabel de
  -- legatura: se citesc mereu impreuna si nu se interogheaza individual.
  reservation_ids  text[] not null,
  checkin          timestamptz not null,
  checkout         timestamptz not null,
  rooms_count      int not null,
  total_amount     numeric not null,
  status           text not null default 'confirmed'
                     check (status in ('confirmed','cancelled')),
  request_ip       text,
  created_at       timestamptz not null default now(),
  check (checkout > checkin),
  check (rooms_count > 0)
);

create index public_bookings_token   on public_bookings (public_token);
create index public_bookings_created on public_bookings (created_at desc);
create index public_bookings_guest   on public_bookings (guest_id);

-- RLS activat, fara nicio politica: inaccesibil prin API pentru orice rol.
-- Se scrie si se citeste exclusiv din functiile security definer de mai
-- jos — acelasi model ca booking_attempts.
alter table public_bookings enable row level security;

-- Numarul de confirmare: prefix + secventa. Secventa, nu valoare
-- aleatoare, fiindca trebuie dictat la telefon si cautat usor; unicitatea
-- e garantata fara reincercari.
create sequence public_booking_seq start 1000;

create or replace function next_confirmation_number()
returns text language sql volatile set search_path = public as $$
  select 'LDV-' || lpad(nextval('public_booking_seq')::text, 6, '0');
$$;

revoke execute on function next_confirmation_number() from public, anon;
grant execute on function next_confirmation_number() to service_role;