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

export default function Fereastra({ titlu, antet, onInchide, children }) {
  const butonInchide = useRef(null);

  useEffect(() => {
    const deUnde = document.activeElement;
    const laTasta = (e) => { if (e.key === "Escape") onInchide(); };
    const derulareVeche = document.body.style.overflow;

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
      <div className="g-fereastra" role="dialog" aria-modal="true" aria-label={titlu}
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
