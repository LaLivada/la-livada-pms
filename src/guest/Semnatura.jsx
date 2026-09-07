/* Panza de semnat.
 *
 * Pointer events, nu touch si mouse separat: acelasi cod pentru deget,
 * stylus si mouse. `setPointerCapture` tine linia si daca degetul iese din
 * panza — fara el, o semnatura care depaseste marginea se rupe in doua.
 *
 * `touch-action: none` din stiluri NU e optional: fara el, browserul
 * interpreteaza tragerea ca derulare a paginii si nu ajunge niciun punct la
 * componenta. Panza pare complet moarta, si numai pe telefon.
 *
 * STAREA DESENULUI STA IN REF-URI, NU IN useState, si asta a fost o
 * reparatie. Prima varianta tinea „deseneaza" si traseele in stare React;
 * `pointermove` verifica `deseneaza`, dar mai multe evenimente sosite in
 * acelasi tact citeau toate valoarea DINAINTE de randare si se aruncau
 * singure. Prins la verificare: dintr-o linie cu douazeci de puncte ramanea
 * unul. Pe un telefon, unde evenimentele vin in rafale, o miscare rapida ar
 * fi pierdut exact inceputul semnaturii — si nimic n-ar fi parut stricat.
 *
 * Ref-urile se actualizeaza sincron, deci fiecare eveniment vede ce a lasat
 * cel dinainte. `onSchimbare` ramane chemat la fiecare punct, ca parintele
 * sa poata desena.
 */
import { useRef } from "react";
import { LATIME_PANZA, INALTIME_PANZA } from "../lib/semnatura.js";

export default function Semnatura({ valoare, onSchimbare }) {
  const svgRef = useRef(null);
  const traseeRef = useRef([]);
  const desenRef = useRef(false);
  const linii = Array.isArray(valoare) ? valoare : [];

  /* Coordonatele se traduc in sistemul panzei (600x200), nu se iau in pixeli
     de ecran: altfel aceeasi semnatura ar iesi de alta marime de pe fiecare
     telefon, si ar arata altfel pe fisa tiparita. */
  const punct = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * LATIME_PANZA,
      y: ((e.clientY - r.top) / r.height) * INALTIME_PANZA,
    };
  };

  const incepe = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    desenRef.current = true;
    traseeRef.current = [...traseeRef.current, [punct(e)]];
    onSchimbare(traseeRef.current);
  };

  const continua = (e) => {
    if (!desenRef.current) return;
    const t = traseeRef.current;
    const ultima = t[t.length - 1] || [];
    traseeRef.current = [...t.slice(0, -1), [...ultima, punct(e)]];
    onSchimbare(traseeRef.current);
  };

  const termina = () => { desenRef.current = false; };

  const sterge = () => {
    traseeRef.current = [];
    desenRef.current = false;
    onSchimbare([]);
  };

  return (
    <div className="g-semnatura">
      <svg ref={svgRef} className="g-semnatura-panza"
        viewBox={`0 0 ${LATIME_PANZA} ${INALTIME_PANZA}`}
        onPointerDown={incepe} onPointerMove={continua}
        onPointerUp={termina} onPointerCancel={termina}
        role="img" aria-label="Zona de semnătură">
        {linii.map((linie, i) => (
          <polyline key={i} className="g-semnatura-linie"
            points={linie.map((p) => `${p.x},${p.y}`).join(" ")} />
        ))}
      </svg>
      <div className="g-semnatura-jos">
        <span>Semnează cu degetul</span>
        <button type="button" className="g-legatura" onClick={sterge}>Șterge</button>
      </div>
    </div>
  );
}
