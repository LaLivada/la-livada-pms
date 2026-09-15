/* Butonul „inapoi" al telefonului inchide fereastra deschisa, nu iese din
 * PMS (interfata noua, 15 septembrie 2026). Fiecare Dialog pune o intrare
 * in istoricul browserului la deschidere; popstate inchide fereastra din
 * varful stivei; la inchiderea din buton, intrarea se consuma cu
 * history.back(), ca „inapoi" sa nu ceara doua apasari. Shell (pms-app.jsx)
 * intreaba existaFerestreDeschise() ca sa nu schimbe ecranul cat timp o
 * fereastra a prins evenimentul.
 *
 * StrictMode monteaza de doua ori in dezvoltare, iar Actiuni → Modifica
 * inchide o fereastra si deschide alta in acelasi tact: intrarea abia
 * lasata se refoloseste in loc sa se puna alta, iar back() se amana un
 * tact si se renunta la el daca intre timp a venit alta fereastra.
 *
 * Cu interfata actuala nu se scrie nimic in istoric — exact ca pana acum.
 */
import { useEffect, useRef } from "react";
import { uid } from "../lib/uid.js";
import { useInterfata } from "./interfata.jsx";

const CHEIE = "pmsFereastra";
const stiva = [];
const lasateRecent = new Map();
let asculta = false;

function laPopstate() {
  const sus = stiva[stiva.length - 1];
  if (!sus) return;
  sus.dinIstoric = true;
  sus.inchide();
}

export function existaFerestreDeschise() {
  return stiva.length > 0;
}

export function useFereastraInIstoric(onClose) {
  const { noua } = useInterfata();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!noua || typeof history === "undefined" || typeof window === "undefined") return undefined;
    const intrare = { id: uid(), dinIstoric: false, reluata: false, inchide: () => onCloseRef.current?.() };
    const idVechi = history.state?.[CHEIE];
    const lasata = idVechi ? lasateRecent.get(idVechi) : null;
    if (lasata) {
      lasata.reluata = true;
      lasateRecent.delete(idVechi);
      intrare.id = idVechi;
    } else {
      history.pushState({ [CHEIE]: intrare.id }, "");
    }
    stiva.push(intrare);
    if (!asculta) { window.addEventListener("popstate", laPopstate); asculta = true; }
    return () => {
      const i = stiva.indexOf(intrare);
      if (i >= 0) stiva.splice(i, 1);
      if (intrare.dinIstoric || history.state?.[CHEIE] !== intrare.id) return;
      lasateRecent.set(intrare.id, intrare);
      setTimeout(() => {
        lasateRecent.delete(intrare.id);
        if (!intrare.reluata && history.state?.[CHEIE] === intrare.id) history.back();
      }, 0);
    };
  }, [noua]);
}
