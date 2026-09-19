/* Regulamentul in engleza: inca netradus — text juridic, tradus abia cu
 * aprobare explicita (Task 7, Step 6). Pana atunci, re-export din sursa
 * romana, ca sa nu pice import()-ul din continut-mare.js pentru aceasta
 * limba. Acelasi tipar de "punte" ca la continut.<lang>.js intre Task 4
 * si Task 6. */
export { REGULAMENT } from "./regulament.ro.js";
