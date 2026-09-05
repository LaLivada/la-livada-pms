/* Calendarul de perioadă: sosirea și plecarea se aleg din același calendar,
 * cu două apăsări.
 *
 * De ce nu două `<input type="date">`, cum era înainte: acelea nu știu de
 * interval. Fiecare deschidea propriul calendar nativ, iar omul trebuia să
 * țină minte ce dată alesese în celălalt ca să nu ceară o plecare înaintea
 * sosirii. Aici a doua apăsare se raportează la prima, iar zilele dintre ele
 * se colorează în timp ce alegi.
 *
 * Selecția e ținută AICI până e completă. Cât timp e aleasă doar sosirea,
 * părintele păstrează perioada dinainte — altfel butonul „Caută camere" ar fi
 * trecut printr-o stare fără plecare, adică zero nopți, adică dezactivat
 * exact între cele două apăsări.
 */
import { useState, useRef, useEffect } from "react";
import {
  adunaZile, noptiIntre, primaZiDinLuna, adunaLuni, numeLuna, numeZiLunga,
  CAPETE_ZILE, saptamaniDinLuna,
} from "./zile.js";

/* Două luni pe ecran lat, una pe telefon. A doua e ascunsă din CSS
   (`display:none`), deci nu ajunge nici în arborele de accesibilitate —
   cititorul de ecran nu anunță o lună care nu se vede. */
const LUNI_AFISATE = 2;

export function CalendarPerioada({
  sosire, plecare, minZi, maxZi, maxNopti = 30, onSchimba,
}) {
  const [luna, setLuna] = useState(() => primaZiDinLuna(sosire || minZi));
  /* Sosirea aleasă, în așteptarea plecării. Null = nu e nicio alegere în curs,
     deci următoarea apăsare începe una nouă. */
  const [inCurs, setInCurs] = useState(null);
  const [subMouse, setSubMouse] = useState(null);
  /* Ziua care primește focus la navigarea cu tastele. Una singură e în lista
     de taburi; fără asta, cele ~60 de butoane ar fi 60 de opriri de tab. */
  const [ziFocus, setZiFocus] = useState(() => sosire || minZi);
  const mutaFocus = useRef(false);

  useEffect(() => {
    if (!mutaFocus.current) return;
    mutaFocus.current = false;
    document.getElementById(`ldv-zi-${ziFocus}`)?.focus();
  }, [ziFocus]);

  const start = inCurs || sosire;
  const sfarsit = inCurs ? subMouse : plecare;

  const inInterval = (zi) => {
    if (!start || !sfarsit) return false;
    return zi > start && zi < sfarsit;
  };

  /* O zi e indisponibilă dacă iese din fereastra permisă sau, cât timp
     alegem plecarea, dacă ar depăși numărul maxim de nopți. Zilele de
     dinaintea sosirii rămân apăsabile: o apăsare acolo nu e o greșeală, e
     răzgândirea — reîncepe alegerea de la ziua aceea. */
  const indisponibila = (zi) => {
    if (zi < minZi || zi > maxZi) return true;
    if (inCurs && zi > inCurs && noptiIntre(inCurs, zi) > maxNopti) return true;
    return false;
  };

  function apasa(zi) {
    if (indisponibila(zi)) return;
    if (!inCurs) {
      setInCurs(zi);
      setSubMouse(null);
      return;
    }
    if (zi <= inCurs) {
      // Nu e o plecare validă — o luăm drept sosire nouă.
      setInCurs(zi);
      setSubMouse(null);
      return;
    }
    onSchimba(inCurs, zi);
    setInCurs(null);
    setSubMouse(null);
  }

  function laTasta(e, zi) {
    const sarituri = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      PageUp: -28, PageDown: 28,
    };
    const n = sarituri[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const tinta = adunaZile(zi, n);
    if (tinta < minZi || tinta > maxZi) return;
    /* Calendarul urmează focusul: fără asta, săgeata dreapta de pe 31 ar fi
       dus focusul pe o zi care nu e afișată. */
    const lunaTinta = primaZiDinLuna(tinta);
    if (lunaTinta < luna) setLuna(lunaTinta);
    if (lunaTinta > adunaLuni(luna, LUNI_AFISATE - 1)) {
      setLuna(adunaLuni(lunaTinta, -(LUNI_AFISATE - 1)));
    }
    mutaFocus.current = true;
    setZiFocus(tinta);
  }

  const luniDeAfisat = Array.from({ length: LUNI_AFISATE },
    (_, i) => adunaLuni(luna, i));
  const inapoiOprit = adunaLuni(luna, -1) < primaZiDinLuna(minZi);
  const inainteOprit = adunaLuni(luna, LUNI_AFISATE) > primaZiDinLuna(maxZi);

  return (
    <div className="ldv-cal" onMouseLeave={() => setSubMouse(null)}>
      <div className="ldv-cal-bara">
        <button type="button" className="ldv-cal-nav" disabled={inapoiOprit}
          aria-label="Luna anterioară"
          onClick={() => setLuna((l) => adunaLuni(l, -1))}>‹</button>
        <div className="ldv-cal-titluri" aria-live="polite">
          {luniDeAfisat.map((l) => (
            <span key={l} className="ldv-cal-titlu">{numeLuna(l)}</span>
          ))}
        </div>
        <button type="button" className="ldv-cal-nav" disabled={inainteOprit}
          aria-label="Luna următoare"
          onClick={() => setLuna((l) => adunaLuni(l, 1))}>›</button>
      </div>

      <div className="ldv-cal-luni">
        {luniDeAfisat.map((l) => (
          <table className="ldv-cal-luna" key={l}>
            <caption className="ldv-doar-citit">{numeLuna(l)}</caption>
            <thead>
              <tr>
                {CAPETE_ZILE.map((c, i) => (
                  <th key={i} scope="col" abbr={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saptamaniDinLuna(l).map((sapt, i) => (
                <tr key={i}>
                  {sapt.map((zi, j) => {
                    if (!zi) return <td key={j} />;
                    const eSosire = zi === start;
                    const ePlecare = zi === sfarsit && Boolean(start);
                    const intre = inInterval(zi);
                    const oprita = indisponibila(zi);
                    const clase = ["ldv-zi"];
                    if (eSosire) clase.push("ldv-zi-sosire");
                    if (ePlecare) clase.push("ldv-zi-plecare");
                    if (intre) clase.push("ldv-zi-intre");
                    return (
                      <td key={j}>
                        <button type="button" id={`ldv-zi-${zi}`}
                          className={clase.join(" ")}
                          disabled={oprita}
                          tabIndex={zi === ziFocus ? 0 : -1}
                          aria-label={numeZiLunga(zi)}
                          aria-pressed={eSosire || ePlecare}
                          onFocus={() => setZiFocus(zi)}
                          onMouseEnter={() => inCurs && setSubMouse(zi)}
                          onKeyDown={(e) => laTasta(e, zi)}
                          onClick={() => apasa(zi)}>
                          {Number(zi.slice(8))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <p className="ldv-mic ldv-cal-indiciu" aria-live="polite">
        {inCurs
          ? "Alege și ziua plecării."
          : "Apasă ziua sosirii, apoi pe cea a plecării."}
      </p>
    </div>
  );
}
