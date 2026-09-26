/* Barele de taburi (.sub-tabs) care nu incap se deruleaza pe orizontala —
 * cerut de Ovidiu pe 26 septembrie 2026, cand fisa camerei a primit al
 * patrulea tab („Televizor") si acesta iesea din ecran.
 *
 * Cu degetul sau cu trackpad-ul, bara se derula si pana acum
 * (overflow-x:auto). Cu rotita mouse-ului insa nu: rotita da deltaY, iar
 * bara stie doar de scrollLeft — tabul ascuns ramanea de negasit.
 *
 * jsdom nu face layout: latimile se dau de mana, pe element.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { instaleazaTaburiDerulabile } from "./ui/taburi-derulabile.js";

let dezinstaleaza = null;
afterEach(() => {
  dezinstaleaza?.();
  dezinstaleaza = null;
  document.body.innerHTML = "";
});

/* O bara de 100px cu 300px de taburi: se poate derula 200px. */
function bara({ loc = 100, continut = 300, pozitie = 0 } = {}) {
  const el = document.createElement("div");
  el.className = "sub-tabs";
  el.innerHTML = "<button>Informații cameră</button><button>Yală</button><button>Televizor</button>";
  document.body.appendChild(el);
  let scrollLeft = pozitie;
  Object.defineProperty(el, "clientWidth", { value: loc });
  Object.defineProperty(el, "scrollWidth", { value: continut });
  Object.defineProperty(el, "scrollLeft", {
    get: () => scrollLeft,
    set: (v) => { scrollLeft = Math.max(0, Math.min(continut - loc, v)); },
  });
  return el;
}

const rotita = (tinta, { deltaY = 0, deltaX = 0, deltaMode = 0 } = {}) => {
  const e = new WheelEvent("wheel", { deltaY, deltaX, deltaMode, bubbles: true, cancelable: true });
  tinta.dispatchEvent(e);
  return e;
};

describe("rotita mouse-ului peste o bara de taburi", () => {
  it("o deruleaza pe orizontala, cand nu incape", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara();
    const e = rotita(el.querySelector("button"), { deltaY: 60 });
    expect(el.scrollLeft).toBe(60);
    expect(e.defaultPrevented).toBe(true);
  });

  it("inapoi, cu rotita in sus", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara({ pozitie: 150 });
    rotita(el, { deltaY: -100 });
    expect(el.scrollLeft).toBe(50);
  });

  it("rotita in linii (Firefox) se transforma in pixeli", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara();
    rotita(el, { deltaY: 3, deltaMode: 1 });
    expect(el.scrollLeft).toBe(48);
  });

  it("la capat lasa pagina sa se deruleze", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara({ pozitie: 200 });
    const e = rotita(el, { deltaY: 60 });
    expect(el.scrollLeft).toBe(200);
    expect(e.defaultPrevented).toBe(false);
  });

  it("o bara care incape nu fura derularea paginii", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara({ loc: 300, continut: 300 });
    expect(rotita(el, { deltaY: 60 }).defaultPrevented).toBe(false);
  });

  it("derularea orizontala (trackpad) ramane a browserului", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara();
    expect(rotita(el, { deltaX: 40, deltaY: 5 }).defaultPrevented).toBe(false);
    expect(el.scrollLeft).toBe(0);
  });

  it("in afara barelor de taburi nu face nimic", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const alt = document.createElement("div");
    document.body.appendChild(alt);
    expect(rotita(alt, { deltaY: 60 }).defaultPrevented).toBe(false);
  });
});

describe("clic pe un tab", () => {
  it("aduce tabul intreg in vedere, fara salt pe verticala", () => {
    dezinstaleaza = instaleazaTaburiDerulabile(document);
    const el = bara();
    const tab = el.querySelectorAll("button")[2];
    tab.scrollIntoView = vi.fn();
    tab.click();
    expect(tab.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });
});
