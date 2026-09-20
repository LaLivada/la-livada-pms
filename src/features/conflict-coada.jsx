/* Coada conflictelor de concurenta (faza 3, C5) si gazda dialogului:
 * intrebarea pusa omului cand baza a refuzat o salvare. Regulile raman in
 * lib/conflict.js, dialogul in features/conflict.jsx; aici e doar cine
 * asteapta la rand. Scoase din pms-app.jsx ca sa poata fi montate intr-un
 * test — PMSApp cere autentificare, deci ce ramane inchis in el nu se poate
 * apara (conflict-coada.test.js).
 *
 * De ce coada si nu un singur loc: pana pe 20 septembrie 2026 dialogul
 * tinea UN conflict (`useState(null)`). Doua salvari respinse aproape
 * deodata — doua check-in-uri la rand — ajungeau amandoua la `setConflict`,
 * iar a doua o inlocuia pe prima: `alege` al primei nu mai putea fi chemat
 * de nimeni, promisiunea ei ramanea neimplinita, si odata cu ea tot ce o
 * astepta (`doCheckIn`, `saveInner`) — fara nicio eroare pe ecran.
 */
import React, { useState, useCallback, useRef, lazy, Suspense } from "react";
import { uid } from "../lib/uid.js";
import { eDubluTap, FARA_TAP } from "../lib/gest.js";

const ConflictDialog = lazy(() => import("./conflict.jsx").then((m) => ({ default: m.ConflictDialog })));

/* [conflictul de aratat, intreaba(randuri) → alegerea omului]. Primul venit
   e pe ecran pana i se raspunde; restul isi asteapta randul. Un raspuns isi
   scoate din coada DOAR intrarea lui. */
export function useCoadaConflicte() {
  const [coada, setCoada] = useState([]);
  const ultimulRaspuns = useRef(FARA_TAP);
  const intreaba = useCallback((randuri) => new Promise((rezolva) => {
    const intrare = {
      id: uid(),
      randuri,
      alege: (alegere) => {
        /* Dialogul urmator apare exact in locul celui dinainte, cu aceleasi
           butoane: a doua jumatate a unui dublu-click pe „Pastreaza a mea" ar
           raspunde si la el, necitit. Inchiderea (Esc, X, „inapoi") nu trece
           pe aici: nu scrie nimic, iar „inapoi" a consumat deja intrarea din
           istoric a ferestrei — ignorata, ar lasa-o deschisa fara ea. */
        if (alegere) {
          const acum = performance.now();
          const pereche = eDubluTap(ultimulRaspuns.current, acum);
          ultimulRaspuns.current = acum;
          if (pereche) return;
        }
        setCoada((c) => c.filter((x) => x !== intrare));
        rezolva(alegere);
      },
    };
    setCoada((c) => [...c, intrare]);
  }), []);
  return [coada[0] || null, intreaba];
}

/* Dialogul conflictului de concurenta (faza 3, C5), cat timp o salvare
   asteapta alegerea omului. `key`: fiecare conflict e o fereastra noua, cu
   focusul si intrarea ei din istoricul browserului (ui/istoric.jsx) — altfel
   al doilea ar mosteni intrarea deja consumata a primului, iar „inapoi" pe
   telefon ar iesi din PMS. */
export function ConflictHost({ conflict, core, groups }) {
  if (!conflict) return null;
  return (
    <Suspense fallback={null}>
      <ConflictDialog key={conflict.id} randuri={conflict.randuri} core={core} groups={groups} onAlege={conflict.alege} />
    </Suspense>
  );
}
