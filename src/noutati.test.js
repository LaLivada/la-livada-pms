/* „Noua de la ultima deschidere" (faza 3, C7) — logica pura din lib/noutati.js.
 *
 * Ce s-ar strica tacut: la prima deschidere (fara reper) sa se aprinda tot
 * calendarul; rezervarea facuta chiar de tine acum cinci minute sa apara
 * „noua"; randurile cameristei (fara createdAt) sa fie „noi"; bataia de
 * inima sa continue cu pagina ascunsa sau dupa oprire; un reper mutat in
 * timpul sesiunii sa nu ajunga la etichete.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { esteNoua, numaraNoi, idNoi, pornestePrezenta, INTERVAL_PREZENTA_MS } from "./lib/noutati.js";

const REPER = "2026-09-14T06:00:00.000Z";
const noutati = (extra = {}) => ({ vazutPanaLa: REPER, aleMele: new Set(), ...extra });
const rez = (createdAt, id = "r1") => ({ id, createdAt });

describe("esteNoua", () => {
  it("creata dupa reper e noua; inainte sau exact la reper nu", () => {
    expect(esteNoua(rez("2026-09-14T06:00:01Z"), noutati())).toBe(true);
    expect(esteNoua(rez("2026-09-14T05:59:59Z"), noutati())).toBe(false);
    expect(esteNoua(rez(REPER), noutati())).toBe(false);
  });

  /* Testul care conteaza: fara reper nu se aprinde nimic. */
  it("fara reper (prima deschidere din viata contului) nimic nu e nou", () => {
    expect(esteNoua(rez("2026-09-14T09:00:00Z"), noutati({ vazutPanaLa: null }))).toBe(false);
    expect(esteNoua(rez("2026-09-14T09:00:00Z"), null)).toBe(false);
  });

  it("facuta din acest browser nu e noua, oricat de proaspata", () => {
    const aleMele = new Set(["a-mea"]);
    expect(esteNoua(rez("2026-09-14T09:00:00Z", "a-mea"), noutati({ aleMele }))).toBe(false);
    expect(esteNoua(rez("2026-09-14T09:00:00Z", "a-lor"), noutati({ aleMele }))).toBe(true);
  });

  it("fara createdAt (vederea cameristei) sau cu date stricate nu e noua", () => {
    expect(esteNoua({ id: "x" }, noutati())).toBe(false);
    expect(esteNoua(rez("aiurea"), noutati())).toBe(false);
    expect(esteNoua(rez("2026-09-14T09:00:00Z"), noutati({ vazutPanaLa: "aiurea" }))).toBe(false);
    expect(esteNoua(null, noutati())).toBe(false);
  });
});

describe("numaraNoi / idNoi", () => {
  it("numara doar ce e nou si nu e al meu", () => {
    const lista = [rez("2026-09-14T09:00:00Z", "a"), rez("2026-09-13T09:00:00Z", "b"), rez("2026-09-14T10:00:00Z", "c")];
    expect(numaraNoi(lista, noutati({ aleMele: new Set(["c"]) }))).toBe(1);
    expect(numaraNoi(lista, noutati())).toBe(2);
    expect(numaraNoi(null, noutati())).toBe(0);
  });

  it("id-urile aparute intre doua liste", () => {
    expect(idNoi([{ id: "a" }], [{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual(["b", "c"]);
    expect(idNoi([{ id: "a" }], [{ id: "a" }])).toEqual([]);
    expect(idNoi(null, [{ id: "a" }])).toEqual(["a"]);
  });
});

describe("pornestePrezenta", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const document = (visibilityState = "visible") => {
    const doc = new EventTarget();
    doc.visibilityState = visibilityState;
    return doc;
  };
  const porneste = (extra = {}) => {
    vi.useFakeTimers();
    const marcheaza = vi.fn().mockResolvedValue(REPER);
    const laReper = vi.fn();
    const doc = document();
    const opreste = pornestePrezenta({ marcheaza, laReper, doc, ...extra });
    return { marcheaza, laReper, doc, opreste };
  };
  const asteapta = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

  it("bate la pornire si da reperul mai departe", async () => {
    const { marcheaza, laReper } = porneste();
    await asteapta();
    expect(marcheaza).toHaveBeenCalledTimes(1);
    expect(laReper).toHaveBeenCalledWith(REPER);
  });

  it("prima deschidere: serverul nu are reper, etichetele raman stinse", async () => {
    const { laReper } = porneste({ marcheaza: vi.fn().mockResolvedValue(null) });
    await asteapta();
    expect(laReper).toHaveBeenCalledWith(null);
  });

  it("bate la fiecare interval cat timp pagina e vizibila, deloc cand e ascunsa", async () => {
    const { marcheaza, doc } = porneste();
    await asteapta();
    await asteapta(INTERVAL_PREZENTA_MS);
    expect(marcheaza).toHaveBeenCalledTimes(2);
    doc.visibilityState = "hidden";
    await asteapta(3 * INTERVAL_PREZENTA_MS);
    expect(marcheaza).toHaveBeenCalledTimes(2);
  });

  /* Telefonul a stat blocat doua ore: reperul de pe server s-a mutat si
     trebuie sa ajunga la etichete, nu sa ramana cel de dimineata. */
  it("la revenirea pe ecran bate imediat si preia reperul mutat", async () => {
    const { marcheaza, laReper, doc } = porneste();
    await asteapta();
    doc.visibilityState = "hidden";
    marcheaza.mockResolvedValue("2026-09-14T12:00:00.000Z");
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await asteapta();
    expect(marcheaza).toHaveBeenCalledTimes(2);
    expect(laReper).toHaveBeenLastCalledWith("2026-09-14T12:00:00.000Z");
  });

  it("fara retea nu arunca si incearca iar la urmatoarea bataie", async () => {
    const avertizare = vi.spyOn(console, "warn").mockImplementation(() => {});
    const marcheaza = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(REPER);
    const { laReper } = porneste({ marcheaza });
    await asteapta();
    expect(laReper).not.toHaveBeenCalled();
    expect(avertizare).toHaveBeenCalled();
    await asteapta(INTERVAL_PREZENTA_MS);
    expect(laReper).toHaveBeenCalledWith(REPER);
  });

  it("dupa oprire nu mai bate si nu mai raporteaza nimic", async () => {
    const { marcheaza, laReper, doc, opreste } = porneste();
    await asteapta();
    opreste();
    doc.dispatchEvent(new Event("visibilitychange"));
    await asteapta(2 * INTERVAL_PREZENTA_MS);
    expect(marcheaza).toHaveBeenCalledTimes(1);
    expect(laReper).toHaveBeenCalledTimes(1);
  });
});
