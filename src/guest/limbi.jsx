/* Limbile paginii oaspetelui — catalogul, detectarea dupa telefon si
 * persistarea alegerii manuale.
 *
 * Coduri ISO 639-1, nu ad-hoc: `uk` pentru ucraineana, nu `ua` (`UA` e
 * codul de TARA, nu de limba — o confuzie frecventa).
 *
 * Engleza, nu romana, e limba de rezerva: un turist a carui limba nu e
 * in lista are sanse mai mari sa inteleaga engleza decat romana. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* Steaguri desenate ca SVG, nu emoji — pe Windows multe fonturi arata
 * codul tarii ca text simplu ("GB") in loc de steagul colorat, exact ce
 * a semnalat Ovidiu la verificare. Un SVG propriu randeaza la fel peste
 * tot, indiferent de fontul de emoji instalat. Aceleasi forme si culori
 * ca la selectorul din situl de rezervari (booking/limba-selector.js),
 * pentru consecventa vizuala intre cele doua produse. */
function SteagRO() {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
      <rect width="3" height="2" fill="#002B7F" /><rect x="1" width="1" height="2" fill="#FCD116" /><rect x="2" width="1" height="2" fill="#CE1126" />
    </svg>
  );
}
function SteagEN() {
  return (
    <svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="30" fill="#00247d" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#cf142b" strokeWidth="2" />
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#cf142b" strokeWidth="6" />
    </svg>
  );
}
function SteagFR() {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
      <rect width="3" height="2" fill="#fff" /><rect width="1" height="2" fill="#0055A4" /><rect x="2" width="1" height="2" fill="#EF4135" />
    </svg>
  );
}
function SteagIT() {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
      <rect width="3" height="2" fill="#fff" /><rect width="1" height="2" fill="#009246" /><rect x="2" width="1" height="2" fill="#CE2B37" />
    </svg>
  );
}
function SteagDE() {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
      <rect width="3" height="0.667" fill="#000" /><rect y="0.667" width="3" height="0.666" fill="#DD0000" /><rect y="1.333" width="3" height="0.667" fill="#FFCE00" />
    </svg>
  );
}
function SteagRU() {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
      <rect width="3" height="0.667" fill="#fff" /><rect y="0.667" width="3" height="0.666" fill="#0039A6" /><rect y="1.333" width="3" height="0.667" fill="#D52B1E" />
    </svg>
  );
}
function SteagUK() {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
      <rect width="3" height="1" fill="#0057B7" /><rect y="1" width="3" height="1" fill="#FFD700" />
    </svg>
  );
}

export const LIMBI = [
  { cod: "ro", nume: "Română",     Steag: SteagRO, locale: "ro-RO" },
  { cod: "en", nume: "English",    Steag: SteagEN, locale: "en-GB" },
  { cod: "fr", nume: "Français",   Steag: SteagFR, locale: "fr-FR" },
  { cod: "it", nume: "Italiano",   Steag: SteagIT, locale: "it-IT" },
  { cod: "de", nume: "Deutsch",    Steag: SteagDE, locale: "de-DE" },
  { cod: "ru", nume: "Русский",    Steag: SteagRU, locale: "ru-RU" },
  { cod: "uk", nume: "Українська", Steag: SteagUK, locale: "uk-UA" },
];

export const LIMBA_IMPLICITA = "en";

const CODURI = new Set(LIMBI.map((l) => l.cod));

/* Primele doua litere dintr-o eticheta BCP-47 ("en-US" -> "en"), fara sa
 * presupunem ca eticheta are neaparat o regiune. */
function codDeLimba(eticheta) {
  return String(eticheta || "").slice(0, 2).toLowerCase();
}

export function detecteazaLimba(navigatorLanguages) {
  for (const eticheta of navigatorLanguages || []) {
    const cod = codDeLimba(eticheta);
    if (CODURI.has(cod)) return cod;
  }
  return LIMBA_IMPLICITA;
}

const CHEIE_STOCARE = "g-limba";

function limbaSalvata() {
  try {
    const v = localStorage.getItem(CHEIE_STOCARE);
    return CODURI.has(v) ? v : null;
  } catch {
    // Safari in mod privat, sau localStorage dezactivat: nu blocam pagina.
    return null;
  }
}

/* Aceeasi regula de rezolvare ca `LimbaProvider`, dar utilizabila inainte
 * de primul render — manifestul PWA (vezi instalare.js) se pregateste
 * sincron, la incarcarea modulului, inaintea oricarei componente React. */
export function limbaCurenta() {
  return limbaSalvata() || detecteazaLimba(navigator.languages);
}

const LimbaContext = createContext(null);

export function LimbaProvider({ children }) {
  const [cod, setCod] = useState(
    () => limbaSalvata() || detecteazaLimba(navigator.languages));

  useEffect(() => {
    document.documentElement.lang = cod;
  }, [cod]);

  /* Persista doar alegerea MANUALA (butonul din SelectorLimba), nu si
     limba auto-detectata la prima montare — altfel un oaspete a carui
     limba a telefonului nu era in `localStorage` ar fi "fixat" acolo
     limba detectata la prima vizita, iar o schimbare ulterioara a limbii
     telefonului n-ar mai avea niciun efect. */
  const seteazaLimba = useCallback((codNou) => {
    setCod(codNou);
    try { localStorage.setItem(CHEIE_STOCARE, codNou); } catch { /* vezi mai sus */ }
  }, []);

  const valoare = useMemo(() => {
    const limba = LIMBI.find((l) => l.cod === cod)
      || LIMBI.find((l) => l.cod === LIMBA_IMPLICITA);
    return { cod: limba.cod, Steag: limba.Steag, locale: limba.locale, seteazaLimba };
  }, [cod, seteazaLimba]);

  return <LimbaContext.Provider value={valoare}>{children}</LimbaContext.Provider>;
}

export function useLimba() {
  const ctx = useContext(LimbaContext);
  if (!ctx) throw new Error("useLimba() cere <LimbaProvider> deasupra in arbore.");
  return ctx;
}
