/* Fisa de anuntare a sosirii — logica pura.
 *
 * Traieste aici, nu in componenta, din acelasi motiv ca lib/acces.js: se
 * poate testa fara DOM, fara retea si fara baza, iar regula pe care o apara
 * e cea care se strica tacut. Un camp obligatoriu scapat dintr-o lista nu
 * da nicio eroare — da o fisa incompleta, aflata la un control.
 *
 * `sensibil` nu e o eticheta decorativa: campurile marcate asa nu se
 * precompleteaza NICIODATA si nu se citesc inapoi (docs/fisa-cazare.md 3).
 * Regula sta in date ca sa poata fi verificata de un test, nu doar promisa
 * intr-un comentariu.
 */

export const ACT_TIPURI = [
  { cheie: "ci",       eticheta: "Carte de identitate" },
  { cheie: "pasaport", eticheta: "Pașaport" },
  { cheie: "permis",   eticheta: "Permis de ședere" },
];

export const CAMPURI = [
  { cheie: "nume",           eticheta: "Nume",              obligatoriu: true,  sensibil: false },
  { cheie: "prenume",        eticheta: "Prenume",           obligatoriu: true,  sensibil: false },
  { cheie: "dataNasterii",   eticheta: "Data nașterii",     obligatoriu: true,  sensibil: true,  tip: "date" },
  { cheie: "loculNasterii",  eticheta: "Locul nașterii",    obligatoriu: true,  sensibil: true },
  /* Doua campuri, nu unul: coala tiparita scrie `guests.country` in
     amandoua, deci un roman cu domiciliul in Germania iesea cu „Germania"
     la nationalitate. Pe hartie trecea neobservat fiindca receptionerul
     corecta cu pixul. */
  { cheie: "nationalitate",  eticheta: "Naționalitate",     obligatoriu: true,  sensibil: false },
  { cheie: "tara",           eticheta: "Țara de domiciliu", obligatoriu: true,  sensibil: false },
  { cheie: "adresa",         eticheta: "Adresa",            obligatoriu: true,  sensibil: false },
  { cheie: "localitate",     eticheta: "Localitatea",       obligatoriu: true,  sensibil: false },
  { cheie: "scopul",         eticheta: "Scopul călătoriei", obligatoriu: true,  sensibil: false },
  { cheie: "actTip",         eticheta: "Act de identitate", obligatoriu: true,  sensibil: true,  tip: "alegere" },
  /* Seria NU e obligatorie: pasapoartele n-au serie separata, doar numar.
     Ceruta, ar fi blocat orice oaspete strain in fata usii. */
  { cheie: "actSeria",       eticheta: "Seria",             obligatoriu: false, sensibil: true },
  { cheie: "actNumarul",     eticheta: "Numărul",           obligatoriu: true,  sensibil: true },
];

/* Versiunea colii cu care se randeaza fisa. Se scrie in randul din baza si
   creste cand se schimba aspectul tiparit — vezi docs/fisa-cazare.md 4. */
export const SABLON_VERSIUNE = "fisa-2026-09";

const gol = (v) => v == null || String(v).trim() === "";

export function campuriLipsa(date) {
  return CAMPURI
    .filter((c) => c.obligatoriu && gol(date?.[c.cheie]))
    .map((c) => c.cheie);
}

/* Peste atat inseamna aproape sigur o cifra gresita la an, nu un oaspete
   centenar. Pragul e sus deliberat: mai bine trece o varsta ciudata decat
   sa fie refuzat cineva real. */
const ANI_MAXIM = 120;

export function valideazaFisa(date) {
  const erori = {};

  /* Toate erorile deodata, nu prima. Un formular care arata cate una pe rand
     se completeaza de trei ori, iar oaspetele e in fata usii. */
  for (const cheie of campuriLipsa(date)) {
    const c = CAMPURI.find((x) => x.cheie === cheie);
    erori[cheie] = `${c.eticheta} lipsește.`;
  }

  const d = date?.dataNasterii;
  if (!gol(d)) {
    const nasterea = new Date(d);
    if (Number.isNaN(nasterea.getTime())) {
      erori.dataNasterii = "Data nașterii nu e o dată validă.";
    } else if (nasterea > new Date()) {
      erori.dataNasterii = "Data nașterii nu poate fi în viitor.";
    } else {
      const ani = (Date.now() - nasterea.getTime()) / (365.2425 * 24 * 3600 * 1000);
      /* Mesajul spune ce sa verifice, nu ca a gresit: cel mai des e o cifra
         schimbata la an, iar „verifica" duce ochiul acolo. */
      if (ani > ANI_MAXIM) erori.dataNasterii = "Verifică anul nașterii.";
    }
  }

  const tip = date?.actTip;
  if (!gol(tip) && !ACT_TIPURI.some((t) => t.cheie === tip)) {
    erori.actTip = "Alege un tip de act din listă.";
  }

  return { ok: Object.keys(erori).length === 0, erori };
}
