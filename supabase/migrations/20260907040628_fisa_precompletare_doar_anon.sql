-- Retrage `authenticated`, adaugat din greseala la migrarea precedenta.
--
-- Suprafata oaspetelui se cheama cu cheia publicabila, deci `anon`, si atat:
-- guest_stay_by_cod si guest_fisa_semneaza au exact acest drept. Un drept in
-- plus n-ar fi scurs nimic (totul trece tot prin guest_poarta), dar un drept
-- pe care nimeni nu-l foloseste e unul pe care nimeni nu-l mai verifica.
revoke execute on function public.guest_fisa_precompletare(text) from authenticated;