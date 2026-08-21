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
import { guestFullName, occupantName } from "../lib/nume.js";
import { FMT_DATE_FULL, FMT_DATE } from "../lib/format.js";
import { Dialog, useModalLock } from "../ui/primitive.jsx";

export function ArrivalSheet({ res, core, groups }) {
  const g = core.guests.find((x) => x.id === res.guestId) || {};
  const room = core.rooms.find((x) => x.id === res.roomId) || {};
  const d = (v) => FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-");
  const ds = (v) => FMT_DATE.format(new Date(v)).replace(/\.$/, "");

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
          <Cell ro="Data nașterii" en="Date of birth" />
          <Cell ro="Locul nașterii" en="Place of birth" />
          <Cell ro="Naționalitate" en="Nationality" value={g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Localitatea" en="City" value={g.city} />
          <Cell ro="Strada" en="Street" value={g.address} />
          <Cell ro="Țara" en="Country" value={g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Data sosirii" en="Date of arrival" value={d(res.checkin)} />
          <Cell ro="Data plecării" en="Date of departure" value={d(res.checkout)} />
          <Cell ro="Scopul călătoriei" en="Purpose of travelling" />
        </div>
        <div className="frow c3">
          <Cell ro="Act de identitate" en="Identity card" />
          <Cell ro="Seria" en="Series" />
          <Cell ro="Nr" en="No" />
        </div>
        <div className="frow c2">
          <Cell ro="Semnătura turistului" en="Tourist's signature" />
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
              <ArrivalSheet res={res} core={core} groups={groups} />
              <div className="fisa-sep" />
              <ArrivalSheet res={res} core={core} groups={groups} />
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
