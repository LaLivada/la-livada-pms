// @ts-check
/* Logica pura a accesului electronic la camere.
 *
 * Traieste aici, nu in functia edge, ca sa aiba o singura copie si sa poata
 * fi testata fara Deno si fara sa atinga TTLock. Folosita de amandoua:
 *   · PMS-ul (browser)          — decide CAND trebuie resincronizat codul;
 *   · access-provider (Deno)    — calculeaza perioada si randeaza mesajul.
 *
 * Nimic de aici nu face apeluri de retea si nu citeste din baza. Daca ceva
 * are nevoie de asta, nu are ce cauta in fisierul asta.
 */

/* Fusul si conversiile de ora s-au mutat in src/lib/timp.js (faza 2, B6:
   o singura definitie a „zilei" pentru tot PMS-ul). Raman exportate de aici
   pentru access-provider si pentru testele vechi. La deploy-ul functiei
   edge, src/lib/timp.js trebuie inclus alaturi de acces.js si tranzitii.js
   — importurile relative merg si prin el. */
import { FUS_HOTEL, decalajFus, laOraLocala } from "./timp.js";
export { FUS_HOTEL, decalajFus, laOraLocala };

/* Sfarsitul valabilitatii codului: ora de plecare a hotelului plus minutele
 * de gratie, in ziua plecarii.
 *
 * Minutele se aduna la ora, nu se scriu de mana ca "11:30": daca gratia
 * devine 45, sau ora de plecare 12, rezultatul iese corect fara sa umble
 * nimeni prin cod.  Minutele peste 59 se reporteaza singure — vezi laOraLocala. */
export function expirareCod(checkout, { grateMinute = 30 } = {}) {
  /* Ora vine din rezervarea insasi, nu din setari.
   *
   * Pana pe 4 septembrie 2026 setarea `checkoutHour` inlocuia ora rezervarii:
   * orice sejur expira la 11:00, oricat i-ar fi scris in `checkout`. Asta a
   * devenit fals in clipa in care receptia a capatat un ecran de unde poate
   * schimba orele unei cazari anume (vezi OreCazareModal) — o plecare mutata
   * la 09:00 ar fi ramas cu codul valabil pana la 11:30.
   *
   * Setarile raman ce erau de fapt tot timpul: valorile IMPLICITE cu care se
   * naste o rezervare noua (vezi ORA_SOSIRE_IMPLICITA/ORA_PLECARE_IMPLICITA),
   * nu un supracontrol la generarea codului.
   *
   * Gratia ramane setare, fiindca e o proprietate a casei, nu a sejurului:
   * cate minute peste ora scrisa mai lasi omul sa intre dupa bagaje. */
  const co = new Date(checkout);
  return new Date(co.getTime() + grateMinute * 60_000);
}

/* Inceputul valabilitatii codului: ora de sosire scrisa in rezervare.
 *
 * Pana pe 4 septembrie 2026 exista aici o exceptie — un check-in facut in
 * ziua sosirii pornea codul PE LOC, ca oaspetele ajuns la receptie sa nu
 * astepte o ora anume. Regula ceruta acum e insa una singura, limpede:
 * codul merge din ziua cazarii de la 14:00. Exceptia ar fi contrazis-o
 * tacut — un check-in facut dimineata la 9 ar fi deschis usa de la 9.
 *
 * Consecinta de retinut: un oaspete care vine mai devreme NU intra cu
 * codul pana la ora scrisa. Cand receptia vrea sa-l lase, muta ora de
 * sosire pe rezervarea lui (butonul „Orele cazarii" din ecranul de
 * editare) — codul se regenereaza singur pe fereastra noua. Portita e
 * explicita si lasa urma in jurnal, spre deosebire de vechea exceptie,
 * care se declansa singura. */
export function inceputCod(checkin) {
  return new Date(checkin);
}

/* Orele implicite ale casei: 14:00 sosire, 11:00 plecare. Traiesc aici, nu
   in formular, fiindca aceeasi pereche e folosita si de ecranul de creare a
   rezervarii, si de cel de editare a orelor. */
export const ORA_SOSIRE_IMPLICITA = 14;
export const ORA_PLECARE_IMPLICITA = 11;

/* Marcaj neutru pentru „ingrosat", nu markdown de nicaieri: **text** in
 * sablon. Pe WhatsApp devine *text* — sintaxa lui nativa de bold. Oriunde
 * altundeva (implicit; azi doar emailul, trimis ca text simplu) asteriscurile
 * dispar fara urma — ramase, ar fi aratat ca o greseala de tipar, nu ca
 * ingrosare. Un singur loc scrie ce trebuie ingrosat; fiecare canal isi
 * traduce singur semnul. Vezi docs/guest-app.md 5, nota din 18 septembrie
 * 2026. */
function ingroasaPeCanal(text, canal) {
  return text.replace(/\*\*(.+?)\*\*/g, canal === "whatsapp" ? "*$1*" : "$1");
}

/* Inlocuieste {{variabila}} in sablon. Variabilele lipsa devin sir gol, nu
 * raman ca {{...}} in mesajul trimis oaspetelui. */
export function randeazaSablon(sablon, valori, canal) {
  const cuValori = String(sablon || "").replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, cheie) => (valori && valori[cheie] != null ? String(valori[cheie]) : ""));
  return ingroasaPeCanal(cuValori, canal);
}

/* Linkul catre pagina oaspetelui.
 *
 * Codul sta in FRAGMENT, nu in cale: fragmentul nu se trimite niciodata
 * serverului, deci codul nu ajunge in logurile de acces ale Vercel. Motivul
 * intreg, si de ce nu e o cale, in docs/guest-app.md, 3.1.
 *
 * Cod lipsa da sir gol, nu o adresa fara cod: `guest.lalivada.ro/#` l-ar
 * duce pe oaspete drept in ecranul de link invalid, ceea ce e mai rau decat
 * sa nu primeasca link deloc. In practica nu se intampla — triggerul
 * `reservations_pune_guest_code` pune un cod la fiecare inserare, iar
 * randurile dinainte au fost completate la migratie (verificat in productie
 * pe 7 septembrie 2026: 134 de rezervari, niciun cod lipsa). */
export const ADRESA_GUEST = "https://guest.lalivada.ro";
export const linkOaspete = (cod) => (cod ? `${ADRESA_GUEST}/#${cod}` : "");

/* Numele pensiunii, cand `app_state` n-are `hotelName`. Aici, si nu scris de
   doua ori: e o valoare care apare in mesajul trimis oaspetelui, iar cele
   doua cai il compun acum din acelasi sablon. */
export const NUME_HOTEL_IMPLICIT = "Complex La Livada";

/* Numarul pus in mesaj, la „daca ai nevoie de ajutor".
 *
 * E numarul ASISTENTEI, nu cel general al complexului: mesajul asta se
 * reciteste in fata unei usi care nu se deschide, iar acolo trebuie omul
 * care raspunde in cateva minute, nu centrala.
 *
 * CU SPATII, nu lipit. Incercat lipit („+40725259999", 18 septembrie 2026,
 * la cererea initiala) si verificat pe un WhatsApp real: linkul auto-detectat
 * de telefon apare fara „+" in bula mesajului, desi textul trimis chiar il
 * contine — WhatsApp reformateaza randarea numarului detectat, nu ce s-a
 * trimis. Grupat pe spatii, ca in „scris" din ASISTENTA (guest/continut.js),
 * detectorul de telefon il recunoaste corect si pastreaza semnul.
 *
 * ACELASI NUMAR STA SI IN src/guest/continut.js, ca `ASISTENTA`. Nu se
 * importa de acolo si nu e o scapare: guest app-ul e alt build, cu alt
 * deploy, iar un import ar trage logica de acces a receptiei in pachetul
 * public. Daca numarul se schimba, se schimba in amandoua — de aceea sta
 * scris aici, cu numele lui, si nu ingropat in sablon. */
export const TELEFON_ASISTENTA = "+40 725 259 999";

/* Data si ora asa cum apar in mesajul trimis oaspetelui: „23 august 2026,
 * 11:30".
 *
 * FIXATA PE FUSUL HOTELULUI, nu pe cel al masinii care randeaza. Mesajul
 * pleaca din doua locuri — serverul, pentru email, si browserul receptiei,
 * pentru WhatsApp — iar un laptop lasat pe alt fus ar fi scris alta ora
 * decat emailul, pentru acelasi cod.
 *
 * Luna in litere si anul intreg, spre deosebire de formatele din
 * lib/format.js: acelea sunt pentru ecran, unde contextul e langa ele. Un
 * mesaj se reciteste peste doua zile, scos din orice context, iar „23.08,
 * 11:30" cere atunci un efort pe care „23 august 2026" nu-l cere.
 *
 * ZIUA SI ORA SE FORMATEAZA SEPARAT, si apoi se lipesc cu virgula. Cerute
 * impreuna, `ro-RO` le leaga cu „la" — „8 septembrie 2026 la 14:00" — iar
 * sablonul spune deja „Valabil de la ... pana la ...". Iesea „de la
 * 8 septembrie 2026 la 14:00 pana la 11 septembrie 2026 la 11:30", cu trei
 * „la" care nu inseamna acelasi lucru. Asa a scris emailul pana pe
 * 7 septembrie 2026; nimeni nu alesese formularea, venea din locale. */
const FMT_MESAJ_ZI = new Intl.DateTimeFormat("ro-RO", {
  timeZone: FUS_HOTEL, day: "numeric", month: "long", year: "numeric",
});
const FMT_MESAJ_ORA = new Intl.DateTimeFormat("ro-RO", {
  timeZone: FUS_HOTEL, hour: "2-digit", minute: "2-digit",
});
export const dataMesaj = (iso) => {
  const d = new Date(iso);
  return `${FMT_MESAJ_ZI.format(d)}, ${FMT_MESAJ_ORA.format(d)}`;
};

/* Numele din mesaj: PRENUMELE INTAI.
 *
 * `guestFullName` din lib/nume.js da invers — „Popescu Ion" — fiindca acolo
 * e ordinea de listare si de cautare, si asa ramane. Intr-un „Bună ..."
 * insa, ordinea aia suna a somatie. Pana pe 7 septembrie 2026 emailul si
 * WhatsApp-ul se salutau chiar asa, fiecare in ordinea lui.
 *
 * Primeste doua siruri, nu un obiect: serverul are `first_name`, browserul
 * are `firstName`, si ar fi trebuit sa stie una despre alta degeaba. Ce se
 * imparte aici e ORDINEA, adica exact lucrul care se despartise. */
export const numeInMesaj = (prenume, nume) =>
  [prenume, nume].filter(Boolean).join(" ").trim();

const doarCifre = (text) => String(text || "").replace(/[^\d]/g, "");

/* CINE PRIMESTE MESAJUL DE ACCES PE WHATSAPP.
 *
 * La o rezervare de grup, titularul rezerva pentru altcineva: ocupantul e cel
 * care doarme in camera, deci lui ii trebuie codul de la usa — nu celui care
 * a facut rezervarea. Pana acum butonul lua mereu telefonul titularului, deci
 * la un grup de zece camere toate cele zece coduri plecau pe acelasi numar.
 *
 * NUMELE URMEAZA TELEFONUL, nu se aleg separat. Un mesaj care incepe cu
 * „Bună, Ana" trimis pe telefonul lui Simion e o greseala vizibila pentru
 * amandoi, si exact genul de amestec pe care il face un cod care alege
 * destinatarul dintr-o parte si salutul din alta.
 *
 * Telefonul e cel care decide, nu numele: e singurul camp fara de care
 * mesajul n-are unde sa plece. Cand ocupantul are telefon dar n-are numele
 * scris, mesajul tot lui ii pleaca, doar ca salutul ramane generic —
 * preferabil unui mesaj adresat altcuiva.
 *
 * Emailul NU se schimba: ocupantul n-are camp de email, deci codul pe email
 * ramane al titularului. */
export function destinatarWhatsapp(rezervare, oaspete) {
  const cifreOcupant = doarCifre(rezervare?.occupantPhone);
  if (cifreOcupant) {
    return {
      cifre: cifreOcupant,
      nume: numeInMesaj(rezervare?.occupantFirstName, rezervare?.occupantLastName),
      esteOcupant: true,
    };
  }
  return {
    cifre: doarCifre(oaspete?.phone),
    nume: numeInMesaj(oaspete?.firstName, oaspete?.lastName),
    esteOcupant: false,
  };
}

/* Sablonul mesajului de acces — unul singur pentru amandoua caile.
 *
 * A stat pana pe 7 septembrie 2026 in access-provider/index.ts, iar
 * WhatsApp-ul isi avea in features/acces.jsx propria copie, scrisa de mana.
 * Cele doua apucasera deja s-o ia in directii diferite: emailul avea „Bine
 * ai venit la ...", WhatsApp-ul nu; WhatsApp-ul spunea „tasta de confirmare
 * #", emailul o spunea fara diez, desi diezul e cel corect; salutul iesea in
 * alta ordine, iar datele in alt format cu totul („23 august 2026, 11:30"
 * fata de „23.08, 11:30"). Nimeni nu hotarase nimic din toate astea — se
 * intamplasera, fiindca textul era scris de doua ori. De aceea a urcat aici,
 * unde il citesc amandoua.
 *
 * `**text**` e ingrosare, tradusa pe canal de `randeazaSablon` — vezi
 * `ingroasaPeCanal` mai sus si docs/guest-app.md 5 (nota din 18 septembrie
 * 2026). Nu s-a scris a doua oara sablonul ca sa aiba WhatsApp bold: canalul
 * decide semnul, textul ramane unul singur.
 *
 * Ramane configurabil din `app_state`, cheia `pms:access:v1`, campul
 * `messageTemplate`; asta e doar punctul de pornire. In productie campul nu
 * exista (verificat 7 septembrie 2026), deci textul de aici e cel trimis.
 *
 * UNDE SE RANDEAZA, si de ce difera. Emailul se randeaza pe SERVER: pleaca
 * de pe adresa pensiunii, deci continutul lui n-are voie sa poata fi rescris
 * din DevTools. WhatsApp-ul se randeaza in browser fiindca de acolo si
 * pleaca — receptionerul apasa trimite in aplicatia lui, cu textul sub ochi,
 * deci nu exista nimeni de pacalit. Sablonul e acelasi; doar locul randarii
 * difera, si difera cu motiv. */
export const SABLON_IMPLICIT = `Bună **{{guest_name}}** 👋

Bine ai venit la {{hotel_name}}!

Am rezervat pentru tine camera **{{room_number}}**.

Poți intra direct în cameră de pe pagina {{guest_link}}
De acolo vezi codul, regulile casei și ce e de vizitat prin zonă.

Poți intra și cu codul **{{access_code}}** urmat de tasta de confirmare **#**.
Accesul e valabil de la {{valid_from}} până la {{valid_until}}.

📞 Dacă ai nevoie de ajutor, poți suna la {{support_phone}}.`;

/* Ce trebuie facut cu codul dupa ce o rezervare s-a modificat.
 *
 *   "revoke"  — rezervarea nu mai e valida (anulata / no-show);
 *   "reissue" — perioada sau camera s-au schimbat, codul trebuie refacut;
 *   null      — nimic de facut.
 *
 * Separata de efectul propriu-zis ca sa poata fi testata: regula "cand" e
 * cea care se strica tacut, nu apelul de retea. */
export const STATUSURI_MOARTE = ["cancelled", "noshow"];

export function decideActiuneAcces(inainte, dupa) {
  if (!inainte || !dupa) return null;
  if (STATUSURI_MOARTE.includes(dupa.status)) return "revoke";

  const altaCamera = inainte.roomId !== dupa.roomId;
  const altaPerioada =
    new Date(inainte.checkin).getTime() !== new Date(dupa.checkin).getTime() ||
    new Date(inainte.checkout).getTime() !== new Date(dupa.checkout).getTime();

  return (altaCamera || altaPerioada) ? "reissue" : null;
}

/* Ce se întâmplă cu un cod DEJA EMIS, când `decideActiuneAcces` de mai sus a
 * cerut un "reissue" (sau receptia a apăsat explicit „Regenerează").
 *
 * Trei răspunsuri, în ordinea în care se pierde din codul vechi:
 *   "reuse"   — nimic nu s-a schimbat cu adevărat (interval ȘI yală identice
 *               cu ce e deja pe cod): se întoarce codul existent, fără
 *               niciun apel către yală.
 *   "resync"  — aceeași yală, alt interval: codul (PIN-ul oaspetelui) rămâne
 *               NESCHIMBAT, doar fereastra lui de valabilitate se mută pe
 *               yală (`keyboardPwd/change`). Cazul „Orele cazării".
 *   "replace" — yală diferită (camera s-a schimbat) sau regenerare cerută
 *               explicit: codul vechi se șterge, se creează altul.
 *
 * De ce contează să nu se schimbe PIN-ul la o simplă mutare de oră: oaspetele
 * a primit deja codul pe WhatsApp sau email înainte ca recepția să mute ora
 * de plecare cu 30 de minute — un cod nou l-ar lăsa cu mesajul greșit în
 * mână, în fața ușii.
 *
 * `existent` e rândul din `access_codes` AȘA CUM STĂ ÎN BAZĂ (snake_case:
 * `lock_id`, `valid_from`, `valid_until`), nu un obiect de ecran — funcția
 * asta rulează doar în funcția edge, care citește direct din Postgres.
 * `fortat` vine din butonul „Regenerează codul": cere un cod nou explicit,
 * chiar dacă intervalul n-a fost atins (vezi „Cerută explicit" în
 * access-provider/index.ts). */
export function actiuneCodExistent(existent, lockId, de, pana, fortat = false) {
  if (!existent) return "replace";
  const acelasiInterval =
    Math.abs(new Date(existent.valid_from).getTime() - de.getTime()) < 60_000 &&
    Math.abs(new Date(existent.valid_until).getTime() - pana.getTime()) < 60_000;
  const acelasiLock = existent.lock_id === lockId;
  if (!fortat && acelasiInterval && acelasiLock) return "reuse";
  if (!fortat && acelasiLock) return "resync";
  return "replace";
}

/* Genereaza un cod PIN.
 *
 * LUNGIMEA E O SETARE, nu o constanta. Ghidul oficial de integrare
 * (userGuide/passcodeEn) spune limpede: codurile ALESE DE TINE au 4-9
 * cifre, cele generate de sistem 6-9. Noi alegem codul (keyboardPwd/add),
 * deci 4 cifre sunt permise — pagina de referinta a endpoint-ului nu
 * mentioneaza nicio limita, ghidul da.
 *
 * Ramane setare fiindca alegerea e a hotelului, nu a codului: 4 cifre sunt
 * mai comode la tastat, 6 mai greu de ghicit.
 *
 * De retinut la 4 cifre: 10.000 de combinatii, fata de 1.000.000 la 6.
 * Pentru un cod valabil cateva zile pe o usa, diferenta e reala.
 *
 * `aleator` se poate inlocui in teste; implicit e generatorul criptografic.
 * Math.random n-are ce cauta intr-un cod care deschide o usa. */
export function genereazaCodPin(lungime = 6, aleator = globalThis.crypto) {
  if (!Number.isInteger(lungime) || lungime < 4 || lungime > 9) {
    throw new Error("Lungimea codului trebuie să fie un întreg între 4 și 9 cifre.");
  }
  const cifre = [];
  const octet = new Uint8Array(1);
  while (cifre.length < lungime) {
    aleator.getRandomValues(octet);
    /* Respingem 250-255. Fara asta, `octet % 10` ar face cifrele 0-5 sa
       apara mai des decat 6-9 — o partinire mica, dar gratuita intr-un cod
       de acces. 250 e multiplu de 10, deci restul e uniform. */
    if (octet[0] >= 250) continue;
    cifre.push(octet[0] % 10);
  }
  return cifre.join("");
}

/* Lungimea configurata, curatata: orice valoare aiurea din setari cade
   inapoi pe 6, nu arunca in mijlocul unui check-in. */
export function lungimeCod(setari) {
  const n = Number(setari?.codeLength);
  return Number.isInteger(n) && n >= 4 && n <= 9 ? n : 6;
}
