-- =====================================================================
-- Codul de oaspete trece de la 5 la 8 caractere
-- =====================================================================
-- Socoteala veche, scrisa chiar in schema, presupunea 200 de cautari
-- esuate pe ora si iesea cu 22 de ani. Plafonul din cod era insa 5000,
-- de 25 de ori mai larg: 40 de milioane de ghiciri la 5000 pe ora inseamna
-- 8.000 de ore, adica 11 luni, nu 22 de ani. Argumentul si codul au stat
-- unsprezece randuri distanta si spuneau numere diferite.
--
-- Cu 8 caractere problema nu se mai negociaza:
--
--   62^8              = 218.340.105.584.896 de coduri
--   valabile deodata  = cate sejururi sunt in curs (~18)
--   ghiciri pt. 50%   = ~8,4 x 10^12
--   la 5000 pe ora    = ~192.000 de ani
--
-- Asta schimba natura apararii. Plafonul global nu mai are ce apara pentru
-- codurile noi, deci nu se mai aplica lor — si odata cu el dispare si
-- singurul mod in care un atacator putea inchide usa tuturor oaspetilor.

create or replace function guest_code_nou()
returns text language plpgsql volatile
set search_path = public as $$
declare
  ALFABET  constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  LUNGIME  constant int  := 8;
  v_cod   text;
  v_octet int;
begin
  loop
    v_cod := '';
    while length(v_cod) < LUNGIME loop
      -- gen_random_bytes, nu random(): random() e previzibil daca ii afli
      -- starea, iar un cod ghicibil din context ar anula toata socoteala
      -- de mai sus — acolo se presupune ca singura cale e ghicirea oarba.
      v_octet := get_byte(extensions.gen_random_bytes(1), 0);
      -- Respingere, nu modulo pe tot intervalul: 256 nu se imparte la 62,
      -- deci un `% 62` aplicat oricarui octet ar face primele 8 litere ale
      -- alfabetului mai probabile decat restul.
      if v_octet < 248 then
        v_cod := v_cod || substr(ALFABET, 1 + (v_octet % 62), 1);
      end if;
    end loop;
    exit when not exists (select 1 from reservations where guest_code = v_cod);
  end loop;
  return v_cod;
end $$;


-- =====================================================================
-- Poarta: plafonul global apara doar codurile vechi, de 5 caractere
-- =====================================================================
-- Aici era o intentie buna prost asezata. Plafonul global se verifica
-- INAINTE de cautare, iar cand se umplea raspundea 'prea-multe' tuturor —
-- inclusiv oaspetelui cazat, cu codul lui bun, in fata usii. Cu 250 de
-- adrese se puteau arde 5000 de esecuri pe ora si ramaneau toti pe dinafara.
--
-- Mutarea verificarii dupa cautare NU e solutia, desi pare: singura functie
-- de securitate a plafonului e refuzul de a raspunde. Daca un cod valid s-ar
-- servi oricum, atacatorul ar primi datele exact in clipa in care nimereste,
-- iar plafonul ar deveni decorativ.
--
-- Solutia e ca plafonul sa nu mai fie necesar. La 8 caractere nu e, deci se
-- aplica doar cand codul cerut are 5 — adica doar codurilor mostenite, cate
-- mai sunt. Cine are cod nou nu poate fi blocat de nimeni, niciodata.
--
-- DUPA ce se incheie ultimul sejur cu cod de 5 (13 septembrie 2026):
-- regexul devine {8}, iar tot blocul PLAFON_GLOBAL se sterge.

create or replace function guest_poarta(p_cod text, out rezervare reservations, out motiv text)
returns record language plpgsql security definer
set search_path = public as $$
declare
  PLAFON_GLOBAL constant int := 200;  -- doar pentru codurile de 5; cifra din socoteala originala
  PLAFON_IP     constant int := 20;   -- esecuri pe ora, de la o adresa
  PLAFON_FARA_IP constant int := 100; -- esecuri pe ora, cand adresa nu se stie
  v_esecuri int;
  v_ip      text;
  v_vechi   boolean;
begin
  begin
    v_ip := ip_client();
  exception when others then
    v_ip := null;
  end;

  -- Auto-curatare, fara job separat, ca la booking_attempts.
  delete from guest_code_attempts where created_at < now() - interval '1 day';

  -- Forma gresita se opreste aici, fara sa mai atinga tabelul de rezervari.
  -- Doua lungimi cat tine trecerea: 8 pentru codurile noi, 5 pentru cele
  -- mostenite. Nimic intre ele, ca lungimea sa spuna limpede care e care.
  if p_cod is null or p_cod !~ '^([A-Za-z0-9]{5}|[A-Za-z0-9]{8})$' then
    insert into guest_code_attempts (cod, ip) values (left(coalesce(p_cod, ''), 16), v_ip);
    motiv := 'necunoscut';
    return;
  end if;

  v_vechi := length(p_cod) = 5;

  -- Plafonul global: numai pentru codurile vechi. Pentru cele de 8 caractere
  -- ghicirea e imposibila in practica, deci un plafon global n-ar apara
  -- nimic — ar oferi doar unui atacator butonul de inchis usile tuturor.
  if v_vechi then
    select count(*) into v_esecuri from guest_code_attempts
      where created_at > now() - interval '1 hour';
    if v_esecuri >= PLAFON_GLOBAL then
      motiv := 'prea-multe';
      return;
    end if;
  end if;

  -- Plafonul pe adresa. Adresa necunoscuta NU mai e o scutire, cum era:
  -- `if v_ip is not null` sarea peste verificare cu totul, deci necunoscutul
  -- deschidea poarta larga in loc s-o inchida. Acum e o galeata a ei, mai
  -- larga fiindca poate aduna mai multi oameni la un loc.
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
    -- n-a inceput sau s-a terminat, e un oaspete, nu un atacator.
    insert into guest_code_attempts (cod, ip) values (p_cod, v_ip);
    rezervare := null;
    motiv := 'necunoscut';
    return;
  end if;

  -- Fereastra de valabilitate: legata de status, nu de o comparatie de date.
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