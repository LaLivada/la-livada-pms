/* Dispecerul real al textelor de interfata pe limba, ales dupa
 * useLimba().cod — vezi acelasi model in continut.js. */
import { useLimba } from "./limbi.jsx";
import * as ro from "./interfata.ro.js";
import * as en from "./interfata.en.js";
import * as fr from "./interfata.fr.js";
import * as it from "./interfata.it.js";
import * as de from "./interfata.de.js";
import * as ru from "./interfata.ru.js";
import * as uk from "./interfata.uk.js";

const MODULE = { ro, en, fr, it, de, ru, uk };

export function useTexte() {
  const { cod } = useLimba();
  return MODULE[cod].TEXTE;
}
