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

export const FUS_HOTEL = "Europe/Bucharest";

/* Decalajul fusului fata de UTC, in milisecunde, la un moment dat.
 *
 * Calculat, nu presupus: Romania e +2 iarna si +3 vara, iar un sejur poate
 * traversa schimbarea. O constanta ar fi gresita jumatate de an. */
export function decalajFus(d, fus = FUS_HOTEL) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: fus, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime();
}

/* Momentul exact al unei ore locale din ziua unui reper dat.
 *
 * `reper` spune CARE zi (in fusul hotelului), iar ore/minute spun ora din
 * acea zi. Trecem prin decalajul real al zilei respective, nu prin cel de
 * azi — altfel o plecare de la finalul lui octombrie ar iesi cu o ora
 * gresita, fix cand se schimba ora. */
export function laOraLocala(reper, ore, minute, fus = FUS_HOTEL) {
  const zi = new Intl.DateTimeFormat("en-CA", {
    timeZone: fus, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(reper));
  const [an, luna, ziua] = zi.split("-").map(Number);
  /* Prin Date.UTC, nu prin sir: "11:90" ca text da o data invalida, in timp
     ce Date.UTC reporteaza singur minutele peste 59 in ore si orele peste 23
     in zile. Conteaza fiindca minutele de gratie se aduna la ora de plecare
     si pot trece usor de 60. Gasit de teste, nu prin citire. */
  const estimare = new Date(Date.UTC(an, luna - 1, ziua, ore, minute, 0));
  return new Date(estimare.getTime() - decalajFus(estimare, fus));
}

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

/* Inlocuieste {{variabila}} in sablon. Variabilele lipsa devin sir gol, nu
 * raman ca {{...}} in mesajul trimis oaspetelui. */
export function randeazaSablon(sablon, valori) {
  return String(sablon || "").replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, cheie) => (valori && valori[cheie] != null ? String(valori[cheie]) : ""));
}

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
