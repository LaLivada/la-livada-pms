-- Coloanele astea au fost facute pentru un workflow n8n -> Home Assistant
-- care n-a fost construit niciodata. `shelly_id` si `vent_id` erau goale pe
-- toate cele 16 camere; `sensibo_id` continea doar valorile-sablon generate
-- de seed ('sensibo-' || numele camerei), nu ID-uri reale de dispozitiv.
--
-- Ce le inlocuieste: tabelul `devices`, care leaga canalele Shelly de camere
-- prin `device_rooms`. Modelul vechi presupunea un dispozitiv per camera, ceea
-- ce nu descrie montajul real — boilerul si iluminatul exterior sunt comune
-- cate doua camere.
alter table rooms drop column shelly_id;
alter table rooms drop column vent_id;
alter table rooms drop column sensibo_id;