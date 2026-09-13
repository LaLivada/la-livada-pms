-- Guest app, pasul 1 (partea a doua): poarta de acces si plafonul global.
-- Plan: docs/guest-app.md 4.2 si 4.4.

-- ---------------------------------------------------------------------
-- Contorul de cautari esuate
-- ---------------------------------------------------------------------
-- Cu un cod de cinci caractere, plafonul asta NU e o imbunatatire, e
-- lacatul: 62^5 = 916.132.832, iar cele ~18 sejururi in curs se ghicesc in
-- ~40 de milioane de incercari. La 200 de esecuri pe ora, aia inseamna 22
-- de ani. Vezi socoteala intreaga in docs/guest-app.md 4.1.
--
-- RLS activat, fara nicio politica: nimeni nu ajunge la tabel prin API.
-- Se scrie doar din guest_poarta, care fiind security definer ocoleste RLS
-- pentru propriile query-uri — acelasi tipar ca booking_attempts.
create table if not exists guest_code_attempts (
  id         bigint generated always as identity primary key,
  -- Codul incercat, retinut pentru analiza: o insiruire de coduri apropiate
  -- arata enumerare, nu greseli de tastare.
  cod        text,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists guest_code_attempts_created on guest_code_attempts (created_at desc);
create index if not exists guest_code_attempts_ip on guest_code_attempts (ip, created_at desc);
alter table guest_code_attempts enable row level security;

-- ---------------------------------------------------------------------
-- Poarta
-- ---------------------------------------------------------------------
-- Intoarce rezervarea SI motivul, in loc sa arunce exceptie. Nu e o
-- preferinta de stil, e o necesitate: o exceptie face rollback la toata
-- tranzactia, deci ar sterge chiar randul de contorizare pe care tocmai
-- l-am scris — plafonul n-ar mai numara niciodata nimic. (In
-- create_public_booking rollback-ul e dorit, fiindca acolo se numara
-- reusitele; aici se numara esecurile, deci regula se inverseaza.)
create or replace function guest_poarta(
  p_cod text,
  out rezervare reservations,
  out motiv text)
language plpgsql volatile security definer
set search_path = public as $$
declare
  PLAFON_GLOBAL constant int := 200;   -- esecuri pe ora, din orice sursa
  PLAFON_IP     constant int := 20;    -- esecuri pe ora, de la o adresa
  v_esecuri int;
  v_ip      text;
begin
  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''
    ), ',', 1), '');
  exception when others then
    v_ip := null;
  end;

  -- Auto-curatare, fara job separat, ca la booking_attempts.
  delete from guest_code_attempts where created_at < now() - interval '1 day';

  select count(*) into v_esecuri from guest_code_attempts
    where created_at > now() - interval '1 hour';
  if v_esecuri >= PLAFON_GLOBAL then
    motiv := 'prea-multe';
    return;
  end if;

  if v_ip is not null then
    select count(*) into v_esecuri from guest_code_attempts
      where ip = v_ip and created_at > now() - interval '1 hour';
    if v_esecuri >= PLAFON_IP then
      motiv := 'prea-multe';
      return;
    end if;
  end if;

  -- Forma gresita se opreste aici, fara sa mai atinga tabelul de rezervari.
  if p_cod is null or p_cod !~ '^[A-Za-z0-9]{5}$' then
    insert into guest_code_attempts (cod, ip) values (left(coalesce(p_cod, ''), 16), v_ip);
    motiv := 'necunoscut';
    return;
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
  -- src/lib/acces.js), iar legand linkul de status meostenim acea decizie in
  -- loc sa inventam a doua definitie a lui „e cazat acum".
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

-- Fiecare functie noua primeste EXECUTE pentru PUBLIC. Poarta e interna:
-- functiile de citire din pasul 2 o cheama din interior, iar ele fiind
-- security definer ruleaza ca proprietar, deci nu au nevoie de drept aici.
revoke execute on function guest_poarta(text) from public, anon, authenticated;
revoke execute on function guest_code_nou() from public, anon, authenticated;