/* Scheletul de încărcare (faza 3, C10) — pentru site-ul de rezervări și
 * aplicația de oaspete, care altfel nu importă nimic din ui/. Fișierul e
 * mic și fără alte dependențe, ca lib/retea.js, deci nu apasă pe bundle-urile
 * lor; e o singură definiție pentru amândouă.
 *
 * DE CE SCHELET, NU „SE ÎNCARCĂ…": pe telefon, pe date mobile, lista de
 * camere vine în 1–3 secunde, iar o funcție edge pornită la rece poate
 * ține și 10. Un rând de text în locul listei lasă pagina să pară goală și
 * omul apasă iar butonul; niște rânduri gri în forma listei spun „vine, e
 * pe drum" fără cuvinte. Cititorul de ecran primește în schimb cuvintele
 * (eticheta, role=status).
 *
 * `useIncet`: după `PRAG_INCET_MS` de așteptare apare un rând care spune că
 * durează mai mult decât de obicei — între „a înghețat?" și timeout-ul de
 * 15 secunde din lib/retea.js (B4), omul are nevoie de un semn că merită să
 * mai aștepte. Rândul dispare singur când așteptarea se termină.
 */
import React, { useEffect, useState } from "react";

export const PRAG_INCET_MS = 5000;
export const MESAJ_INCET = "Durează mai mult decât de obicei — serverul pornește. Mai așteaptă câteva secunde.";

/* true după `ms` de când `activ` e adevărat; cade la false odată cu `activ`. */
export function useIncet(activ, ms = PRAG_INCET_MS) {
  const [incet, setIncet] = useState(false);
  useEffect(() => {
    if (!activ) { setIncet(false); return; }
    const ceas = setTimeout(() => setIncet(true), ms);
    return () => clearTimeout(ceas);
  }, [activ, ms]);
  return incet;
}

/* `randuri`: câte rânduri-placeholder (forma listei de camere: titlu, un
   rând de text, prețul în dreapta); `eticheta`: ce citește cititorul de
   ecran; `incet`: arată rândul „durează mai mult". */
export function Schelet({ randuri = 3, eticheta = "Se încarcă…", incet = false, className = "" }) {
  return (
    <div className={("schelet " + className).trim()} role="status" aria-busy="true" aria-live="polite">
      <span className="schelet-eticheta">{eticheta}</span>
      {Array.from({ length: randuri }, (_, i) => (
        <div className="schelet-rand" key={i} aria-hidden="true">
          <div className="schelet-info">
            <div className="schelet-linie schelet-titlu" />
            <div className="schelet-linie schelet-text" />
          </div>
          <div className="schelet-linie schelet-pret" />
        </div>
      ))}
      {incet && <p className="schelet-incet">{MESAJ_INCET}</p>}
    </div>
  );
}

/* Stilul sta in schelet-stil.js (sir pur, fara React), ca sa-l poata lua
   si foile de stil ale celor doua aplicatii; re-exportat de aici. */
export { STIL_SCHELET } from "./schelet-stil.js";
