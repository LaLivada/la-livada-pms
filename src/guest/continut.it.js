/* Continutul editorial in italiana, tradus si aprobat 19 septembrie 2026.
 * Aceeasi forma (aceleasi chei) ca in continut.ro.js — verificat de
 * continut-forme.test.js. REGULAMENT si ATRACTII_TEXT raman re-export
 * pana la Task 7 (stratul mare, incarcat leneș). */

export const asistentaRaspuns = "risponde entro pochi minuti";

export const BUN_VENIT = {
  intro: "Siamo felici di averti qui e ti auguriamo un piacevole soggiorno.",
  puncte: [
    {
      titlu: "Wi-Fi gratuito",
      inainte: "La rete ",
      dupa: ", senza password.",
      actiune: "wifi",
    },
    {
      titlu: "Salva la pagina sul telefono",
      text: "Il codice e il pulsante di apertura restano a portata di mano per tutto il soggiorno.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Fumo", text: "Vietato in camera e negli spazi interni — è consentito all'esterno. Fumare in camera comporta un addebito di 500 lei." },
  { titlu: "Silenzio", text: "Ti chiediamo di mantenere il silenzio tra le 22:00 e le 8:00." },
  { titlu: "Animali", text: "Benvenuti, con un supplemento di 50 lei a soggiorno." },
  { titlu: "Parcheggio", text: "Gratuito in loco, a rischio del proprietario dell'auto." },
];

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Entra dal parcheggio a destra e segui il senso di marcia." },
  { fisier: "2-aleea.jpg",    descriere: "A questo cartello continua dritto." },
  { fisier: "3-parcarea.jpg", descriere: "Sei arrivato al parcheggio." },
  { fisier: "4-poteca.jpg",   descriere: "L'accesso alle camere avviene tramite il vialetto a destra, davanti al Grand'Or Ballroom." },
];

export { REGULAMENT, ATRACTII_TEXT } from "./continut.ro.js"; // inca netraduse — Task 7 (stratul mare, §2 din spec)
