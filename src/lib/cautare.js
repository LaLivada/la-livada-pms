// @ts-check
/* Cautarea globala (faza 3, C1): regulile pure ale casetei din antet —
 * ce text merita trimis serverului, cum se descrie un rezultat pe un rand,
 * cum se plimba selectia cu sagetile. Nimic din DOM, nimic din retea:
 * cererea e in data/cautare.js, ecranul in features/cautare.jsx.
 */
import { STATUS_LABEL } from "./constante.js";
import { fmtDate, fmtDateFull } from "./format.js";
import { guestFullName } from "./nume.js";

/* Sub 3 caractere serverul nu e intrebat: indexurile trigram n-au ce
   cauta intr-un „%ab%" (aceeasi regula ca la cautarea de oaspeti). Codul
   de oaspete are 8 caractere, numele camerei 4 — nu se pierde nimic. */
export const MIN_LITERE_CAUTARE_GLOBALA = 3;
export const LIMITA_CAUTARE_GLOBALA = 12;

/* Textul care pleaca la server: fara spatii la capete, cu spatiile
   interioare stranse la unul, sau "" cand e prea scurt ca sa merite o
   cerere. */
export function textDeCautat(brut) {
  const t = String(brut || "").trim().replace(/\s+/g, " ");
  return t.length >= MIN_LITERE_CAUTARE_GLOBALA ? t : "";
}

/* De ce a iesit randul — `potrivire` din functia cauta_rezervari. */
export const POTRIVIRE_LABEL = {
  cod: "cod de oaspete", camera: "cameră", telefon: "telefon", nume: "titular", ocupant: "ocupant",
};

/* Randul de pe ecran: cine, unde si cand, plus de ce a iesit. */
export function descrieRezultat(rez) {
  const r = rez.rezervare || {};
  const titular = guestFullName(rez.oaspete);
  const ocupant = r.occupantName || "";
  const titlu = titular || ocupant || "Fără nume";
  const detalii = [
    rez.camera ? `Camera ${rez.camera}` : "",
    /* Anul o singura data, la plecare: rezultatele pot fi din ani diferiti. */
    `${fmtDate(r.checkin)} → ${fmtDateFull(r.checkout)}`,
  ].filter(Boolean);
  const note = [];
  if (ocupant && ocupant !== titlu) note.push(`ocupant: ${ocupant}`);
  if (rez.grup) note.push(`grup: ${rez.grup}`);
  if (rez.potrivire === "telefon") note.push(rez.oaspete?.phone || r.occupantPhone || "");
  if (rez.potrivire === "cod") note.push(r.guestCode || "");
  return {
    titlu, detalii,
    status: STATUS_LABEL[r.status] || r.status || "",
    nota: note.filter(Boolean).join(" · "),
    motiv: POTRIVIRE_LABEL[rez.potrivire] || "",
  };
}

/* Selectia cu sagetile: se invarte la capete; -1 pe lista goala. */
export function urmatorulIndex(curent, total, pas) {
  if (!total) return -1;
  const c = curent < 0 || curent >= total ? (pas > 0 ? -1 : 0) : curent;
  return (((c + pas) % total) + total) % total;
}
