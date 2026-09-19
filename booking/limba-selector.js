/* Selectorul de limbă din antet: un buton cu steagul limbii curente, care
 * deschide un mic pop-up cu toate cele 7 limbi (steag + nume, în limba ei).
 *
 * Modul ES, nu IIFE ca menu.js: are nevoie de lista de limbi din
 * src/booking/i18n/limbi.js — ACEEAȘI listă și ACEEAȘI cheie de localStorage
 * ca motorul de rezervare React, ca alegerea făcută pe o pagină legală
 * statică (fără React) să fie văzută și de motor, și invers.
 *
 * Pe pagina principală (motorul React), schimbarea limbii doar salvează
 * alegerea și reîncarcă — la reîncărcare, `detecteazaLimba()` din React
 * citește direct limba salvată. Pe o pagină legală statică, fiecare limbă
 * e un fișier separat (vezi booking/<pagina>/<limba>/index.html), deci
 * schimbarea limbii navighează la acel fișier.
 */
import {
  LIMBI, CHEIE_LIMBA, LIMBA_IMPLICITA, detecteazaLimba, salveazaLimba,
} from "../src/booking/i18n/limbi.js";
import ro from "../src/booking/i18n/dictionare/ro.js";
import en from "../src/booking/i18n/dictionare/en.js";
import fr from "../src/booking/i18n/dictionare/fr.js";
import it from "../src/booking/i18n/dictionare/it.js";
import de from "../src/booking/i18n/dictionare/de.js";
import ru from "../src/booking/i18n/dictionare/ru.js";
import uk from "../src/booking/i18n/dictionare/uk.js";

const DICTIONARE = { ro, en, fr, it, de, ru, uk };

/* Steaguri desenate ca SVG, nu emoji: Windows arată codul țării ca text
   simplu ("GB") în loc de steag colorat pentru multe fonturi/browsere —
   exact ce a semnalat Ovidiu la prima verificare. Un SVG propriu randează
   la fel peste tot, indiferent de fontul de emoji instalat. */
const STEAGURI_SVG = {
  ro: '<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg"><rect width="3" height="2" fill="#002B7F"/><rect x="1" width="1" height="2" fill="#FCD116"/><rect x="2" width="1" height="2" fill="#CE1126"/></svg>',
  en: '<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="30" fill="#00247d"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#cf142b" stroke-width="2"/><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#cf142b" stroke-width="6"/></svg>',
  fr: '<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg"><rect width="3" height="2" fill="#fff"/><rect width="1" height="2" fill="#0055A4"/><rect x="2" width="1" height="2" fill="#EF4135"/></svg>',
  it: '<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg"><rect width="3" height="2" fill="#fff"/><rect width="1" height="2" fill="#009246"/><rect x="2" width="1" height="2" fill="#CE2B37"/></svg>',
  de: '<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg"><rect width="3" height="0.667" fill="#000"/><rect y="0.667" width="3" height="0.666" fill="#DD0000"/><rect y="1.333" width="3" height="0.667" fill="#FFCE00"/></svg>',
  ru: '<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg"><rect width="3" height="0.667" fill="#fff"/><rect y="0.667" width="3" height="0.666" fill="#0039A6"/><rect y="1.333" width="3" height="0.667" fill="#D52B1E"/></svg>',
  uk: '<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg"><rect width="3" height="1" fill="#0057B7"/><rect y="1" width="3" height="1" fill="#FFD700"/></svg>',
};

/* Traduce elementele statice din afara motorului React (antetul filmat
   al paginii principale, titlul galeriei) — marcate în HTML cu
   `data-i18n="cale.catre.cheie"`. Rulează o singură dată, la încărcare:
   pe pagina principală, alegerea unei alte limbi reîncarcă pagina (vezi
   `alegeLimba` mai jos), deci nu există stare de re-aplicat. */
function traduceStatic(cod) {
  const dict = DICTIONARE[cod] || ro;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const cale = el.dataset.i18n;
    const text = cale.split(".").reduce((o, k) => (o == null ? o : o[k]), dict)
      ?? cale.split(".").reduce((o, k) => (o == null ? o : o[k]), ro);
    if (typeof text === "string") el.textContent = text;
  });
  document.documentElement.lang = cod;
}

(function () {
  const container = document.getElementById("ldv-lang");
  const toggle = document.getElementById("ldv-lang-toggle");
  const panel = document.getElementById("ldv-lang-panel");
  const steagCurent = document.getElementById("ldv-lang-steag-curent");
  if (!container || !toggle || !panel || !steagCurent) return;

  function steagPentru(cod) {
    return STEAGURI_SVG[cod] || STEAGURI_SVG[LIMBA_IMPLICITA];
  }

  // Markup fix, definit mai sus în fișier — niciodată date venite de la
  // vizitator, deci setarea directă a HTML-ului e sigură aici.
  function seteazaSteagCurent(cod) {
    steagCurent.innerHTML = steagPentru(cod);
  }

  function marcheazaActiva(cod) {
    panel.querySelectorAll(".ldv-lang-opt").forEach((buton) => {
      buton.setAttribute("aria-pressed", buton.dataset.limba === cod ? "true" : "false");
    });
  }

  LIMBI.forEach((l) => {
    const buton = document.createElement("button");
    buton.type = "button";
    buton.className = "ldv-lang-opt";
    buton.dataset.limba = l.cod;

    const steag = document.createElement("span");
    steag.className = "ldv-lang-steag";
    steag.innerHTML = steagPentru(l.cod);
    const nume = document.createElement("span");
    nume.textContent = l.nume;

    buton.append(steag, nume);
    buton.addEventListener("click", () => alegeLimba(l.cod));
    panel.appendChild(buton);
  });

  const limbaCurenta = detecteazaLimba();
  seteazaSteagCurent(limbaCurenta);
  marcheazaActiva(limbaCurenta);
  traduceStatic(limbaCurenta);

  function setOpen(open) {
    container.dataset.open = open ? "true" : "false";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", () => {
    setOpen(container.dataset.open !== "true");
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && container.dataset.open === "true") setOpen(false);
  });

  /* Prefixele de limbă pe care le pot purta paginile legale statice —
     folosite ca să recunoaștem și să scoatem un prefix deja prezent în
     adresă înainte să punem prefixul nou. */
  const PREFIXE = LIMBI.map((l) => l.cod).filter((c) => c !== LIMBA_IMPLICITA);

  /* Calea paginii legale, cu limba curentă scoasă din adresă, dacă era
     acolo — ex. "/anulare/fr/" -> "/anulare/". Rămâne neschimbată pentru
     orice altă pagină (inclusiv pagina principală, "/"). */
  function caleFaraLimba(pathname) {
    const segmente = pathname.split("/").filter(Boolean);
    if (segmente.length >= 2 && PREFIXE.includes(segmente[segmente.length - 1])) {
      segmente.pop();
    }
    return segmente;
  }

  function alegeLimba(cod) {
    salveazaLimba(cod);
    seteazaSteagCurent(cod);
    marcheazaActiva(cod);
    setOpen(false);

    const segmente = caleFaraLimba(window.location.pathname);
    if (segmente.length === 0) {
      // Pagina principală — motorul React citește limba direct din
      // localStorage la (re)montare.
      window.location.reload();
      return;
    }
    const cale = `/${segmente.join("/")}/${cod === LIMBA_IMPLICITA ? "" : `${cod}/`}`;
    window.location.assign(cale);
  }

  // Alegerea făcută în alt tab (sau chiar în panoul ăsta, prin `storage`
  // — nu se declanșează în tab-ul care a scris el însuși, deci n-are cum
  // să se bucleze) ține steagul la zi fără reîncărcare.
  window.addEventListener("storage", (e) => {
    if (e.key === CHEIE_LIMBA && e.newValue) {
      seteazaSteagCurent(e.newValue);
      marcheazaActiva(e.newValue);
    }
  });
})();
