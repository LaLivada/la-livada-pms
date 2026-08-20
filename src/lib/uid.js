/* Identificator scurt pentru randuri create in aplicatie.
 *
 * Mutat aici din pms-app.jsx cand stratul `src/data/` a inceput sa creeze
 * randuri (linii de storno, exporturi) si avea nevoie de el fara sa importe
 * din interfata.
 *
 * NU e potrivit pentru nimic care cere unicitate garantata sau imposibil de
 * ghicit: 8 caractere din Math.random inseamna coliziuni la volume mari si
 * valori previzibile. Pentru id-urile de rand din PMS e suficient (unicitatea
 * reala o impune cheia primara din Postgres, care respinge duplicatul), dar
 * pentru un cod de acces la usa se foloseste genereazaCodPin din lib/acces.js,
 * care merge pe crypto.
 */
export const uid = () => Math.random().toString(36).slice(2, 10);
