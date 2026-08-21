/* Primitivele de interfata refolosite de toate ecranele: dialogul, toast-urile,
 * paginarea si carligele care le insotesc.
 *
 * Nu stiu nimic despre rezervari, facturi sau camere — daca o componenta de
 * aici ar trebui sa stie, inseamna ca nu apartine acestui fisier.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Undo2, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { uid } from "../lib/uid.js";

export function PdfPreview({ blob, filename, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const marime = blob ? `${Math.round(blob.size / 1024)} KB` : "";

  return (
    <Dialog onClose={onClose} className="pdf-modal" title={filename}>
      <div className="pdf-frame-wrap">
        {url && <iframe src={url} title={filename} className="pdf-frame" />}
      </div>
      <div className="modal-actions">
        <span className="ldv-mic" style={{ alignSelf: "center" }}>{marime}</span>
        <div className="grow" />
        {url && (
          <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
            <Eye size={15} /> Deschide în filă nouă
          </a>
        )}
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={onClose}>Închide</button>
      </div>
    </Dialog>
  );
}

export const toaster = {
  push: null,
  show(message, opts = {}) {
    if (toaster.push) toaster.push({ id: uid(), message, ...opts });
  },
};

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    toaster.push = (t) => {
      setItems((prev) => [...prev, t]);
      const ttl = t.onUndo ? 7000 : 3500;
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), ttl);
    };
    return () => { toaster.push = null; };
  }, []);

  const dismiss = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  if (!items.length) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div className={"toast" + (t.tone ? " toast-" + t.tone : "")} key={t.id}>
          <span className="toast-msg">{t.message}</span>
          {t.onUndo && (
            <button className="toast-undo" onClick={() => { t.onUndo(); dismiss(t.id); }}>
              <Undo2 size={14} /> Anulează
            </button>
          )}
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Închide notificarea">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   DIALOG
   One primitive for every modal: Escape to close, focus trapped
   inside and restored on exit, correct ARIA roles, scroll lock.
----------------------------------------------------------------*/

export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ title, onClose, children, className = "", overlayClassName = "", labelledBy }) {
  useModalLock();
  const ref = useRef(null);
  const restoreTo = useRef(null);
  const headingId = useRef(labelledBy || `dlg-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const node = ref.current;
    if (node) {
      const first = node.querySelector(FOCUSABLE);
      (first || node).focus({ preventScroll: true });
    }
    return () => {
      const el = restoreTo.current;
      if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
    };
  }, []);

  /* Cardul coboara pana la marginea ecranului, deci partea lui de jos sta
     sub tastatura. Ca sa nu scrii "orbeste", campul care primeste focus e
     adus in vizor; `scroll-padding-bottom` de pe .modal (calculat din
     --vvb) face ca browserul sa lase liber exact cat ocupa tastatura.
     Intarzierea asteapta animatia de deschidere a tastaturii — fara ea,
     derularea se calculeaza pe inaltimea de dinainte si ramane scurta. */
  const laFocus = (e) => {
    const camp = e.target;
    if (!camp?.matches?.("input, textarea, select")) return;
    setTimeout(() => {
      camp.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 250);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose?.(); return; }
    if (e.key !== "Tab") return;
    const node = ref.current;
    if (!node) return;
    const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className={"modal-overlay " + overlayClassName} onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId.current}
        tabIndex={-1}
        className={"modal " + className}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onFocus={laFocus}
      >
        {title !== undefined && (
          <div className="modal-head">
            <h3 id={headingId.current}>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* Locks the page behind an open dialog: without this the calendar
   underneath still pans sideways while you type. */
let modalLockCount = 0;
/* Aduce in vizor un element care tocmai a aparut — tipic: lista de
   rezultate a unei cautari dintr-un modal cu derulare.
   Pe telefon, cu tastatura deschisa, inaltimea utila a modalului scade
   la jumatate, iar rezultatele cad sub marginea de jos: utilizatorul
   scrie si nu vede ce a gasit. `block:"nearest"` deruleaza doar cat e
   nevoie, deci nu smuceste ecranul cand rezultatele erau oricum vizibile.
   Intarzierea lasa layout-ul sa se aseze dupa animatia tastaturii. */

export function useAduInVizor(vizibil) {
  const ref = useRef(null);
  useEffect(() => {
    if (!vizibil) return;
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    return () => clearTimeout(t);
  }, [vizibil]);
  return ref;
}

/* Paginare simpla peste o lista deja filtrata. Tine pagina curenta si o
   reseteaza cand se schimba filtrul — altfel ramai pe pagina 3 a unei
   liste care intre timp are un singur rezultat. */

export function usePaginare(items, pePagina = 20) {
  const [pagina, setPagina] = useState(1);
  const total = Math.max(1, Math.ceil(items.length / pePagina));
  useEffect(() => { setPagina(1); }, [items.length]);
  const p = Math.min(pagina, total);
  return {
    pagina: p,
    totalPagini: total,
    setPagina,
    feliate: items.slice((p - 1) * pePagina, p * pePagina),
    arataPaginarea: items.length > pePagina,
    pePagina,
    totalItems: items.length,
  };
}

export function Paginare({ stare, eticheta = "rezultate" }) {
  if (!stare.arataPaginarea) return null;
  const { pagina, totalPagini, setPagina, pePagina, totalItems } = stare;
  const primul = (pagina - 1) * pePagina + 1;
  const ultimul = Math.min(pagina * pePagina, totalItems);
  return (
    <div className="paginare">
      <button className="btn btn-ghost" style={{ width: "auto" }}
        onClick={() => setPagina(pagina - 1)} disabled={pagina <= 1}
        aria-label="Pagina anterioară">
        <ChevronLeft size={15} />
      </button>
      <span className="paginare-info">
        {primul}–{ultimul} din {totalItems} {eticheta}
      </span>
      <button className="btn btn-ghost" style={{ width: "auto" }}
        onClick={() => setPagina(pagina + 1)} disabled={pagina >= totalPagini}
        aria-label="Pagina următoare">
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

export function useModalLock() {
  useEffect(() => {
    measureVisualViewport();
    const body = document.body;
    if (modalLockCount === 0) {
      body.dataset.pmsOverflow = body.style.overflow || "";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }
    modalLockCount += 1;
    return () => {
      modalLockCount = Math.max(0, modalLockCount - 1);
      if (modalLockCount === 0) {
        body.style.overflow = body.dataset.pmsOverflow || "";
        body.style.touchAction = "";
        delete body.dataset.pmsOverflow;
      }
    };
  }, []);
}

/* ---------------------------------------------------------------
   LOADED-DATA VALIDATION
   Storage can hold values written by an older build or a partial
   write. Anything that fails its shape check is rebuilt instead of
   crashing a screen deep in the app.
----------------------------------------------------------------*/

export function measureVisualViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty("--vvh", `${h}px`);
  document.documentElement.style.setProperty("--vvt", `${top}px`);

  /* Inaltimea zonei acoperite de tastatura: cat ramane din viewport-ul de
     LAYOUT (cel la care se raporteaza position:fixed) sub zona vizibila.
     Cand tastatura e inchisa iese 0, deci nu schimba nimic.
     Pragul de 24px ignora diferentele mici dintre cele doua metrici
     (barele de browser care se ascund la derulare), ca sa nu sara cardul
     cu cativa pixeli fara motiv. */
  const layout = document.documentElement.clientHeight || h;
  const jos = Math.max(0, Math.round(layout - (h + top)));
  document.documentElement.style.setProperty("--vvb", jos > 24 ? `${jos}px` : "0px");
}

export function useVisualViewportHeight() {
  useEffect(() => {
    measureVisualViewport();
    window.visualViewport?.addEventListener("resize", measureVisualViewport);
    window.visualViewport?.addEventListener("scroll", measureVisualViewport);
    window.addEventListener("resize", measureVisualViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", measureVisualViewport);
      window.visualViewport?.removeEventListener("scroll", measureVisualViewport);
      window.removeEventListener("resize", measureVisualViewport);
    };
  }, []);
}

/* ---------------------------------------------------------------
   ROOT APP
----------------------------------------------------------------*/
