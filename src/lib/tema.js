// @ts-check
/* Tema PMS-ului: „Ca sistemul" / „Deschis" / „Întunecat" (15 septembrie 2026).
 *
 * Alegerea ramane in browser (localStorage), nu in baza: e a dispozitivului,
 * nu a contului — receptia de noapte vrea uneori intunecat pe un telefon
 * setat pe deschis, fara sa schimbe laptopul de la birou.
 *
 * Pana pe 26 septembrie 2026 statea aici si comutatorul „Interfața: Nouă /
 * Actuală"; interfata noua a ramas singura (Ovidiu: „Interfața actuală este
 * definitiva!").
 *
 * Reguli pure; starea React e in ui/tema.jsx.
 */

/* „sistem" urmeaza telefonul, „deschis" si „intunecat" il ignora. */
export const CHEIE_TEMA = "pms:tema";
export const TEME = ["sistem", "deschis", "intunecat"];
export const ETICHETA_TEMA = { sistem: "Ca sistemul", deschis: "Deschis", intunecat: "Întunecat" };
export const INTREBARE_INTUNECAT = "(prefers-color-scheme: dark)";
export const CLASA_INTUNECAT = "tema-intunecata";

/** @param {{ getItem?: (k: string) => string | null } | undefined | null} stocare */
export function citesteTema(stocare) {
  try {
    const v = stocare?.getItem?.(CHEIE_TEMA);
    return TEME.includes(v) ? v : "sistem";
  } catch {
    return "sistem";
  }
}

/** @param {{ setItem?: (k: string, v: string) => void } | undefined | null} stocare */
export function scrieTema(stocare, v) {
  try { stocare?.setItem?.(CHEIE_TEMA, v); } catch { /* fara stocare */ }
}

/* Tema efectiva: setarea, sau preferinta sistemului cand e „sistem". */
export function esteIntunecata(tema, sistemIntunecat) {
  return tema === "intunecat" || (tema === "sistem" && !!sistemIntunecat);
}

/* Pune sau scoate clasa de pe <html> (pms.css o foloseste in loc de
   prefers-color-scheme) si, pe „sistem", urmareste schimbarile sistemului.
   Intoarce functia care opreste urmarirea. */
export function aplicaTema(doc, tema, matchMedia) {
  const mq = matchMedia?.(INTREBARE_INTUNECAT);
  const pune = () => doc.documentElement.classList.toggle(CLASA_INTUNECAT, esteIntunecata(tema, mq?.matches));
  pune();
  if (tema === "sistem" && mq?.addEventListener) {
    mq.addEventListener("change", pune);
    return () => mq.removeEventListener("change", pune);
  }
  return () => {};
}
