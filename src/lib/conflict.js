// @ts-check
/* Conflictul de concurenta la salvarea unei rezervari (faza 3, C5).
 *
 * Baza refuza o scriere cu stampila `updated_at` mai veche decat a ei
 * (triggerul reservations_stamp_updated_at din schema.sql). Pana pe 14
 * septembrie 2026 aplicatia spunea doar „modificata de altcineva intre
 * timp", reincarca tot si cerea reluarea modificarii — fara sa arate CE se
 * schimbase. Acum compara trei versiuni ale randului:
 *
 *   baza  — de la care a pornit omul (ce era in browser la deschidere),
 *   aMea  — ce vrea sa scrie,
 *   aLor  — ce e acum in baza (scris de altcineva intre timp),
 *
 * arata campurile diferite si lasa alegerea: „pastreaza a mea" (campurile
 * schimbate de mine raman ale mele, restul iau valorile lor, stampila e a
 * lor ca baza sa accepte) sau „ia pe a lor" (nimic nu se scrie, ecranul
 * ia versiunea lor). Regulile sunt pure; cererile sunt in data/conflict.js,
 * dialogul in features/conflict.jsx, coada conflictelor care asteapta un
 * raspuns in features/conflict-coada.jsx, legarea in pms-app.jsx.
 */
import { STATUS_LABEL, sourceLabel } from "./constante.js";
import { fmtDateTime, fmtMoney } from "./format.js";

/* Eroarea triggerului: cod 40001 (serialization_failure) sau textul lui —
   textul ramane ca plasa pentru un bundle vechi care n-ar trimite codul. */
export function esteConflict(e) {
  return String(e?.code || "") === "40001" || /modificat[ăa] de altcineva/i.test(String(e?.message || ""));
}

/* Campurile pe care le compara dialogul — cele pe care le scrie aplicatia
   (snakeRes din data/mapari.js), fara cele de sistem: id, stampile, codul
   de oaspete, `seeded`. Ordinea e cea de pe ecran. */
export const CAMPURI = [
  { cheie: "roomId", eticheta: "Camera", tip: "camera" },
  { cheie: "checkin", eticheta: "Sosire", tip: "moment" },
  { cheie: "checkout", eticheta: "Plecare", tip: "moment" },
  { cheie: "status", eticheta: "Status", tip: "status" },
  { cheie: "guestId", eticheta: "Client", tip: "oaspete" },
  { cheie: "groupId", eticheta: "Grup", tip: "grup" },
  { cheie: "adults", eticheta: "Adulți", tip: "numar" },
  { cheie: "children", eticheta: "Copii", tip: "numar" },
  { cheie: "priceOverride", eticheta: "Preț manual", tip: "bani" },
  { cheie: "bookedPrice", eticheta: "Preț înghețat", tip: "bani" },
  { cheie: "source", eticheta: "Sursă", tip: "sursa" },
  { cheie: "tags", eticheta: "Etichete", tip: "lista" },
  { cheie: "notes", eticheta: "Note", tip: "text" },
  { cheie: "occupantLastName", eticheta: "Ocupant — nume", tip: "text" },
  { cheie: "occupantFirstName", eticheta: "Ocupant — prenume", tip: "text" },
  { cheie: "occupantPhone", eticheta: "Ocupant — telefon", tip: "text" },
  { cheie: "billingCustomerId", eticheta: "Facturare către", tip: "facturare" },
  { cheie: "messages", eticheta: "Mesaje", tip: "mesaje" },
];

/* Valoarea „canonica" a unui camp, ca doua forme ale aceluiasi lucru sa nu
   para diferite: momentele ca numar (serverul da „+00:00", browserul
   „.000Z"), lipsa ca null (undefined, "" si null sunt totuna), listele ca
   JSON, numerele ca numere (formularul da uneori text). */
export function canonic(tip, v) {
  if (tip === "lista" || tip === "mesaje") return JSON.stringify(v || []);
  if (v === undefined || v === null || v === "") return null;
  if (tip === "moment") { const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t; }
  if (tip === "bani" || tip === "numar") { const n = Number(v); return Number.isNaN(n) ? null : n; }
  return v;
}
export const laFel = (tip, a, b) => canonic(tip, a) === canonic(tip, b);

/* Diferentele dintre cele trei versiuni: un camp intra in lista daca l-am
   schimbat eu sau l-au schimbat ei fata de baza. `amandoi` = fiecare a pus
   altceva in acelasi camp — singurul caz in care „pastreaza a mea" chiar
   pierde ceva de-al lor. */
export function diferente(baza, aMea, aLor) {
  const rezultat = [];
  for (const c of CAMPURI) {
    const vBaza = baza?.[c.cheie], vMea = aMea?.[c.cheie], vLor = aLor?.[c.cheie];
    const euAmSchimbat = !laFel(c.tip, vBaza, vMea);
    const eiAuSchimbat = !laFel(c.tip, vBaza, vLor);
    if (!euAmSchimbat && !eiAuSchimbat) continue;
    rezultat.push({
      ...c, baza: vBaza, aMea: vMea, aLor: vLor, euAmSchimbat, eiAuSchimbat,
      amandoi: euAmSchimbat && eiAuSchimbat && !laFel(c.tip, vMea, vLor),
    });
  }
  return rezultat;
}

/* „Pastreaza a mea": pornim de la randul lor (stampila, codul de oaspete
   si tot ce au schimbat ei) si punem peste DOAR campurile schimbate de
   mine. Numele ocupantului e derivat, se recalculeaza. */
export function imbina(baza, aMea, aLor) {
  const rezultat = { ...aLor };
  for (const c of CAMPURI) {
    if (!laFel(c.tip, baza?.[c.cheie], aMea?.[c.cheie])) rezultat[c.cheie] = aMea[c.cheie];
  }
  rezultat.occupantName = [rezultat.occupantLastName, rezultat.occupantFirstName].filter(Boolean).join(" ");
  return rezultat;
}

/* Cum se arata o valoare in dialog. `ctx` da numele camerei, clientului,
   grupului si al clientului de facturare, dupa id. */
export function arataValoare(camp, v, ctx = {}) {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "—";
  switch (camp.tip) {
    case "camera": return ctx.numeCamera?.(v) || String(v);
    case "oaspete": return ctx.numeOaspete?.(v) || String(v);
    case "grup": return ctx.numeGrup?.(v) || String(v);
    case "facturare": return ctx.numeFacturare?.(v) || String(v);
    case "moment": return fmtDateTime(v);
    case "status": return STATUS_LABEL[v] || String(v);
    case "sursa": return sourceLabel(v);
    case "bani": return fmtMoney(Number(v));
    case "lista": return v.join(", ");
    case "mesaje": return v.length === 1 ? "1 mesaj" : `${v.length} mesaje`;
    default: return String(v);
  }
}

/* Randurile pe care le-am trimis si pe care serverul le are cu o stampila
   mai noua decat cea trimisa — cele care au declansat refuzul. Un rand nou
   (fara stampila) nu poate fi in conflict. */
export function randuriInConflict(trimise, dePeServer) {
  const server = new Map((dePeServer || []).map((r) => [r.id, r]));
  return (trimise || []).filter((r) => {
    const s = server.get(r.id);
    if (!s || !r.updatedAt || !s.updatedAt) return false;
    return new Date(s.updatedAt).getTime() > new Date(r.updatedAt).getTime();
  });
}

/* Cele trei versiuni pentru fiecare rand in conflict, gata de aratat.
   `null` cand refuzul nu se poate explica prin ce a venit de pe server —
   apelantul cade atunci pe drumul vechi (mesaj + reincarcare). */
export function pregatesteConflict(before, trimise, dePeServer, cine = new Map()) {
  const inConflict = randuriInConflict(trimise, dePeServer);
  if (!inConflict.length) return null;
  const bazaDupaId = new Map((before || []).map((r) => [r.id, r]));
  const serverDupaId = new Map(dePeServer.map((r) => [r.id, r]));
  return inConflict.map((aMea) => ({
    baza: bazaDupaId.get(aMea.id) || null, aMea, aLor: serverDupaId.get(aMea.id),
    cine: cine.get(aMea.id) || null,
  }));
}

/* Ce se SCRIE dupa alegere. „mea": `combinat` cu randurile in conflict
   imbinate. Lista ramane cea din instantaneul salvarii, deliberat: scrisa
   ca diferenta fata de `before`, cuprinde doar randurile salvarii ASTEIA;
   refacuta din ecranul de acum, ar lua cu ea si randurile altor salvari in
   curs, cu stampilele lor vechi, si baza ar respinge iar totul. „lor" sau
   dialog inchis: nimic nu se scrie, deci nu exista lista. Ce se VEDE e alta
   socoteala — ecranDupaAlegere, mai jos. */
export function aplicaAlegerea(alegere, combinat, randuri) {
  if (alegere !== "mea") return { scrie: false, final: null };
  const dupaId = new Map(randuri.map((r) => [r.aMea.id, r]));
  return {
    scrie: true,
    final: combinat.map((r) => { const c = dupaId.get(r.id); return c ? imbina(c.baza, c.aMea, c.aLor) : r; }),
  };
}

/* Ce se VEDE dupa alegere — altceva decat lista de scris. Dialogul poate sta
   deschis minute intregi, iar in spatele lui ecranul merge mai departe:
   Realtime aduce randuri, alte salvari isi pun modificarile si stampilele,
   un alt conflict se rezolva. `before` si `combinat` sunt instantanee de
   DINAINTEA salvarii; pana pe 21 septembrie 2026 ecranul se refacea din ele,
   cu lista intreaga, si tot ce se schimbase intre timp disparea — baza
   ramanea corecta, dar ecranul mintea, iar urmatoarea editare a randului era
   respinsa ca „modificata de altcineva", de mine insumi.

   Acum alegerea se aplica peste ce e pe ecran ACUM (`acum`), doar pe
   randurile salvarii respinse (`trimise`):
     „mea" — randul in conflict ia imbinarea, adica exact ce se scrie;
     „lor" sau dialog inchis — randul in conflict ia versiunea lor, celelalte
       randuri ale salvarii revin la cea din `before` (scrierea respinsa a
       fost una singura, atomica: niciunul n-a ajuns in baza), iar cele noi
       dispar. Dar numai cat pe ecran mai e ce a pus salvarea asta: un rand
       inlocuit intre timp (Realtime, o salvare de mai tarziu) e mai nou
       decat orice instantaneu si ramane.
   Orice alt rand ramane exact cum e; unul disparut intre timp nu reapare. */
export function ecranDupaAlegere(alegere, acum, before, trimise, randuri) {
  const inConflict = new Map(randuri.map((c) => [c.aMea.id, c]));
  if (alegere === "mea") {
    return (acum || []).map((r) => { const c = inConflict.get(r.id); return c ? imbina(c.baza, c.aMea, c.aLor) : r; });
  }
  const inainte = new Map((before || []).map((r) => [r.id, r]));
  const puse = new Map((trimise || []).map((r) => [r.id, r]));
  const rezultat = [];
  for (const r of acum || []) {
    const pus = puse.get(r.id);
    if (!pus || JSON.stringify(r) !== JSON.stringify(pus)) { rezultat.push(r); continue; }
    const c = inConflict.get(r.id);
    if (c) rezultat.push(c.aLor);
    else if (inainte.has(r.id)) rezultat.push(inainte.get(r.id));
  }
  return rezultat;
}
