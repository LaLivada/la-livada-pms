/* Starea comutatorului „Interfața: Nouă / Actuală" si a temei, pentru tot
 * PMS-ul: un context citit de Shell (navigarea jos, butonul „inapoi"), de
 * Dialog (istoricul), de Azi si Clienti (culorile starilor), de formularul
 * de rezervare (erorile langa camp) si scris din „Useri și drepturi".
 * Regulile pure sunt in lib/interfata.js. Fara provider (in teste), valoarea
 * implicita e interfata noua, cu setari care nu fac nimic.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { citesteInterfata, scrieInterfata, citesteTema, scrieTema, aplicaTema } from "../lib/interfata.js";

const Context = createContext({
  interfata: "noua", noua: true, seteazaInterfata: () => {},
  tema: "sistem", seteazaTema: () => {},
});

export function InterfataProvider({ children }) {
  const [interfata, setInterfata] = useState(() => citesteInterfata(globalThis.localStorage));
  const [tema, setTema] = useState(() => citesteTema(globalThis.localStorage));
  useEffect(() => aplicaTema(document, tema, (q) => window.matchMedia?.(q)), [tema]);
  const valoare = useMemo(() => ({
    interfata, noua: interfata === "noua",
    seteazaInterfata: (v) => { scrieInterfata(globalThis.localStorage, v); setInterfata(v); },
    tema,
    seteazaTema: (v) => { scrieTema(globalThis.localStorage, v); setTema(v); },
  }), [interfata, tema]);
  return <Context.Provider value={valoare}>{children}</Context.Provider>;
}

export const useInterfata = () => useContext(Context);

/* Radacina .pms cu clasa `ui-noua` cand comutatorul e pe „Nouă": pms.css
   tine acolo tot ce e doar al interfetei noi (navigarea jos, bara de
   actiuni lipita, tintele mai mari). */
export function RadacinaPms({ children }) {
  const { noua } = useInterfata();
  return <div className={"pms" + (noua ? " ui-noua" : "")}>{children}</div>;
}
