/* Regula dublului tap, scoasa din componenta ca sa poata fi verificata.
 *
 * Sta separat pentru un singur motiv: pragul singur pare banal, dar are o
 * capcana care a si aparut o data — vezi mai jos, la valoarea de pornire. */

/* Cat de aproape trebuie sa fie doua apasari ca sa fie o pereche. 400ms e
   fereastra obisnuita pentru dublu clic pe sisteme desktop; pe telefon un
   dublu tap deliberat cade bine sub ea. */
export const PRAG_DUBLU_TAP = 400;

/* Valoarea de pornire a contorului. -Infinity, nu 0.
   Ceasul folosit e `performance.now()`, care se numara de la incarcarea
   paginii: in prima jumatate de secunda de viata a filei el e el insusi sub
   prag. Cu 0 la pornire, o singura apasare de atunci ar trece drept pereche
   si ar reincarca pagina — care iar ar porni de la zero. */
export const FARA_TAP = -Infinity;

export const eDubluTap = (ultimul, acum) => acum - ultimul < PRAG_DUBLU_TAP;
