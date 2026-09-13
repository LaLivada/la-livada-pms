/* Fereastra suprapusa, folosita de trei panouri: „Acces către camere",
 * „Regulamentul complexului" si fișa de cazare.
 *
 * Fisier propriu, nu functie locala in App.jsx: Fisa.jsx are nevoie de ea
 * la fel ca App.jsx, iar o functie definita in App.jsx n-ar fi putut fi
 * importata de acolo fara un ciclu de importuri intre cele doua fisiere.
 *
 * Scrisa de mana, nu adusa dintr-o biblioteca: are de facut patru lucruri
 * — Escape, clic pe fundal, blocarea derularii in spate si intoarcerea
 * focusului la butonul care a deschis-o — iar pentru atat n-are rost inca
 * un pachet intr-un bundle deschis pe date mobile.
 *
 * Intoarcerea focusului nu e podoaba de accesibilitate: cine navigheaza cu
 * tastatura sau cu VoiceOver ar fi aruncat la inceputul paginii la fiecare
 * inchidere, si ar trebui sa refaca tot drumul pana la butoane. */
import { useEffect, useRef } from "react";

/* Elementele pe care Tab le poate atinge — folosit ca sa gasim primul si
   ultimul din fereastra, pentru capcana de mai jos. `offsetParent !== null`
   scoate din calcul ce e ascuns cu `display:none` (de pilda campurile unei
   optiuni nealese), fara sa umble dupa fiecare stil in parte. */
const SELECTOR_FOCUSABIL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function elementeFocusabile(container) {
  return Array.from(container.querySelectorAll(SELECTOR_FOCUSABIL))
    .filter((el) => el.offsetParent !== null);
}

export default function Fereastra({ titlu, antet, onInchide, children }) {
  const butonInchide = useRef(null);
  const fereastra = useRef(null);

  useEffect(() => {
    const deUnde = document.activeElement;
    const derulareVeche = document.body.style.overflow;

    /* Capcana de Tab: verificata la 13 septembrie 2026, tastand efectiv in
       fereastra fisei de cazare (18 campuri focusabile) — Shift+Tab din „×"
       sarea pe bannerul de dedesubt, iar Tab din „Semnez si trimit" sarea pe
       „Bun venit", ambele in pagina din spate. Fundalul (`.g-fundal`) e doar
       semitransparent, deci elementul ajuns acolo se vede, pe jumatate
       acoperit — exact cazul „Focus Not Obscured" din WCAG 2.2 AA. Fara
       capcana, oricine navigheaza fara mouse putea iesi din formular fara sa
       observe. Recalculata la fiecare Tab, nu memorata o singura data la
       montare: campurile fisei apar/dispar (alegerea unui tip de act
       schimba ce se vede), iar o lista veche ar fi tinut Tab-ul in bucla
       peste un element care nu mai exista. */
    const laTasta = (e) => {
      if (e.key === "Escape") { onInchide(); return; }
      if (e.key !== "Tab" || !fereastra.current) return;
      const focusabile = elementeFocusabile(fereastra.current);
      if (focusabile.length === 0) return;
      const prim = focusabile[0];
      const ultim = focusabile[focusabile.length - 1];
      if (e.shiftKey && document.activeElement === prim) {
        e.preventDefault();
        ultim.focus();
      } else if (!e.shiftKey && document.activeElement === ultim) {
        e.preventDefault();
        prim.focus();
      }
    };

    document.addEventListener("keydown", laTasta);
    document.body.style.overflow = "hidden";
    butonInchide.current?.focus();

    return () => {
      document.removeEventListener("keydown", laTasta);
      document.body.style.overflow = derulareVeche;
      if (deUnde instanceof HTMLElement) deUnde.focus();
    };
  }, [onInchide]);

  return (
    <div className="g-fundal" onClick={onInchide}>
      {/* Clicul dinauntru nu se propaga la fundal, altfel orice apasare pe
          o poza ar inchide fereastra. */}
      <div ref={fereastra} className="g-fereastra" role="dialog" aria-modal="true" aria-label={titlu}
           onClick={(e) => e.stopPropagation()}>
        {/* `antet` inlocuieste titlul scris, pentru ferestrele care au nevoie
            de un cap propriu — regulamentul isi pune sigla acolo. `titlu`
            ramane oricum numele citit de cititoarele de ecran. */}
        <div className="g-fereastra-cap">
          {antet ?? <h2>{titlu}</h2>}
          <button ref={butonInchide} type="button" onClick={onInchide}
                  className="g-inchide" aria-label="Închide">×</button>
        </div>
        <div className="g-fereastra-corp">{children}</div>
      </div>
    </div>
  );
}
