do $outer$
declare v_def text; v_nou text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_public_booking';

  v_nou := replace(v_def,
    'if v_nr_camere < 1 or v_nr_camere > 8 then',
    'if v_nr_camere < 1 or v_nr_camere > (select count(*) from rooms where active) then');
  v_nou := replace(v_nou,
    'raise exception ''Se pot rezerva între 1 și 8 camere odată.'';',
    'raise exception ''Se pot rezerva între 1 și % camere odată.'', (select count(*) from rooms where active);');

  if v_nou = v_def then
    raise exception 'Nu s-a schimbat nimic — textul plafonului nu a fost gasit.';
  end if;

  execute v_nou;
end $outer$;