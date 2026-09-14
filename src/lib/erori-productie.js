// @ts-check
/* Erorile din productie ajung in jurnal — faza 2, D7 din
 * docs/audit-2026-09.md.
 *
 * DE CE. O eroare pe tableta receptiei se vedea doar in consola browserului,
 * adica nicaieri: nimeni nu deschide consola pe o tableta, iar pana ajunge
 * cineva sa se uite, pagina a fost reincarcata. Aici `window.onerror` si
 * `unhandledrejection` scriu un rand in `activity_log`, acelasi tabel pe
 * care il vede ecranul Jurnal — fara serviciu nou, fara cheie noua.
 *
 * Ce apara:
 *   - dedupe: aceeasi eroare, in aceeasi fereastra de 10 minute, o data;
 *   - plafon pe sesiune: o bucla de erori nu umple jurnalul;
 *   - zgomotul cunoscut nu se scrie (ResizeObserver, „Script error.",
 *     modulul lipsa dupa un deploy — pe ala ErrorBoundary il rezolva singur);
 *   - raportarea nu arunca niciodata: o eroare in timp ce scriem o eroare
 *     ar fi o bucla, iar daca tocmai baza a picat, scrierea esueaza tacut.
 *
 * Logica e pura si testata in src/erori-productie.test.js; instalarea in
 * src/main.jsx, inainte de prima randare.
 */

export const ACTIUNE_EROARE = "Eroare în aplicație";
export const FEREASTRA_DUBLURI_MS = 10 * 60_000;
export const MAX_PE_SESIUNE = 30;
/* Bornele din `check`-ul coloanei `detail` (activity_log). */
export const MAX_DETALIU = 1000;

/* Mesaje care nu spun nimic despre codul nostru. */
const ZGOMOT = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /dynamically imported module|importing a module script failed|loading chunk/i,
];
export function esteZgomot(mesaj) {
  const m = String(mesaj || "");
  return ZGOMOT.some((re) => re.test(m));
}

/* Ce se scrie despre o eroare: mesajul, numele (cand nu e „Error"), codul
   Supabase/Postgres (sau statusul HTTP). Un obiect fara mesaj se scrie ca
   JSON scurt — mai bine „[object]" citibil decat nimic. */
export function descrieEroare(x) {
  if (x == null) return "eroare fără detalii";
  if (typeof x === "string") return x;
  if (typeof x !== "object") return String(x);
  const mesaj = x.message ?? x.error_description ?? x.msg ?? "";
  const nume = x.name && x.name !== "Error" ? String(x.name) : "";
  let text = [nume, mesaj].filter(Boolean).join(": ");
  if (!text) {
    try { text = JSON.stringify(x).slice(0, 200); } catch { text = String(x); }
  }
  const cod = x.code ?? x.status ?? "";
  return cod ? `${text} (${cod})` : text;
}

const ultimulSegment = (cale) => String(cale).split(/[\\/]/).pop();

/* „fisier:linie:coloana" — doar numele fisierului, nu tot URL-ul: bundle-ul
   are oricum un hash in nume, si un rand din jurnal trebuie sa incapa pe
   ecranul unei tablete. Din ErrorEvent cand exista, altfel din stack. */
export function loculErorii(ev, eroare) {
  if (ev?.filename) return `${ultimulSegment(ev.filename)}:${ev.lineno || 0}:${ev.colno || 0}`;
  const stack = String(eroare?.stack || "");
  const m = /([^\s()@]+?\.[cm]?jsx?):(\d+):(\d+)/.exec(stack);
  return m ? `${ultimulSegment(m[1])}:${m[2]}:${m[3]}` : "";
}

/* Prima componenta din `componentStack`-ul lui React („    at CalendarView
   (...)" sau „    in CalendarView"). */
export function componentaDin(componentStack) {
  const m = /^\s*(?:at |in )?([A-Za-z_$][\w$]*)/m.exec(String(componentStack || ""));
  return m ? m[1] : "";
}

/* De pe ce vine eroarea, in doua cuvinte: „Chrome 128 · Android". Nu tot
   user-agentul — ala are 120 de caractere si spune acelasi lucru. */
export function agentScurt(ua) {
  const s = String(ua || "");
  if (!s) return "";
  const browser =
    /Edg\/(\d+)/.exec(s) ? `Edge ${/Edg\/(\d+)/.exec(s)[1]}`
    : /Firefox\/(\d+)/.exec(s) ? `Firefox ${/Firefox\/(\d+)/.exec(s)[1]}`
    : /Chrome\/(\d+)/.exec(s) ? `Chrome ${/Chrome\/(\d+)/.exec(s)[1]}`
    : /Version\/(\d+)[^)]*Safari/.exec(s) ? `Safari ${/Version\/(\d+)/.exec(s)[1]}`
    : "";
  const platforma =
    /iPad/.test(s) ? "iPad" : /iPhone/.test(s) ? "iPhone" : /Android/.test(s) ? "Android"
    : /Windows/.test(s) ? "Windows" : /Macintosh|Mac OS X/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "";
  return [browser, platforma].filter(Boolean).join(" · ");
}

/* Randul din jurnal: tip, descriere, loc, componenta, ecran, agent —
   separate cu punct median, taiate la limita coloanei. */
/** @param {{ tip?: string, eroare?: unknown, ev?: object, ecran?: string, agent?: string, componenta?: string }} [detalii] */
export function detaliuEroare({ tip, eroare, ev, ecran, agent, componenta } = {}) {
  const parti = [`[${tip || "eroare"}] ${descrieEroare(eroare)}`];
  const loc = loculErorii(ev, eroare);
  if (loc) parti.push(loc);
  if (componenta) parti.push(`în ${componenta}`);
  if (ecran) parti.push(`ecran ${ecran}`);
  if (agent) parti.push(agent);
  return parti.join(" · ").slice(0, MAX_DETALIU);
}

/* Colectorul: decide daca un detaliu se scrie (dedupe + plafon) si il
   scrie prin `scrie(actiune, detaliu)` — de obicei scrieInJurnalTacut din
   lib/audit.js. `acum` e injectabil ca fereastra de dedupe sa fie testabila. */
/** @param {{ scrie?: (actiune: string, detaliu: string) => Promise<unknown> | void, acum?: () => number, fereastraMs?: number, maxPeSesiune?: number }} [optiuni] */
export function creeazaColector({
  scrie, acum = () => Date.now(),
  fereastraMs = FEREASTRA_DUBLURI_MS, maxPeSesiune = MAX_PE_SESIUNE,
} = {}) {
  const vazute = new Map();
  let scrise = 0;
  return {
    inregistreaza(detaliu) {
      const d = String(detaliu || "");
      if (!d || scrise >= maxPeSesiune) return false;
      const t = acum();
      const ultima = vazute.get(d);
      if (ultima != null && t - ultima < fereastraMs) return false;
      vazute.set(d, t);
      scrise++;
      try {
        const r = scrie?.(ACTIUNE_EROARE, d);
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch { /* raportarea nu are voie sa arunce */ }
      return true;
    },
  };
}

/* Starea instalarii: colectorul, fereastra (pentru user-agent) si ecranul
   curent al PMS-ului — pus de PMSApp la fiecare schimbare de sectiune, ca
   un rand din jurnal sa spuna si UNDE era omul cand a picat. */
let colectorActiv = null;
let fereastraActiva = null;
let ecranCurent = "";

export function seteazaEcranCurent(nume) {
  ecranCurent = String(nume || "");
}

const contextul = (fereastra) => ({
  ecran: ecranCurent,
  agent: agentScurt(fereastra?.navigator?.userAgent),
});

/* Pentru ErrorBoundary (erori de randare) si pentru orice `catch` care vrea
   sa lase urma fara sa deranjeze utilizatorul. Fals pana la instalare. */
export function raporteazaEroare(tip, eroare, componenta) {
  if (!colectorActiv) return false;
  return colectorActiv.inregistreaza(
    detaliuEroare({ tip, eroare, componenta, ...contextul(fereastraActiva) }));
}

export function instaleazaCapturaErori(fereastra, colector) {
  const peEroare = (ev) => {
    const mesaj = ev?.message ?? descrieEroare(ev?.error);
    if (esteZgomot(mesaj)) return;
    colector.inregistreaza(
      detaliuEroare({ tip: "script", eroare: ev?.error ?? mesaj, ev, ...contextul(fereastra) }));
  };
  const pePromisiune = (ev) => {
    const motiv = ev?.reason;
    if (esteZgomot(descrieEroare(motiv))) return;
    colector.inregistreaza(
      detaliuEroare({ tip: "promisiune", eroare: motiv, ...contextul(fereastra) }));
  };
  fereastra.addEventListener("error", peEroare);
  fereastra.addEventListener("unhandledrejection", pePromisiune);
  colectorActiv = colector;
  fereastraActiva = fereastra;
  return () => {
    fereastra.removeEventListener("error", peEroare);
    fereastra.removeEventListener("unhandledrejection", pePromisiune);
    colectorActiv = null;
    fereastraActiva = null;
  };
}
