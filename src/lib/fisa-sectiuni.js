// @ts-check
/* Fisa de rezervare in sectiuni pliabile (faza 3, C4): Oaspete · Sejur ·
 * Pret · Note · Acces. Aici sunt regulile pure — care sectiuni pornesc
 * deschise si ce scrie in capul fiecareia cand e pliata (rezumatul), plus
 * randul de rezumat din capul dialogului la editare. Componenta pliabila
 * e in ui/sectiune.jsx, formularul in features/rezervari.jsx.
 */
import { STATUS_LABEL } from "./constante.js";
import { fmtMoney } from "./format.js";
import { nightsBetween } from "./availability.js";

export const SECTIUNI = ["oaspete", "sejur", "pret", "note", "acces"];
export const TOATE_DESCHISE = Object.freeze(Object.fromEntries(SECTIUNI.map((s) => [s, true])));

/* La o rezervare noua sunt deschise cele de completat; la editare toate
   stau pliate, cu rezumatul in cap — desfaci doar ce ai de schimbat. */
export function sectiuniImplicite({ editing = false } = {}) {
  return editing
    ? { oaspete: false, sejur: false, pret: false, note: false, acces: false }
    : { oaspete: true, sejur: true, pret: true, note: false, acces: false };
}

const persoane = (adults, children) => {
  const p = [];
  const a = Number(adults) || 0, c = Number(children) || 0;
  if (a) p.push(a === 1 ? "1 adult" : `${a} adulți`);
  if (c) p.push(c === 1 ? "1 copil" : `${c} copii`);
  return p.join(", ");
};

/* Ziua din sirul formularului (YYYY-MM-DDTHH:mm), fara sa treaca prin
   Date: sirul e ora locala a hotelului, iar browserul ar putea fi in alt
   fus. */
const ziScurta = (s) => (typeof s === "string" && s.length >= 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "");
const ora = (s) => (typeof s === "string" && s.length >= 16 ? s.slice(11, 16) : "");
const nopti = (checkin, checkout) => {
  const n = nightsBetween(checkin, checkout);
  return Number.isFinite(n) && n > 0 ? `${n} ${n === 1 ? "noapte" : "nopți"}` : "";
};

export function rezumatOaspete({ nume = "", ocupant = "", adults = 0, children = 0, grup = false } = {}) {
  if (!nume) return grup ? "Alege clientul principal" : "Alege clientul";
  const parti = [nume];
  if (ocupant && ocupant !== nume) parti.push(`ocupant ${ocupant}`);
  const p = persoane(adults, children);
  if (p) parti.push(p);
  return parti.join(" · ");
}

export function rezumatSejur({ camere = [], checkin = "", checkout = "", status = "" } = {}) {
  const parti = [];
  const nume = (camere || []).filter(Boolean);
  if (nume.length > 3) parti.push(`${nume.length} camere`);
  else if (nume.length) parti.push(nume.join(", "));
  else parti.push("Fără cameră");
  if (ziScurta(checkin) && ziScurta(checkout)) {
    const n = nopti(checkin, checkout);
    parti.push(`${ziScurta(checkin)} → ${ziScurta(checkout)}${n ? ` (${n})` : ""}`);
  }
  if (status) parti.push(STATUS_LABEL[status] || status);
  return parti.join(" · ");
}

export function rezumatPret({ total = 0, manual = false } = {}) {
  return `${fmtMoney(Number(total) || 0)}${manual ? " · preț manual" : ""}`;
}

export function rezumatNote({ tags = [], notes = "", mesaje = 0 } = {}) {
  const parti = [];
  if (tags?.length) parti.push(tags.join(", "));
  const n = String(notes || "").trim().replace(/\s+/g, " ");
  if (n) parti.push(n.length > 40 ? `„${n.slice(0, 40)}…”` : `„${n}”`);
  const m = Number(mesaje) || 0;
  if (m) parti.push(m === 1 ? "1 mesaj" : `${m} mesaje`);
  return parti.join(" · ") || "Fără note";
}

export function rezumatAcces({ checkin = "", checkout = "" } = {}) {
  return ora(checkin) && ora(checkout) ? `Orele ${ora(checkin)} → ${ora(checkout)}` : "";
}

/* Randul din capul dialogului, la editare: cine, unde, cand, cat, in ce
   stare — ca sa nu trebuiasca desfacuta nicio sectiune doar ca sa vezi
   despre ce rezervare e vorba. */
export function rezumatFisa({ nume = "", camera = "", checkin = "", checkout = "", total = 0, status = "" } = {}) {
  const parti = [nume || "Fără nume"];
  if (camera) parti.push(`Camera ${camera}`);
  if (ziScurta(checkin) && ziScurta(checkout)) parti.push(`${ziScurta(checkin)} → ${ziScurta(checkout)}`);
  const n = nopti(checkin, checkout);
  if (n) parti.push(n);
  parti.push(fmtMoney(Number(total) || 0));
  if (status) parti.push(STATUS_LABEL[status] || status);
  return parti.join(" · ");
}
