# Sălile de evenimente și serverul CalDAV

*Etapa 1, 15 septembrie 2026.* PMS-ul găzduiește calendarele sălilor de
evenimente și le servește prin CalDAV, ca aplicația Calendar de pe iPhone
sau Mac să le vadă și să scrie în ele. Înlocuiește calendarul de pe
Synology; evenimentele nu au nicio legătură cu rezervările pe camere
(blocarea camerelor în zilele cu evenimente vine într-o etapă următoare).

## Piese

| Ce | Unde |
|---|---|
| Serverul CalDAV (protocol pur, testat din vitest) | `supabase/functions/caldav/servitor.ts` |
| iCalendar: parsare, momente, rezumat, împărțirea unui export în obiecte | `supabase/functions/caldav/ics.ts` |
| XML-ul cererilor WebDAV | `supabase/functions/caldav/xml.ts` |
| Intrarea Deno: Basic auth, depozitul pe Supabase, importul .ics | `supabase/functions/caldav/index.ts` |
| Tabelele `caldav_calendare`, `caldav_obiecte`, `caldav_conturi` | migrarea `20260915152127_sali_caldav` |
| Ecranul „Săli și CalDAV” (admin) și panoul din „Contul tău” | `src/features/caldav.jsx`, `src/data/caldav.js` |
| Teste | `src/caldav-ics.test.js`, `src/caldav-servitor.test.js` |

Funcția e deployată cu `--no-verify-jwt`: clienții CalDAV trimit
`Authorization: Basic`, nu JWT Supabase. Validarea e în funcție.

## Cum se folosește

1. **Admin, Setări → Săli și CalDAV**: adaugă câte un calendar pentru
   fiecare sală (nume, culoare). Pentru mutarea de pe Synology: exportă
   fiecare calendar ca `.ics` din Synology Calendar și importă-l în sala
   lui cu butonul de import. Importul împarte fișierul în obiecte per UID
   (o serie recurentă cu excepțiile ei rămâne un singur obiect), copiază
   VTIMEZONE-urile și ignoră VTODO. Re-importul nu creează dubluri.
2. **Fiecare user, Useri și drepturi → Contul tău**: „Generează parola”.
   Parola apare o singură dată; în bază stă doar SHA-256 al ei. Apoi, pe
   iPhone: Configurări → Aplicații → Calendar → Conturi → Adaugă cont →
   Altul → Adaugă cont CalDAV, cu serverul
   `https://<project>.supabase.co/functions/v1/caldav/principals/<email>/`,
   utilizatorul = emailul de login, parola generată. Pe Mac: cont CalDAV
   „Avansat”, cu adresa serverului, calea de mai sus, portul 443 și SSL.
3. Calendarele noi se creează doar din PMS. `MKCALENDAR` nu trece de
   poarta Supabase (răspunde 501), deci telefonul nu poate crea calendare
   sub acest cont; nici nu e nevoie.

## Protocolul, pe scurt

- `PROPFIND` pe `/`, `/principals/<user>/`, `/calendars/` (adâncime 1
  listează calendarele), `/calendars/<slug>/` (adâncime 1 listează
  obiectele), `/calendars/<slug>/<href>`.
- `REPORT` pe calendar: `calendar-query` (cu `time-range`; seriile
  recurente se întorc mereu), `calendar-multiget`, `sync-collection`
  (token = `https://pms.lalivada.ro/caldav/sync/<calendar>/<ctag>`; token
  străin sau din viitor → 403 `valid-sync-token`, clientul reia de la zero).
- `PUT` cu `If-None-Match: *` / `If-Match`, 201/204 cu `ETag`; UID dublu
  la alt href → 412 `no-uid-conflict`; `DELETE` lasă o piatră de mormânt
  (`sters = true`) cu `sync_seq`-ul ștergerii.
- `PROPPATCH` pe calendar: `displayname`, `calendar-color`,
  `calendar-order` se salvează; restul primesc 403 în propstat.
- `getctag` și `sync-token` vin din `caldav_calendare.ctag`, incrementat
  de triggerul `caldav_obiecte_schimbare` la orice scriere; același trigger
  pune `etag = md5(ics)`.

## Ce nu face (încă)

- Nu expune evenimentele în ecranele PMS (etapa 2: ecranul „Evenimente”).
- Nu blochează camerele în zilele cu evenimente (etapa 3).
- Fără invitații/`schedule-inbox`, fără VTODO, fără `.well-known` pe
  domeniul supabase.co (contul se adaugă cu adresa completă a serverului).
