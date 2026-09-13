-- Fișa se scrie de oaspete, prin `guest_fisa_semneaza`, care e deschisă lui
-- `anon`: cine are un cod de sejur valid poate trimite orice text, de orice
-- lungime. Nicio coloană n-avea limită. Cea care contează e `semnatura_svg`
-- — un desen, deci exact câmpul în care încape un megabyte fără să pară
-- ciudat, iar baza e pe planul gratuit.
--
-- Măsurat pe fișele reale: semnătura cea mai mare are 1247 de caractere
-- (media 787), user-agent 137, adresa 34. Plafoanele de mai jos sunt cu
-- ordine de mărime peste, deci nu pot deranja un oaspete adevărat.
--
-- Funcția prinde deja `check_violation` și întoarce „date-incomplete", fără
-- să spună ce câmp — deci un refuz arată la fel ca oricare altul.
alter table fise_cazare
  add constraint fise_cazare_semnatura_marime
  check (length(semnatura_svg) <= 100000);

alter table fise_cazare
  add constraint fise_cazare_lungimi check (
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
  );