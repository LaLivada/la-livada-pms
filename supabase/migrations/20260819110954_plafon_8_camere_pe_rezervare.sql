-- Ridica plafonul de camere pe o rezervare de la 5 la 8.
--
-- Cu alocarea automata, un grup de 12 persoane are nevoie de 5 camere
-- (3+3+3+2+2, fiindca doar 3 camere au 3 locuri), deci era exact pe
-- limita; 13 persoane nu mai incapeau. 8 camere acopera pana la 19
-- persoane, plafonul intors de public_capacity().
--
-- Patch pe definitia vie, prin replace, ca sa nu rescriu 7000 de caractere
-- de mana si sa strecor o diferenta fata de ce ruleaza acum.
do $outer$
declare v_def text; v_nou text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_public_booking';

  if v_def is null then
    raise exception 'create_public_booking nu a fost gasita.';
  end if;

  v_nou := replace(v_def, 'v_nr_camere > 5', 'v_nr_camere > 8');
  v_nou := replace(v_nou, 'între 1 și 5 camere', 'între 1 și 8 camere');

  if v_nou = v_def then
    raise exception 'Nu s-a schimbat nimic — textul plafonului nu a fost gasit.';
  end if;

  execute v_nou;
end $outer$;