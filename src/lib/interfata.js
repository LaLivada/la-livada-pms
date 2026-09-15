// @ts-check
/* Comutatorul „Interfața: Nouă / Actuală" si tema (15 septembrie 2026).
 *
 * Cele sapte schimbari de interfata propuse dupa faza 4 — navigare jos pe
 * telefon, butonul „inapoi" care inchide fereastra, erorile langa camp, bara
 * de actiuni lipita jos, culorile starilor in Azi, tinte de atins, tema
 * manuala — stau in spatele unui singur comutator din „Useri și drepturi":
 * o apasare pe „Actuală" readuce forma de dinainte, pe dispozitivul acela.
 * Alegerea ramane in browser (localStorage), nu in baza: e a dispozitivului,
 * nu a contului — receptia poate tine telefonul pe „Nouă" si laptopul pe
 * „Actuală".
 *
 * Reguli pure; starea React si clasa de pe radacina sunt in ui/interfata.jsx.
 */
export const CHEIE_INTERFATA = "pms:interfata";
export const INTERFETE = ["noua", "actuala"];
export const ETICHETA_INTERFATA = { noua: "Nouă", actuala: "Actuală" };

/** @param {{ getItem?: (k: string) => string | null } | undefined | null} stocare */
export function citesteInterfata(stocare) {
  try {
    const v = stocare?.getItem?.(CHEIE_INTERFATA);
    return INTERFETE.includes(v) ? v : "noua";
  } catch {
    return "noua";
  }
}

/** @param {{ setItem?: (k: string, v: string) => void } | undefined | null} stocare */
export function scrieInterfata(stocare, v) {
  try { stocare?.setItem?.(CHEIE_INTERFATA, v); } catch { /* fara stocare, alegerea tine cat pagina */ }
}

/* Tema: „sistem" urmeaza telefonul (cum era pana acum), „deschis" si
   „intunecat" o forteaza. Receptia de noapte vrea uneori intunecat pe un
   telefon setat pe deschis. */
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
