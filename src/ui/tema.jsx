/* Tema aleasa pentru tot PMS-ul: un context scris din „Useri și drepturi"
 * (Contul meu), care tine clasa de pe <html> la zi si, pe „Ca sistemul",
 * urmareste telefonul. Regulile pure sunt in lib/tema.js. Fara provider (in
 * teste), tema e „sistem" si setarea nu face nimic.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { citesteTema, scrieTema, aplicaTema } from "../lib/tema.js";

const Context = createContext({ tema: "sistem", seteazaTema: () => {} });

export function TemaProvider({ children }) {
  const [tema, setTema] = useState(() => citesteTema(globalThis.localStorage));
  useEffect(() => aplicaTema(document, tema, (q) => window.matchMedia?.(q)), [tema]);
  const valoare = useMemo(() => ({
    tema,
    seteazaTema: (v) => { scrieTema(globalThis.localStorage, v); setTema(v); },
  }), [tema]);
  return <Context.Provider value={valoare}>{children}</Context.Provider>;
}

export const useTema = () => useContext(Context);
