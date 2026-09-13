-- Contorul general: un Shelly Pro 3EM care masoara consumul pe cele trei
-- faze (R, S, T = fazele 1, 2, 3 din API: a, b, c).
--
-- Sta in acelasi tabel ca releele, nu intr-unul separat, fiindca tot ce e in
-- jurul lui e identic: acelasi cont Shelly, acelasi apel de status in loturi,
-- aceeasi functie edge. Difera doar ce se citeste din raspuns si faptul ca
-- nu se comanda — un contor n-are ce porni.
--
-- Nu are randuri in `device_rooms`: masoara toata pensiunea, nu o camera.

alter table devices drop constraint devices_kind_check;
alter table devices add constraint devices_kind_check
  check (kind in ('boiler', 'iluminat_exterior', 'prize', 'contor', 'altul'));

insert into devices (id, provider, provider_device_id, device_gen, device_model,
                     kind, channel, name)
values ('dv-441d647468c8-0', 'shelly', '441d647468c8', 'gen2', 'Shelly Pro 3EM',
        'contor', 0, 'Contor general')
on conflict (provider, provider_device_id, channel) do nothing;