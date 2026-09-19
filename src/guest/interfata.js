/* Dispecer temporar — pana la Task 4, care il face sa aleaga dupa limba
 * curenta (useLimba().cod). Pana atunci, textele de interfata raman in
 * romana, exact ca azi (vezi acelasi model in continut.js, Task 1).
 *
 * `TEXTE` se importa (nu doar re-exporta) fiindca `useTexte` are nevoie de
 * legatura locala — un `export { TEXTE } from ...` fara import n-o creeaza,
 * si `TEXTE` ar fi ramas nedefinita in acest modul. */
import { TEXTE } from "./interfata.ro.js";
export { TEXTE };
export function useTexte() {
  // Single-limba deocamdata — Task 4 il face sa aleaga dupa useLimba().cod.
  return TEXTE;
}
