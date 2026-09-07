/* DOCUMENTE TIPARIBILE — fisa de anuntare a sosirii si plecarii.
 *
 * Coala e fixata la 794x1123px (exact A4 la 96dpi) si scalata vizual pe
 * ecran. La print, regulile din styles/pms.css reseteaza scalarea; Safari
 * isi adauga propriul antet si subsol peste care CSS-ul n-are control, de
 * unde rezerva de 25% (zoom, nu transform — WebKit ignora transform la
 * tiparire).
 */

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { occupantName } from "../lib/nume.js";
import { FMT_DATE_FULL } from "../lib/format.js";
import { Dialog, useModalLock } from "../ui/primitive.jsx";
import { ACT_TIPURI } from "../lib/fisa.js";
import { LATIME_PANZA, INALTIME_PANZA } from "../lib/semnatura.js";
import * as dateFise from "../data/fise.js";

/* Tipul actului, scris cum il citeste un om. Lista traieste in lib/fisa.js,
   langa restul campurilor, ca sa nu existe doua definitii ale acelorasi trei
   variante. */
const tipActScris = (c) => ACT_TIPURI.find((t) => t.cheie === c)?.eticheta || "";

/* `fisa` e randul din fise_cazare, cand exista. Cand nu, coala se tipareste
   ca pana acum: precompletata din `guests` acolo unde se poate, goala in
   rest, ca sa fie scrisa cu pixul. Asa ramane utila si pentru oaspetii care
   n-au trecut prin guest app.

   Cand exista, coala se umple din ea — inclusiv semnatura, randata din
   traseul SVG salvat. Fara pasul asta ai date in baza si tot o coala goala
   la tiparire, ceea ce nu ajuta pe nimeni la un control. */
export function ArrivalSheet({ res, core, groups, fisa }) {
  const g = core.guests.find((x) => x.id === res.guestId) || {};
  const room = core.rooms.find((x) => x.id === res.roomId) || {};
  /* Goala pentru valoare lipsa, nu „Invalid Date": sosirea si plecarea sunt
     mereu acolo, dar data nasterii vine din fisa si lipseste cat timp fisa nu
     e completata. Vine ca `date` din Postgres ("1980-05-14"), nu ca timestamp,
     si se formateaza cu acelasi format lung ca restul colii. */
  const d = (v) => (v ? FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-") : "");

  const Cell = ({ ro, en, value, wide }) => (
    <div className={"fc" + (wide ? " wide" : "")}>
      <div className="fc-lab">
        <span className="ro">{ro}</span>
        <span className="en">{en}</span>
      </div>
      <div className="fc-val">{value || ""}</div>
    </div>
  );

  return (
    <div className="fisa">
      <div className="fisa-top">
        <img src="/logo.png" alt="La Livadă" className="fisa-logo-img" />
        <div className="fisa-room">
          <div>Nr.</div>
          <div>ROOM No. {room.name || ""}</div>
        </div>
      </div>

      <div className="fisa-title">Fișă de anunțare a sosirii și plecării</div>
      <div className="fisa-sub">Registration form - To be completed on arrival</div>

      <div className="fisa-grid">
        <div className="frow">
          <Cell ro="Nume și prenume" en="Surname and first name"
            value={occupantName(res, core, groups)} wide />
        </div>
        <div className="frow c3">
          <Cell ro="Data nașterii" en="Date of birth"
            value={d(fisa?.data_nasterii)} />
          <Cell ro="Locul nașterii" en="Place of birth" value={fisa?.locul_nasterii} />
          {/* Cand exista fisa, nationalitatea vine din ea. Fara ea ramane
              `g.country`, care e TARA DE DOMICILIU si nu nationalitatea —
              greseala veche a colii, pastrata doar acolo unde n-avem altceva.
              Vezi docs/fisa-cazare.md 1. */}
          <Cell ro="Naționalitate" en="Nationality"
            value={fisa?.nationalitate || g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Localitatea" en="City" value={fisa?.localitate || g.city} />
          <Cell ro="Strada" en="Street" value={fisa?.adresa || g.address} />
          <Cell ro="Țara" en="Country" value={fisa?.tara || g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Data sosirii" en="Date of arrival" value={d(res.checkin)} />
          <Cell ro="Data plecării" en="Date of departure" value={d(res.checkout)} />
          <Cell ro="Scopul călătoriei" en="Purpose of travelling" value={fisa?.scopul} />
        </div>
        <div className="frow c3">
          <Cell ro="Act de identitate" en="Identity card" value={tipActScris(fisa?.act_tip)} />
          <Cell ro="Seria" en="Series" value={fisa?.act_seria} />
          <Cell ro="Nr" en="No" value={fisa?.act_numarul} />
        </div>
        <div className="frow c2">
          <Cell ro="Semnătura turistului" en="Tourist's signature"
            value={fisa?.semnatura_svg
              ? (
                /* Acelasi viewBox ca panza pe care s-a semnat: alt raport
                   ar deforma semnatura. Numerele se iau din
                   lib/semnatura.js, nu se rescriu aici. */
                <svg viewBox={`0 0 ${LATIME_PANZA} ${INALTIME_PANZA}`}
                  className="fisa-semn-print" aria-hidden="true">
                  <path d={fisa.semnatura_svg} fill="none" stroke="currentColor"
                    strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )
              : (fisa?.fara_semnatura_motiv || "")} />
          <Cell ro="Semnătura recepționerului" en="Receptionist's signature" />
        </div>
      </div>

      <div className="fisa-space" />

      <div className="fisa-foot">
        <div>Unitatea: <strong>La Livada</strong></div>
        <div>office@lalivada.com</div>
      </div>
    </div>
  );
}

export function ArrivalForm({ res, core, groups, onClose }) {
  useModalLock();
  const scaleWrapRef = useRef(null);

  /* Fisa se aduce AICI, nu se primeste ca prop, ca sa nu fie nevoie s-o
     caute fiecare din cele trei locuri de unde se deschide coala. Cand
     lipseste, coala se tipareste ca inainte: precompletata unde se poate,
     goala in rest. Un esec de retea nu opreste tiparirea — o coala goala e
     tot utila, iar receptionerul are hartia in mana. */
  const [fisa, setFisa] = useState(null);
  useEffect(() => {
    let viu = true;
    dateFise.fisaActiva(res.id)
      .then((f) => { if (viu) setFisa(f); })
      .catch((e) => console.error("citire fisa pentru coala", e));
    return () => { viu = false; };
  }, [res.id]);

  /* Coala e fixata la 794x1123px (proportia A4); pe ecran o scalam vizual,
     ca sa incapa in modal si pe telefon. La print, regulile din STYLES
     resetează scalarea (.arrival-scaler, .arrival-sheet-wrap, .fisa-duo)
     si lasă coala să curgă la mărimea ei naturală A4. */
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const wrap = scaleWrapRef.current;
    if (!wrap) return;
    const update = () => {
      const w = wrap.clientWidth;
      setScale(w > 0 ? Math.min(1, w / 794) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* Randat prin portal, ca la factura (InvoicePrint): fereastra se deschide
     din interiorul TodayView/CalendarView, deci fara portal ar ramane
     descendenta a .content, ingropata sub un div fara clasa arrival-overlay
     — regula de print care ascunde tot din .content in afara de
     .arrival-overlay ar ascunde-o si pe ea odata cu acel div. */
  return createPortal(
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
        <div className="modal-head no-print">
          <h3 id="arrival-title">Fișă de anunțare</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => window.print()}>
              <Printer size={15} /> Printează
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
          </div>
        </div>

        <div className="arrival-sheet-wrap" ref={scaleWrapRef} style={{ height: 1123 * scale }}>
          <div className="arrival-scaler"
            style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div className="arrival-sheet fisa-duo">
              <ArrivalSheet res={res} core={core} groups={groups} fisa={fisa} />
              <div className="fisa-sep" />
              <ArrivalSheet res={res} core={core} groups={groups} fisa={fisa} />
            </div>
          </div>
        </div>
    </Dialog>,
    document.body
  );
}

/* ---------------------------------------------------------------
   TODAY VIEW
----------------------------------------------------------------*/
