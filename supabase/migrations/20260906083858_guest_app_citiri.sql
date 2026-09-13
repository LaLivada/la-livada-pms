-- Guest app, pasul 2: citirile. Plan: docs/guest-app.md, sectiunea 8.
--
-- Toate trei sunt security definer si intorc un jsonb construit CAMP CU
-- CAMP, niciodata `select *`. Regula din 4.3: din server nu ies datele
-- altor rezervari, lock_id-ul yalei, preturi interne sau notele receptiei.

-- ---------------------------------------------------------------------
-- Minibarul: fara tabel nou, doar doua coloane pe products
-- ---------------------------------------------------------------------
-- `public_visible` exista fiindca nu tot ce e in products are ce cauta sub
-- ochii oaspetelui: grila contine si pozitii de uz intern.
alter table products add column if not exists public_description text;
alter table products add column if not exists public_visible boolean not null default false;

-- ---------------------------------------------------------------------
-- Sejurul
-- ---------------------------------------------------------------------
create or replace function guest_stay_by_cod(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p record;
  v_nume text;
  v_camera record;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  select r.name, r.type into v_camera from rooms r where r.id = (v_p.rezervare).room_id;

  -- Numele afisat, cu regula din 4.3. Ocupantul camerei daca e trecut;
  -- altfel eticheta grupului. NU numele platitorului cand ocupantul e
  -- altcineva — intr-un grup, titularul e o persoana straina de camera
  -- asta, iar datele lui n-au ce cauta pe ecranul altcuiva.
  v_nume := nullif(trim(concat_ws(' ',
    (v_p.rezervare).occupant_first_name, (v_p.rezervare).occupant_last_name)), '');

  if v_nume is null and (v_p.rezervare).group_id is not null then
    select nullif(trim(g.name), '') into v_nume
      from res_groups g where g.id = (v_p.rezervare).group_id;
  end if;

  -- Fara ocupant si fara grup, platitorul CHIAR e ocupantul.
  if v_nume is null and (v_p.rezervare).group_id is null then
    select nullif(trim(concat_ws(' ', gu.first_name, gu.last_name)), '') into v_nume
      from guests gu where gu.id = (v_p.rezervare).guest_id;
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
      'children',  (v_p.rezervare).children
    ));
end $$;

-- ---------------------------------------------------------------------
-- Codul de acces
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Meniul de minibar
-- ---------------------------------------------------------------------
-- Fara cod: e un meniu de bauturi, nu o informatie legata de cineva anume,
-- iar o lista de preturi nu spune nimic despre niciun oaspete. Preturile
-- sunt CU TVA inclus — asa e conventia din toata aplicatia (vezi
-- calcAmounts in src/lib/money.js), deci nu se mai calculeaza nimic aici.
--
-- Doar afisare. Auto-declararea consumului a fost respinsa explicit (5.2):
-- ar fi insemnat scriere pe facturare dintr-un link public.
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

-- ---------------------------------------------------------------------
-- Drepturi
-- ---------------------------------------------------------------------
-- Astea TREI sunt singurele care ies la vizitator. Poarta ramane interna;
-- ele o cheama din interior, fiind ele insele security definer.
-- Revocare de la public intai: fara ea, `grant to anon` n-ar schimba nimic,
-- fiindca EXECUTE pentru PUBLIC e deja acolo, implicit.
revoke execute on function guest_stay_by_cod(text)        from public, authenticated;
revoke execute on function guest_access_code_by_cod(text) from public, authenticated;
revoke execute on function guest_minibar()                from public, authenticated;
grant  execute on function guest_stay_by_cod(text)        to anon, service_role;
grant  execute on function guest_access_code_by_cod(text) to anon, service_role;
grant  execute on function guest_minibar()                to anon, service_role;