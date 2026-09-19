/* Dispecerul real de continut pe limba, ales dupa useLimba().cod.
 *
 * Faptele (date.js) nu depind de limba, deci raman re-exportate direct.
 * Editorialul (BUN_VENIT, IMPORTANT, asistentaRaspuns, descrierile de acces
 * si textul atractiilor) vine din modulul limbii curente, prin hook-uri —
 * un `export const` simplu n-ar putea reactiona la schimbarea limbii din
 * <LimbaProvider>.
 *
 * Regulamentul ramane EXPLICIT in afara acestui fisier: se importa direct
 * din continut.ro.js (vezi App.jsx) si se muta in continut-mare.js abia la
 * Task 7, cu import() dinamic — nu static ca modulele de mai jos. */
import { useLimba } from "./limbi.jsx";
export * from "./date.js"; // faptele, neschimbate de limba

import * as ro from "./continut.ro.js";
import * as en from "./continut.en.js";
import * as fr from "./continut.fr.js";
import * as it from "./continut.it.js";
import * as de from "./continut.de.js";
import * as ru from "./continut.ru.js";
import * as uk from "./continut.uk.js";

const MODULE = { ro, en, fr, it, de, ru, uk };

export function useContinutMic() {
  const { cod } = useLimba();
  const m = MODULE[cod];
  return { BUN_VENIT: m.BUN_VENIT, IMPORTANT: m.IMPORTANT };
}

export function useAsistentaRaspuns() {
  const { cod } = useLimba();
  return MODULE[cod].asistentaRaspuns;
}

export function useAccesCamereDescrieri() {
  const { cod } = useLimba();
  return MODULE[cod].ACCES_CAMERE_DESCRIERI;
}

export function useAtractiiText() {
  const { cod } = useLimba();
  return MODULE[cod].ATRACTII_TEXT;
}
