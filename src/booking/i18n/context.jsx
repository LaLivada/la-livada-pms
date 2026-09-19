/* Contextul de limbă al motorului de rezervare.
 *
 * `t(cheie, vars?)` caută textul în dicționarul limbii curente; dacă
 * lipsește (traducere neterminată), cade pe dicționarul român — mai bine
 * o propoziție în română decât o cheie brută ("cautare.titlu") pe ecran.
 * `{{nume}}` din șablon se înlocuiește cu `vars.nume`.
 *
 * `plural(n, cheie)` alege forma corectă dintr-un obiec {one,few,many,other}
 * din dicționar, folosind regulile REALE de plural ale limbii curente
 * (Intl.PluralRules) — engleza/franceza/italiana/germana au două forme,
 * rusa/ucraineana au trei (plus "other" pentru zecimale), iar pentru
 * română regula diferă de-a lor și e ținută separat, în `numarRo`.
 */
import { createContext, useContext, useMemo, useState, useEffect } from "react";
import {
  LIMBI, CODURI_LIMBA, detecteazaLimba, salveazaLimba, CHEIE_LIMBA, localeIntl,
} from "./limbi.js";
import ro from "./dictionare/ro.js";
import en from "./dictionare/en.js";
import fr from "./dictionare/fr.js";
import it from "./dictionare/it.js";
import de from "./dictionare/de.js";
import ru from "./dictionare/ru.js";
import uk from "./dictionare/uk.js";

const DICTIONARE = { ro, en, fr, it, de, ru, uk };

function citesteCale(obiect, cale) {
  return cale.split(".").reduce((o, k) => (o == null ? o : o[k]), obiect);
}

/* Regula românească de plural pentru substantive ca "minut": numeralele
   al căror rest la 100 e între 1 și 19 se leagă direct de substantiv,
   restul cer „de" — „5 minute", dar „25 de minute". N-are echivalent în
   Intl.PluralRules (care pentru "ro" întoarce doar few/many/other pe alte
   praguri), deci rămâne cod separat, folosit doar pentru limba română. */
export function numarRo(n, forme) {
  const rest = n % 100;
  const simplu = rest >= 1 && rest <= 19;
  if (n === 1) return forme.one;
  return simplu ? forme.few ?? forme.other : forme.many ?? forme.other;
}

const Ctx = createContext(null);

export function LimbaProvider({ children }) {
  const [limba, setLimbaState] = useState(() => detecteazaLimba());

  /* Dacă selectorul din antet (script separat, fără React) schimbă limba
     cât timp pagina asta e deschisă în alt tab/altă montare, sincronizăm —
     „storage" nu se declanșează în tab-ul care a scris el însuși, deci
     nu există buclă. */
  useEffect(() => {
    function laModificare(e) {
      if (e.key === CHEIE_LIMBA && e.newValue && CODURI_LIMBA.includes(e.newValue)) {
        setLimbaState(e.newValue);
      }
    }
    window.addEventListener("storage", laModificare);
    return () => window.removeEventListener("storage", laModificare);
  }, []);

  const setLimba = (cod) => {
    if (!CODURI_LIMBA.includes(cod)) return;
    salveazaLimba(cod);
    setLimbaState(cod);
  };

  const valoare = useMemo(() => {
    const dict = DICTIONARE[limba] || ro;
    const regula = new Intl.PluralRules(localeIntl(limba));

    function t(cheie, vars) {
      const sablon = citesteCale(dict, cheie) ?? citesteCale(ro, cheie) ?? cheie;
      if (typeof sablon !== "string" || !vars) return sablon;
      return sablon.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ""));
    }

    function plural(n, cheie) {
      const forme = citesteCale(dict, cheie) || citesteCale(ro, cheie);
      if (!forme) return String(n);
      if (limba === "ro") return numarRo(n, forme);
      const categorie = regula.select(n);
      return forme[categorie] ?? forme.other ?? Object.values(forme)[0];
    }

    return { limba, setLimba, t, plural, locale: localeIntl(limba) };
  }, [limba]);

  return <Ctx.Provider value={valoare}>{children}</Ctx.Provider>;
}

export function useLimba() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLimba() cere <LimbaProvider> deasupra în arbore.");
  return ctx;
}

export { LIMBI };
