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
| [`caldav.md`](caldav.md) | Serverul CalDAV al sălilor de evenimente, găzduit în PMS (funcția `caldav`), cu importul `.ics` de pe Synology și contul CalDAV per user; etapa 1 livrată pe 15 septembrie 2026; ecranul „Evenimente” (calendar pe ani, serverul & săli). |
| [`disaster-recovery.md`](disaster-recovery.md) | Ce se face dacă baza dispare sau Supabase e indisponibil, în ce ordine; verificat pe 19 august 2026. Are și pașii pentru backup-ul periodic (workflow, secrete, cheia age). |
| [`guest-app.md`](guest-app.md) | Pagina oaspetelui, un link per cazare: ușă, cod de acces, detalii, minibar. Arhitectură și plan scrise pe codul din 3 septembrie 2026; implementată (`src/guest/`). |
| [`fisa-cazare.md`](fisa-cazare.md) | Fișa de cazare completată și semnată de oaspete în pagina lui, în locul hârtiei. Arhitectură, 7 septembrie 2026; implementată (`fise_cazare`, `src/guest/Fisa.jsx`). |
| [`fisa-cazare-plan.md`](fisa-cazare-plan.md) | Planul de implementare al fișei (pașii 1–3), cu casete de urmărire (nebifate pe parcurs); implementat. |
| [`shelly-integration.md`](shelly-integration.md) | Releele Shelly comandate din PMS, fără Home Assistant sau MQTT. Arhitectură verificată în documentația Shelly pe 20 august 2026; implementată pe 9 septembrie 2026 (`device-provider`). |
| [`oblio.md`](oblio.md) | Facturarea prin Oblio.eu: Oblio dă seria, numărul, PDF-ul și e-Factura, PMS-ul păstrează copia; ce se întâmplă la fiecare eșec; configurarea. Implementată pe 16 septembrie 2026. |
| [`oblio-plan.md`](oblio-plan.md) | Planul de implementare al facturării prin Oblio.eu (Oblio dă seria, numărul, PDF-ul și e-Factura; PMS-ul păstrează copia): 8 sarcini cu teste și commit-uri, scris și implementat pe 16 septembrie 2026. |
| [`rezervari-legal.md`](rezervari-legal.md) | Paginile legale de pe rezervari.lalivada.ro cerute de NETOPIA (termeni, livrare, anulare, retragere, confidențialitate, cookies), antetul și subsolul ca partiale Vite, formularul de retragere cu funcția edge `retragere` și tabela `cereri_retragere`; 16 septembrie 2026. |
| [`ical-ota-plan.md`](ical-ota-plan.md) | Planul de sincronizare `.ics` cu Airbnb și Booking.com, în locul unui channel manager plătit (Channex/Beds24/Smoobu verificate, toate 90-180 €/lună la 16 camere — peste buget). Funcția `ical-import`, tabelul `camere_calendare_ota`, reutilizarea parserului ICS din `caldav`. Scris pe 16 septembrie 2026, neimplementat. |
| [`aiosell-plan.md`](aiosell-plan.md) | Alternativă la planul iCal: Aiosell are API documentat public și webhook real (instant, cu datele oaspetelui când OTA le oferă), posibil sub buget (10 $/lună „per Hotel", de confirmat cu suportul lor). Funcțiile `aiosell-push`/`aiosell-webhook`, reutilizează `allocate_group` și mecanismul de conflict din planul iCal. Scris pe 16 septembrie 2026, preț neconfirmat, neimplementat. |
| [`netopia-plan.md`](netopia-plan.md) | Plata cu cardul pe rezervari.lalivada.ro: card ca opțiune principală, cash/transfer dedesubt. API v1 NETOPIA cu redirect complet (nu fereastră suprapusă — CSP-ul lor o blochează; v2 ar cere cardul brut pe serverul nostru). Rambursare la anulare manuală (API-ul de refund NETOPIA nu e încă lansat). Funcțiile `netopia-start`/`netopia-ipn`. Scris pe 17 septembrie 2026, neimplementat. |
| [`guest-app-i18n.md`](guest-app-i18n.md) | Traducerea guest app-ului în 7 limbi (RO sursă + EN/FR/IT/DE/RU/UK), cu detectare automată după limba telefonului și selector cu steaguri emoji. Un fișier de conținut per limbă, regulamentul și atracțiile încărcate cu `import()` dinamic doar la deschidere. Scris pe 19 septembrie 2026, neimplementat. |
