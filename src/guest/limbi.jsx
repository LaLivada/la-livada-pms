/* Limbile paginii oaspetelui — catalogul, detectarea dupa telefon si
 * persistarea alegerii manuale.
 *
 * Coduri ISO 639-1, nu ad-hoc: `uk` pentru ucraineana, nu `ua` (`UA` e
 * codul de TARA, nu de limba — o confuzie frecventa).
 *
 * Engleza, nu romana, e limba de rezerva: un turist a carui limba nu e
 * in lista are sanse mai mari sa inteleaga engleza decat romana. */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const LIMBI = [
  { cod: "ro", nume: "Română",     steag: "🇷🇴" },
  { cod: "en", nume: "English",    steag: "🇬🇧" },
  { cod: "fr", nume: "Français",   steag: "🇫🇷" },
  { cod: "it", nume: "Italiano",   steag: "🇮🇹" },
  { cod: "de", nume: "Deutsch",    steag: "🇩🇪" },
  { cod: "ru", nume: "Русский",    steag: "🇷🇺" },
  { cod: "uk", nume: "Українська", steag: "🇺🇦" },
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

const LimbaContext = createContext(null);

export function LimbaProvider({ children }) {
  const [cod, setCod] = useState(
    () => limbaSalvata() || detecteazaLimba(navigator.languages));

  useEffect(() => {
    try { localStorage.setItem(CHEIE_STOCARE, cod); } catch { /* vezi mai sus */ }
  }, [cod]);

  const valoare = useMemo(() => {
    const limba = LIMBI.find((l) => l.cod === cod) || LIMBI[0];
    return { cod: limba.cod, steag: limba.steag, seteazaLimba: setCod };
  }, [cod]);

  return <LimbaContext.Provider value={valoare}>{children}</LimbaContext.Provider>;
}

export function useLimba() {
  const ctx = useContext(LimbaContext);
  if (!ctx) throw new Error("useLimba() cere <LimbaProvider> deasupra in arbore.");
  return ctx;
}
