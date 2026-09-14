// @ts-check
/* Scurtaturile de tastatura (faza 3, C2) si intentiile pe care antetul le
 * trimite calendarului. Regulile sunt pure, ca sa poata fi testate fara
 * DOM: Shell (pms-app.jsx) doar asculta `keydown` si le aplica.
 *
 *   Ctrl+K / Cmd+K, sau `/`  → cautarea globala
 *   N                        → rezervare noua
 *   T                        → calendarul la azi
 *   ← / →                    → o saptamana inapoi / inainte (in calendar)
 *   Esc                      → inchide (o are deja Dialog)
 *
 * Literele si sagetile tac cand omul scrie intr-un camp sau cand un dialog
 * e deschis — altfel un „n" tastat intr-o nota ar deschide o rezervare
 * noua peste cea pe care o editezi. Ctrl+K merge si dintr-un camp.
 */
import { adaugaZile, ziLocala } from "./timp.js";

export function tintaEditabila(el) {
  if (!el || typeof el !== "object") return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

/* Ce inseamna apasarea: "cautare" | "nou" | "azi" | "inapoi" | "inainte"
   | null (nimic de facut, lasa tasta browserului). */
export function decideScurtatura(e, { dialogDeschis = false, editabil = false } = {}) {
  if (!e || dialogDeschis) return null;
  const tasta = String(e.key || "");
  const ctrlSauCmd = !!(e.ctrlKey || e.metaKey);
  if (ctrlSauCmd && !e.altKey && tasta.toLowerCase() === "k") return "cautare";
  if (editabil || ctrlSauCmd || e.altKey) return null;
  /* `/` vine cu Shift pe unele tastaturi (Shift+7 pe cea germana). */
  if (tasta === "/") return "cautare";
  if (e.shiftKey) return null;
  if (tasta === "ArrowLeft") return "inapoi";
  if (tasta === "ArrowRight") return "inainte";
  /* O tasta tinuta apasata nu deschide zece rezervari noi. */
  if (e.repeat) return null;
  const litera = tasta.toLowerCase();
  if (litera === "n") return "nou";
  if (litera === "t") return "azi";
  return null;
}

/* Intentia pe care antetul o da calendarului (`setCalendarIntent`). `n` e
   mereu alt numar: doua apasari de → una dupa alta sunt doua intentii, nu
   una singura pe care React ar lua-o drept „aceeasi valoare". */
let contor = 0;
export const intentie = (tip, rest = {}) => ({ tip, n: ++contor, ...rest });

/* Ce face calendarul cu o intentie: ce dialog deschide (`modal`), la ce zi
   sare (`salt`), cu cate zile se muta (`zile`), ce rezervare deschide dupa
   ce ajunge in fereastra ei (`deDeschis`). Sirul "group" e forma veche,
   dinaintea fazei 3 — ramane inteles. */
export function planIntentie(intent, acum = new Date()) {
  if (!intent) return null;
  const tip = typeof intent === "string" ? intent : intent.tip;
  switch (tip) {
    case "group": case "grup": return { modal: { reservation: null, mode: "group" } };
    case "nou": return { modal: { reservation: null } };
    case "azi": return { salt: ziLocala(acum) };
    case "saptamana": return { zile: Number(intent.zile) || 0 };
    case "deschide": {
      const ci = new Date(intent.checkin);
      if (!intent.id || Number.isNaN(ci.getTime())) return null;
      /* O zi inaintea sosirii: bara rezervarii nu e lipita de marginea
         stanga a grilei, se vede si ce e in fata ei. */
      return { salt: adaugaZile(ziLocala(ci), -1), deDeschis: intent.id };
    }
    default: return null;
  }
}
