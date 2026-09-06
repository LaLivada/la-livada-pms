/* Textele redactionale din pagina oaspetelui.
 *
 * Stau separat de App.jsx dintr-un motiv practic: cine vrea sa schimbe o
 * regula sau sa adauge o atractie nu trebuie sa deschida un fisier de
 * interfata si sa nimereasca printre hook-uri. Aici e doar text.
 *
 * Ce NU se pune aici: nimic care depinde de rezervare. Ora de plecare,
 * codul de acces si valabilitatea lui vin din baza, pentru fiecare sejur
 * in parte, si se compun in App.jsx. Daca ar fi scrise aici ar fi corecte
 * pana la prima exceptie si gresite dupa.
 */

/* Numarul de la receptie, singurul punct de contact din pagina. */
export const TELEFON = "+40722899899";
export const TELEFON_SCRIS = "+40 722 899 899";

/* „Bun venit". Un rand de intampinare si cateva lucruri de stiut din prima
   clipa. Punctele sunt perechi titlu/text. */
export const BUN_VENIT = {
  intro: "Ne bucurăm că ești aici.",
  puncte: [
    {
      titlu: "Pagina asta rămâne a ta",
      text: "Salveaz-o pe ecranul telefonului: ține codul de acces și butonul de deschidere pentru tot sejurul.",
    },
    {
      titlu: "Orice, la un telefon distanță",
      text: `Dacă ceva nu merge sau ai nevoie de ceva, sună-ne la ${TELEFON_SCRIS}.`,
    },
  ],
};

/* „Important". Reguli si lucruri de tinut minte care sunt aceleasi pentru
   toata lumea. Cele care depind de rezervare (ora de plecare, valabilitatea
   codului) se adauga in App.jsx, inaintea acestora.

   LISTA E DELIBERAT SCURTA. Contine doar ce se poate verifica din datele
   proprietatii. Fumatul, animalele de companie, ora de liniste si accesul
   in zonele comune se adauga aici cand sunt confirmate — pana atunci
   lipsesc, in loc sa fie inventate. */
export const IMPORTANT = [];

/* „Atracții". Locuri de vizitat in imprejurimi.
   GOALA PANA CAND E COMPLETATA DE PROPRIETAR: o lista de atractii scoasa
   din burta e mai rea decat un buton care spune cinstit ca nu are inca
   nimic. Forma unei intrari: { titlu, text, distanta } — de exemplu
   { titlu: "Salina Turda", text: "…", distanta: "35 km" }. */
export const ATRACTII = [];
