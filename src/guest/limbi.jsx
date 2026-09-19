/* Limbile paginii oaspetelui — catalogul, detectarea dupa telefon si
 * persistarea alegerii manuale.
 *
 * Coduri ISO 639-1, nu ad-hoc: `uk` pentru ucraineana, nu `ua` (`UA` e
 * codul de TARA, nu de limba — o confuzie frecventa).
 *
 * Engleza, nu romana, e limba de rezerva: un turist a carui limba nu e
 * in lista are sanse mai mari sa inteleaga engleza decat romana. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const LIMBI = [
  { cod: "ro", nume: "Română",     steag: "🇷🇴", locale: "ro-RO" },
  { cod: "en", nume: "English",    steag: "🇬🇧", locale: "en-GB" },
  { cod: "fr", nume: "Français",   steag: "🇫🇷", locale: "fr-FR" },
  { cod: "it", nume: "Italiano",   steag: "🇮🇹", locale: "it-IT" },
  { cod: "de", nume: "Deutsch",    steag: "🇩🇪", locale: "de-DE" },
  { cod: "ru", nume: "Русский",    steag: "🇷🇺", locale: "ru-RU" },
  { cod: "uk", nume: "Українська", steag: "🇺🇦", locale: "uk-UA" },
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
    return { cod: limba.cod, steag: limba.steag, locale: limba.locale, seteazaLimba };
  }, [cod, seteazaLimba]);

  return <LimbaContext.Provider value={valoare}>{children}</LimbaContext.Provider>;
}

export function useLimba() {
  const ctx = useContext(LimbaContext);
  if (!ctx) throw new Error("useLimba() cere <LimbaProvider> deasupra in arbore.");
  return ctx;
}
