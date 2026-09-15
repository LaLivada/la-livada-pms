# Documentația

O linie pe document: ce e, când a fost scris, ce a rămas din el. Fazele au
și **starea** implementării, punct cu punct, cu data la care s-a închis
fiecare. Un document nou se adaugă aici în același commit.

| Document | Ce e |
|---|---|
| [`audit-2026-09.md`](audit-2026-09.md) | Auditul tehnic din septembrie 2026 (date, cod, bundle-uri, producție) și planul pe faze 0–4; notele de stare de sub fiecare fază spun ce e făcut. Punctul de plecare pentru orice lucru nou. |
| [`faza1.md`](faza1.md) | Faza 1 — încărcare pe fereastră de timp, salvare per rând, oaspeți la cerere, raportul lunar în SQL, migrațiile în repo. Închisă pe 13 septembrie 2026. |
| [`faza2.md`](faza2.md) | Faza 2 — `room_status` ca tabel, Realtime, jurnal cu `room_id`/`reservation_id`, fus orar unificat, facturare atomică, erorile din producție în jurnal. Închisă pe 14 septembrie 2026, fără B5 (cere al doilea proiect Supabase). |
| [`faza3.md`](faza3.md) | Faza 3 — UX: căutare globală, scurtături, conflicte cu diff, offline, tabletă, fișă pliabilă, rapoarte cu delta și CSV, „nou de la ultima deschidere", schelet și timeout. Închisă pe 14 septembrie 2026. |
| [`faza4.md`](faza4.md) | Faza 4 — igienă continuă: README, indexul ăsta, `@ts-check` pe `lib`/`data`, spargerea fișierelor mari, stilurile inline. În lucru. |
| [`PR-audit-p0-p3.md`](PR-audit-p0-p3.md) | Auditul de producție de dinaintea celui din septembrie: cele 20 de constatări (P0–P3) rezolvate, plus 5 găsite pe parcurs — 7 commit-uri, teste, disaster recovery. |
| [`caldav.md`](caldav.md) | Serverul CalDAV al sălilor de evenimente, găzduit în PMS (funcția `caldav`), cu importul `.ics` de pe Synology și contul CalDAV per user; etapa 1 livrată pe 15 septembrie 2026. |
| [`disaster-recovery.md`](disaster-recovery.md) | Ce se face dacă baza dispare sau Supabase e indisponibil, în ce ordine; verificat pe 19 august 2026. Are și pașii pentru backup-ul periodic (workflow, secrete, cheia age). |
| [`guest-app.md`](guest-app.md) | Pagina oaspetelui, un link per cazare: ușă, cod de acces, detalii, minibar. Arhitectură și plan scrise pe codul din 3 septembrie 2026; implementată (`src/guest/`). |
| [`fisa-cazare.md`](fisa-cazare.md) | Fișa de cazare completată și semnată de oaspete în pagina lui, în locul hârtiei. Arhitectură, 7 septembrie 2026; implementată (`fise_cazare`, `src/guest/Fisa.jsx`). |
| [`fisa-cazare-plan.md`](fisa-cazare-plan.md) | Planul de implementare al fișei (pașii 1–3), cu casete de urmărire (nebifate pe parcurs); implementat. |
| [`shelly-integration.md`](shelly-integration.md) | Releele Shelly comandate din PMS, fără Home Assistant sau MQTT. Arhitectură verificată în documentația Shelly pe 20 august 2026; implementată pe 9 septembrie 2026 (`device-provider`). |
| [`philips-htng-plan.md`](philips-htng-plan.md) | Televizoarele Philips și HTNG, 11 septembrie 2026. Concluzia: Philips nu vorbește HTNG; planul spune ce se poate în loc. Doar plan, neimplementat. |
