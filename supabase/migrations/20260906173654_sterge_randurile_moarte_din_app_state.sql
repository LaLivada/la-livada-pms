-- Curatenie ceruta explicit de Ovidiu dupa auditul de securitate.
--
-- Sase randuri `pms_*_v1` cu valoarea jsonb `null` — nimic in ele — plus
-- `pms:reservations:v3`, care tinea 7 rezervari-samanta din 16 august 2026
-- (`grp-seed`, `guestId` g1/g2), ramase de dinainte ca rezervarile sa se mute
-- in tabelul `reservations`.
--
-- Niciunul nu mai e citit: `src/data/stare-partajata.js` defineste cheile
-- K.res / K.groups / K.blocks, dar cautarea in tot src/ arata ca doar `core`,
-- `hk` si `log` ajung in loadShared. Rezervarile reale stau in tabelul lor.
--
-- Cat stateau acolo, erau date vechi citite de oricine se logheaza: politica
-- de SELECT pe app_state e `using (true)`.
--
-- Copie de siguranta cu continutul exact, inainte de stergere, in
-- scratchpad-ul sesiunii: app_state-randuri-sterse-2026-09-06.sql
delete from app_state
 where key in ('pms_blocks_v1', 'pms_core_v1', 'pms_groups_v1',
               'pms_housekeeping_v1', 'pms_log_v1', 'pms_reservations_v1',
               'pms:reservations:v3');