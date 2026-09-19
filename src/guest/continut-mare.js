/* Stratul "mare" de continut: Regulamentul si textul Atractiilor, cel
 * mai lung text editorial din aplicatie, dar citit rar (doar cine
 * deschide panoul respectiv). De aceea NU vine prin dispecerul static
 * din continut.js, ci prin import() dinamic, per limba — bundle-ul
 * mobil-optimizat nu-l descarca pana nu e nevoie de el.
 *
 * Separat de continut.<lang>.js (vezi Task 7 din spec): daca REGULAMENT
 * ar sta alaturi de BUN_VENIT/IMPORTANT in acelasi fisier, un import()
 * dinamic ar aduce si continutul mic o data in plus — exact dubla
 * incarcare pe care separarea asta o evita. */
import { useEffect, useState } from "react";
import { useLimba } from "./limbi.jsx";

const INCARCATOR_REGULAMENT = {
  ro: () => import("./regulament.ro.js"),
  en: () => import("./regulament.en.js"),
  fr: () => import("./regulament.fr.js"),
  it: () => import("./regulament.it.js"),
  de: () => import("./regulament.de.js"),
  ru: () => import("./regulament.ru.js"),
  uk: () => import("./regulament.uk.js"),
};

const INCARCATOR_ATRACTII = {
  ro: () => import("./atractii-text.ro.js"),
  en: () => import("./atractii-text.en.js"),
  fr: () => import("./atractii-text.fr.js"),
  it: () => import("./atractii-text.it.js"),
  de: () => import("./atractii-text.de.js"),
  ru: () => import("./atractii-text.ru.js"),
  uk: () => import("./atractii-text.uk.js"),
};

/* Fabrica comuna: acelasi tipar de incarcare leneasa pentru regulament si
 * atractii, doar sursa difera. Recalculeaza la schimbarea limbii — un
 * oaspete care schimba limba cu fereastra regulamentului deschisa vede
 * noul text, nu ramane cu cel vechi in cache. */
function useContinutMare(incarcator, extrage) {
  const { cod } = useLimba();
  const [stare, setStare] = useState({ stare: "incarca", date: null });

  useEffect(() => {
    let viu = true;
    setStare({ stare: "incarca", date: null });
    incarcator[cod]()
      .then((modul) => { if (viu) setStare({ stare: "gata", date: extrage(modul) }); })
      /* Fara catch, un import() esuat (conexiune pierduta, sau un chunk
         hash-uit disparut dupa un redeploy, cerut de o sesiune PWA veche)
         ar fi lasat panoul blocat pe "Se incarca…" la nesfarsit, cu o
         respingere de promisiune netratata. */
      .catch(() => { if (viu) setStare({ stare: "eroare", date: null }); });
    return () => { viu = false; };
  }, [cod]);

  return stare;
}

export function useRegulament() {
  const { stare, date } = useContinutMare(INCARCATOR_REGULAMENT, (m) => m.REGULAMENT);
  return { stare, regulament: date };
}

export function useAtractiiTextMare() {
  const { stare, date } = useContinutMare(INCARCATOR_ATRACTII, (m) => m.ATRACTII_TEXT);
  return { stare, texte: date };
}
