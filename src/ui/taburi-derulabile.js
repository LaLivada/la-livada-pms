// @ts-check
/* Barele de taburi (.sub-tabs) care nu incap se deruleaza pe orizontala.
 *
 * Cu degetul sau cu trackpad-ul se derulau si inainte (overflow-x:auto in
 * pms.css). Cu rotita mouse-ului insa nu: rotita da deltaY, iar bara are doar
 * scrollLeft, asa ca un tab iesit din ecran ramanea de negasit. Cerut de
 * Ovidiu pe 26 septembrie 2026, cand fisa camerei a primit al patrulea tab
 * („Televizor").
 *
 * Un singur ascultator pe tot documentul, nu cate unul pe fiecare bara:
 * barele de taburi sunt scrise direct in zeci de ecrane, fara o componenta
 * comuna, iar o regula care trebuie tinuta minte la fiecare ecran nou e o
 * regula care se uita. Umbrele de la margini, care arata ca mai e ceva intr-o
 * parte, sunt in CSS (`.sub-tabs`).
 */

/* Cati pixeli inseamna un pas de rotita dat in linii (deltaMode 1, Firefox). */
const PIXELI_PE_LINIE = 16;

/** @param {Document} doc @returns {() => void} */
export function instaleazaTaburiDerulabile(doc = document) {
  /** @param {WheelEvent} e */
  const laRotita = (e) => {
    const bara = e.target instanceof Element ? e.target.closest(".sub-tabs") : null;
    if (!bara) return;
    /* Derularea orizontala (trackpad, Shift+rotita) o face browserul singur. */
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const max = bara.scrollWidth - bara.clientWidth;
    if (max <= 0) return;
    const pas = e.deltaMode === 1 ? e.deltaY * PIXELI_PE_LINIE
      : e.deltaMode === 2 ? e.deltaY * bara.clientWidth
      : e.deltaY;
    const inainte = bara.scrollLeft;
    const dupa = Math.max(0, Math.min(max, inainte + pas));
    /* La capat, rotita ramane a paginii: altfel pagina n-ar mai putea fi
       derulata cat timp mouse-ul sta peste bara. */
    if (dupa === inainte) return;
    bara.scrollLeft = dupa;
    e.preventDefault();
  };

  /* Tabul apasat vine intreg in vedere — de obicei e cel taiat pe jumatate de
     margine. `block: "nearest"`: fara salt pe verticala in fereastra. */
  /** @param {MouseEvent} e */
  const laClic = (e) => {
    const tab = e.target instanceof Element ? e.target.closest(".sub-tabs > button") : null;
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };

  doc.addEventListener("wheel", laRotita, { passive: false });
  doc.addEventListener("click", laClic);
  return () => {
    doc.removeEventListener("wheel", laRotita);
    doc.removeEventListener("click", laClic);
  };
}
