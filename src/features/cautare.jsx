/* Caseta de cautare globala (faza 3, C1): Ctrl+K sau `/` din orice ecran,
 * sau lupa din antet. Scrii un nume, un telefon, o camera sau un cod de
 * oaspete; rezultatele sunt REZERVARI, iar Enter (sau clicul) o deschide
 * pe cea aleasa direct in calendar. Cautarea e pe server (data/cautare.js),
 * cu o pauza scurta dupa ultima tasta; sub 3 caractere nu pleaca nimic.
 */
import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, useIntarziat } from "../ui/primitive.jsx";
import { cautaRezervari } from "../data/cautare.js";
import { MIN_LITERE_CAUTARE_GLOBALA, descrieRezultat, textDeCautat, urmatorulIndex } from "../lib/cautare.js";
import { STATUS_CLASS } from "../lib/constante.js";
import { mesajEroare } from "../lib/errors.js";

const GOL = { text: "", rezultate: [], inCurs: false, eroare: "" };

export function CautareGlobala({ onClose, onAlege }) {
  const [text, setText] = useState("");
  const intarziat = useIntarziat(text, 200);
  const cerut = textDeCautat(intarziat);
  const [stare, setStare] = useState(GOL);
  const [activ, setActiv] = useState(0);
  const listaRef = useRef(null);

  useEffect(() => {
    if (!cerut) { setStare(GOL); return; }
    let viu = true;
    setStare((s) => ({ ...s, inCurs: true, eroare: "" }));
    cautaRezervari(cerut).then((rezultate) => {
      if (!viu) return;
      setStare({ text: cerut, rezultate, inCurs: false, eroare: "" });
      setActiv(0);
    }).catch((e) => {
      if (!viu) return;
      setStare({ text: cerut, rezultate: [], inCurs: false, eroare: mesajEroare(e, "Căutarea a eșuat") });
    });
    return () => { viu = false; };
  }, [cerut]);

  useEffect(() => {
    listaRef.current?.children?.[activ]?.scrollIntoView?.({ block: "nearest" });
  }, [activ]);

  const { rezultate } = stare;
  const laTasta = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiv((i) => urmatorulIndex(i, rezultate.length, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      const ales = rezultate[activ];
      if (ales) { e.preventDefault(); onAlege(ales); }
    }
  };

  const scris = text.trim();
  /* Ce e pe ecran nu e neaparat pentru ce e scris acum: pauza nu s-a
     scurs, sau serverul n-a raspuns inca. */
  const inAsteptare = !!textDeCautat(text) && (stare.inCurs || stare.text !== textDeCautat(text));
  let gol = "";
  if (!scris) gol = "Scrie un nume, un telefon, o cameră sau un cod de oaspete.";
  else if (scris.length < MIN_LITERE_CAUTARE_GLOBALA) gol = `Cel puțin ${MIN_LITERE_CAUTARE_GLOBALA} caractere.`;
  else if (inAsteptare) gol = "Caut…";
  else if (stare.eroare) gol = stare.eroare;
  else gol = `Nimic pentru „${stare.text}”.`;

  return (
    <Dialog onClose={onClose} className="modal-cautare" overlayClassName="overlay-cautare" labelledBy="cautare-eticheta">
      <label id="cautare-eticheta" htmlFor="cautare-camp" className="ascuns-vizual">Caută rezervări</label>
      <div className="cautare-camp">
        <Search size={18} color="var(--text-muted)" aria-hidden="true" />
        <input
          id="cautare-camp" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={laTasta}
          placeholder="Nume, telefon, cameră sau cod de oaspete" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={rezultate.length > 0} aria-controls="cautare-lista" aria-autocomplete="list"
          aria-activedescendant={rezultate[activ] ? `cautare-rez-${activ}` : undefined}
        />
      </div>
      {rezultate.length > 0 ? (
        <div className="guest-results cautare-rezultate" role="listbox" id="cautare-lista" ref={listaRef}>
          {rezultate.map((rez, i) => {
            const d = descrieRezultat(rez);
            return (
              <button
                key={rez.rezervare.id} id={`cautare-rez-${i}`} type="button" role="option" aria-selected={i === activ}
                className={"guest-result cautare-rezultat" + (i === activ ? " activ" : "")}
                onMouseEnter={() => setActiv(i)} onClick={() => onAlege(rez)}
              >
                <div className="cautare-corp">
                  <div className="gname">{d.titlu}</div>
                  <div className="gmeta">{d.detalii.join(" · ")}</div>
                  {d.nota && <div className="gmeta">{d.nota}</div>}
                </div>
                <div className="cautare-etichete">
                  <span className={"role-tag cautare-status " + (STATUS_CLASS[rez.rezervare.status] || "")}>{d.status}</span>
                  {d.motiv && <span className="cautare-motiv">{d.motiv}</span>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="cautare-gol" role="status">{gol}</div>
      )}
      <div className="cautare-ajutor" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> alege</span>
        <span><kbd>Enter</kbd> deschide</span>
        <span><kbd>Esc</kbd> închide</span>
      </div>
    </Dialog>
  );
}
