/* O sectiune pliabila de formular (faza 3, C4): un buton-cap cu titlul,
 * rezumatul (doar cand e pliata — desfacuta, se vad campurile) si o
 * sageata; corpul ramane in DOM (`hidden`), deci starea campurilor si
 * ancorele lor nu se pierd la pliere. Capul e buton adevarat: Enter/Space
 * il comuta, iar `aria-expanded`/`aria-controls` spun cititorului de ecran
 * ce se intampla.
 */
import React from "react";
import { ChevronDown } from "lucide-react";

export function SectiunePliabila({ id, titlu, rezumat = "", deschis, onComuta, children }) {
  const corpId = `${id}-corp`;
  return (
    <section className={"pliabil" + (deschis ? " deschis" : "")}>
      <button type="button" className="pliabil-cap" aria-expanded={!!deschis} aria-controls={corpId} onClick={onComuta}>
        <span className="pliabil-titlu">{titlu}</span>
        {!deschis && rezumat ? <span className="pliabil-rezumat">{rezumat}</span> : null}
        <ChevronDown size={16} className="pliabil-sageata" aria-hidden="true" />
      </button>
      <div id={corpId} className="pliabil-corp" hidden={!deschis}>{children}</div>
    </section>
  );
}
