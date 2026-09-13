/* Indicatorul de conexiune din antet (faza 3, C8). Nu apare deloc cat timp
 * totul e in regula; apare cand browserul e offline sau cand coada de
 * salvari (lib/coada-salvari.js) are ceva de trimis — cu numarul de
 * salvari care asteapta, ca recepția sa stie ca ce a facut nu e inca in
 * baza, si sa nu inchida fila.
 */
import React, { useEffect, useState } from "react";
import { WifiOff, CloudUpload } from "lucide-react";
import { coadaSalvari } from "../data/coada.js";

export function useStareRetea(coada = coadaSalvari) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [inCoada, setInCoada] = useState(() => coada.marime());
  useEffect(() => {
    const laOnline = () => setOnline(true);
    const laOffline = () => setOnline(false);
    window.addEventListener("online", laOnline);
    window.addEventListener("offline", laOffline);
    const dezabonare = coada.asculta(() => setInCoada(coada.marime()));
    setInCoada(coada.marime());
    return () => {
      window.removeEventListener("online", laOnline);
      window.removeEventListener("offline", laOffline);
      dezabonare();
    };
  }, [coada]);
  return { online, inCoada };
}

const salvari = (n) => (n === 1 ? "1 salvare" : `${n} salvări`);

export function IndicatorRetea({ coada = coadaSalvari }) {
  const { online, inCoada } = useStareRetea(coada);
  if (online && !inCoada) return null;
  const text = !online
    ? (inCoada ? `Offline · ${salvari(inCoada)} în așteptare` : "Offline")
    : `Se trimite · ${salvari(inCoada)}`;
  const titlu = !online
    ? "Fără internet. Ce salvezi rămâne în aplicație și se trimite când revine conexiunea — nu închide fila."
    : "Salvări amânate cât a lipsit conexiunea; se trimit acum.";
  return (
    <span className={"retea-pastila " + (online ? "retea-trimite" : "retea-offline")} role="status" title={titlu}>
      {online ? <CloudUpload size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
      <span>{text}</span>
    </span>
  );
}
