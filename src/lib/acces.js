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
export function expirareCod(checkout, { oraPlecare = 11, minutePlecare = 0, grateMinute = 30 } = {}) {
  return laOraLocala(checkout, oraPlecare, minutePlecare + grateMinute);
}

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
