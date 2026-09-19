# Traducerea paginii oaspetelui în 7 limbi

Document de arhitectură pentru internaționalizarea guest app-ului
(`src/guest/`, servit pe `guest.lalivada.ro`): pagina se deschide azi doar
în română, deși complexul primește și oaspeți străini. Cerută de
proprietar: traducere în engleză, franceză, italiană, germană, rusă și
ucraineană, cu alegerea limbii automată după limba telefonului, plus un
selector manual cu steaguri.

Scris pe baza codului din 19 septembrie 2026. Ce lipsește e marcat explicit
ca lipsă, nu presupus rezolvat.

---

## 0. Decizii luate (19 septembrie 2026)

Șase întrebări au primit răspuns înainte de a se scrie o linie de cod.

**Limbile: română (sursă) + engleză, franceză, italiană, germană, rusă,
ucraineană.** Șapte în total. Codurile ISO: `ro`, `en`, `fr`, `it`, `de`,
`ru`, `uk` (nu `ua` — codul de limbă ucrainean e `uk`, `UA` e doar codul de
țară).

**Traducerile le scrie Claude, aprobate de proprietar înainte de
livrare.** Nu traducere automată la afișare (API extern) și nu texte
aduse gata scrise de altcineva. Fiecare limbă se arată separat, într-un
fișier ușor de citit, înainte să intre în cod — mai ales pentru
regulament, unde formularea contează legal, și pentru pașii de instalare
pe telefon, unde textul trebuie să semene cu ce arată chiar sistemul de
operare în limba aia.

**Se traduce absolut tot**, inclusiv Regulamentul (25 de puncte, text
juridic transcris de la proprietar) și cele 10 descrieri de atracții
turistice — nu doar interfața și informațiile practice.

**Limba implicită pentru un telefon cu altă limbă decât cele 7:
engleză.** Nu română — un turist spaniol sau arab ajunge tot pe un text pe
care are șansa să-l înțeleagă.

**Steaguri emoji (🇷🇴 🇬🇧 🇫🇷 🇮🇹 🇩🇪 🇷🇺 🇺🇦), nu SVG desenate de mână.** Zero
cost în bundle, randate nativ de telefon — spre deosebire de restul
iconițelor din pagină (Usa, Foaie, Reper...), care sunt desenate de mână
tocmai ca să nu tragă o bibliotecă întreagă pentru câteva forme.
Excepția e intenționată: un steag e o formă recunoscută universal, pe
care emoji-ul o dă gratis, iar redesenarea a șapte steaguri n-ar adăuga
nimic ce oaspetele să observe.

**Alegerea manuală se ține minte.** Cine schimbă limba din selector nu e
întrebat din nou la următoarea deschidere a paginii — localStorage
câștigă în fața detectării automate.

---

## 1. Sursa de adevăr: un fișier de conținut per limbă

`src/guest/continut.js` (română) rămâne exact cum e azi — nicio schimbare
de formă, doar sursa pentru celelalte șase. Fiecare limbă nouă e un
fișier propriu, cu **exact aceeași formă** (aceleași chei exportate,
aceeași structură a obiectelor și array-urilor):

```
src/guest/continut.ro.js   (mutat, azi e continut.js)
src/guest/continut.en.js
src/guest/continut.fr.js
src/guest/continut.it.js
src/guest/continut.de.js
src/guest/continut.ru.js
src/guest/continut.uk.js
```

`continut.js` devine un fișier mic, care doar alege fișierul potrivit
după limba curentă (vezi §3) — restul componentelor importă din el, nu
direct dintr-un fișier de limbă, ca să nu fie nevoie să umble prin
`App.jsx` quando se adaugă a opta limbă într-o zi.

**Un test nou apără forma comună**, după modelul deja folosit la
`SABLON_IMPLICIT` din `src/lib/acces.js` (testul „fiecare variabilă din
șablon are o valoare cunoscută"): compară recursiv cheile celor șapte
fișiere și eșuează dacă una lipsește dintr-o limbă sau a rămas cu un tip
diferit (un string unde ar trebui un array, de pildă). Fără el, o
traducere nouă adăugată doar în română ar trece neobservată — oaspetele
străin ar vedea o secțiune goală sau, mai rău, un `undefined` scris pe
ecran.

---

## 2. Bundle-ul: două straturi, nu șapte copii încărcate deodată

Guest app-ul e construit deliberat mic, pentru un telefon deschis pe date
mobile în fața unei uși (vezi comentariile din `styles.js` și `Fereastra.jsx`
despre exact acest lucru). Șapte traduceri complete, toate în bundle-ul
principal, ar înmulți greutatea textului de șapte ori pentru fiecare
oaspete — inclusiv cel care nu va citi niciodată regulamentul.

**Strat mic, mereu încărcat:** etichetele de interfață (butoane, titluri,
mesaje de refuz, pașii de instalare pe ecranul principal) + `BUN_VENIT` +
`IMPORTANT`. Puțin text, necesar de la prima randare a paginii.

**Strat mare, încărcat doar la nevoie:** `REGULAMENT` (cel mai lung
conținut din tot fișierul) și `ATRACTII` (10 descrieri cu istorie locală).
Se aduc printr-un `import()` dinamic, declanșat DOAR când:
1. limba curentă e stabilită (nu se ghicește dinainte), și
2. oaspetele chiar deschide panoul respectiv.

Exact tiparul deja folosit de harta din „Cum ajungi la noi" (mutată luna
asta să nu se mai monteze decât la deschiderea cardului): un oaspete care
nu deschide niciodată regulamentul nu descarcă niciodată cele șase
traduceri ale lui, în nicio limbă.

---

## 3. Detectarea și schimbarea limbii

**La încărcare**, o funcție citește `navigator.languages` (lista completă,
în ordinea preferinței telefonului — nu doar `navigator.language`, primul
element) și ia prima intrare a cărei etichetă de limbă (primele două
litere, minuscule) se potrivește cu una din cele șapte. `en-US` și
`en-GB` devin amândouă `en`; `ro-RO` devine `ro`. Nicio potrivire →
`en` (decizia de la §0).

**localStorage** (o singură cheie, ex. `g-limba`) ține alegerea manuală.
La încărcare: dacă există o valoare salvată și e una din cele șapte, ea
câștigă; altfel se folosește detectarea de mai sus.

**Un React Context** (`LimbaContext`), pus la vârful `App.jsx`, ține
limba curentă și funcția de schimbare — orice componentă din arbore poate
citi limba sau o poate schimba, fără prop-uri plimbate din componentă în
componentă pe cinci niveluri.

---

## 4. Selectorul: un buton, aceeași fereastră de mereu

**Poziția:** un buton mic, cu steagul limbii curente, pus imediat înaintea
`<Vremea />`, pe rândul `.g-salut-sus` (unde stau azi ora zilei și vremea).

**La apăsare**, se deschide **`Fereastra.jsx`** — aceeași componentă
folosită deja de fișa de cazare, accesul către camere și regulament, cu
tot ce are ea: capcana de Tab (adăugată luna asta), Escape, clic pe
fundal, blocarea derulării, întoarcerea focusului. Nu se scrie o a doua
fereastră modală doar pentru limbă.

**Conținutul ferestrei:** șapte rânduri, fiecare un buton cu steagul și
numele limbii **în limba ei** — „Română", „English", „Français",
„Italiano", „Deutsch", „Русский", „Українська" — nu traduse unele în
altele. E convenția pe care o urmează orice aplicație cu selector de
limbă: omul își recunoaște limba dintr-o privire, chiar dacă nu știe cum
se zice „engleză" în greacă. Apăsarea unui rând schimbă limba, scrie în
localStorage și închide fereastra.

---

## 5. Partea întinsă: textul scris direct în componente

Pe lângă `continut.js`, zeci de șiruri stau scrise direct în JSX, în
`App.jsx` și `Fisa.jsx` — astea nu au cum să stea într-un fișier de
„conținut redacțional" separat, fiindcă sunt parte din logica de
interfață (etichete de câmp, mesaje de eroare, texte care depind de
starea rezervării). Categoriile găsite la citirea codului din 19
septembrie 2026:

- **Cardul de acces**: „Acces cameră", „Deschide ușa", „Sau tastează
  codul pe ușă", „Valabil până...", mesajul „Codul nu e încă pregătit...".
- **Ecranele de refuz** (`REFUZURI` din `App.jsx`): cod lipsă, cod
  necunoscut, sejur neînceput/încheiat/anulat, eroare generică.
- **Pașii de instalare pe ecranul principal** (`PASI_IOS`, `PASI_ANDROID`,
  `PASI_WIFI_IOS`): ATENȚIE SEPARATĂ — textul ăsta citează butoane reale
  din iOS și Android („Partajare", „Adaugă la ecranul principal"). O
  traducere generică poate să nu semene cu ce arată telefonul chiar în
  acea limbă. Marcat ca „de verificat pe un telefon real" în §7, nu
  livrat cu aceeași încredere ca restul.
- **Fișa de cazare** (`Fisa.jsx` + `lib/fisa.js`): etichetele câmpurilor
  (`CAMPURI`), tipurile de act (`ACT_TIPURI`), mesajele de eroare de
  validare, textul de ajutor Wi-Fi/asistență, butonul „Semnez și trimit".
- **Bannerul fișei, butoanele celor patru scurtături, „Cum ajungi la
  noi", ferestrele de acces și regulament** — titlurile și etichetele
  fixe din jurul lor.

Fiecare din astea se mută într-un mic dicționar de interfață (aceeași
formă pe limbă ca la §1: `interfata.ro.js`, `interfata.en.js`, ...), citit
prin `LimbaContext`. Nu e complicat tehnic — e doar mult, fiindcă
înseamnă atins fiecare loc din `App.jsx`/`Fisa.jsx` unde azi stă un șir
românesc scris direct în JSX.

---

## 6. Ce NU se traduce

- **Numele rețelei Wi-Fi** (`WIFI.retea`) — e un SSID pe care oaspetele
  îl tastează exact cum e scris pe telefon, nu text de citit.
- **Numele proprii** (Complex La Livada, Curtea Domnească, Ștefan cel
  Mare, Dino Parc) — dar descrierile din jurul lor, da.
- **Mesajul de WhatsApp/email** (`SABLON_IMPLICIT` din `src/lib/acces.js`)
  — rămâne doar în română. Alt build, altă audiență: îl scrie și îl vede
  recepționerul român înainte să apese trimite, nu oaspetele direct.
- **Numărul de telefon, adresa, coordonatele** — cifre, nu text.

---

## 7. Riscuri și de verificat

**Pașii de instalare (§5) trebuie verificați pe un telefon real, în
fiecare limbă**, nu doar traduși din română. Etichetele exacte ale
butoanelor Apple/Google diferă uneori de o traducere „firească" a
textului românesc.

**Regulamentul rămâne text juridic și în traducere.** Claude redactează
o traducere fidelă, dar valoarea ei legală într-un litigiu real ar trebui
confirmată separat, la nevoie, de cineva cu pregătire juridică în limba
respectivă — asta depășește ce poate garanta o traducere, oricât de
atentă.

**Bundle-ul se măsoară după implementare**, nu doar se presupune mai mic:
`npm run build:guest` arată greutatea fiecărui bundle; stratul mare
(regulament + atracții) ar trebui să apară ca fișiere separate, per
limbă, nu contopite în bundle-ul principal.

---

## 8. Ordinea livrării

| Pas | Ce | Livrabil singur |
|---|---|---|
| 1 | Infrastructura: `continut.ro.js` mutat, `LimbaContext`, detectare, localStorage, testul de formă comună | da, nimic vizibil încă (o singură limbă) |
| 2 | Selectorul: butonul, fereastra, cele 7 rânduri (fără traduceri reale încă, doar RO peste tot) | da, peste 1 |
| 3 | Traducerea stratului mic (interfață + Bun venit + Important) în cele 6 limbi, aprobată de proprietar | da, peste 1–2 |
| 4 | Traducerea stratului mare (Regulament + Atracții), cu `import()` dinamic per limbă | nu, cere 1 |
| 5 | Verificare în browser pe toate cele 7 limbi + măsurarea bundle-urilor | ultimul pas |

Pașii 1–3 dau deja o pagină funcțională în șapte limbi pentru tot ce
contează în primele secunde (ușa, codul, fișa, scurtăturile) — pasul 4
(regulament, atracții) poate urma separat, fără să blocheze restul.
