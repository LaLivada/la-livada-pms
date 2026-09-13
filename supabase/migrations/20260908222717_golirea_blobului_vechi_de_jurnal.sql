-- Cele 400 de intrări sunt deja în `activity_log`, verificate una câte una
-- (oră, acțiune și detaliu identice, zero neacoperite). Blobul rămâne ca
-- rând, gol, doar ca filele deschise cu bundle-ul vechi să aibă unde scrie
-- fără eroare — dar fără să mai țină numele oaspeților în `detail`, pe care
-- politica de citire i le lasă încă la îndemână unui cont de curățenie.
update app_state set value = '[]'::jsonb, updated_at = now()
 where key = 'pms:log:v3';