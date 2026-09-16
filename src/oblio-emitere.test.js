/* emiteFactura (features/facturare/emitere.jsx) alege drumul dupa setari:
 * Oblio pornit → functia edge, cu factura intoarsa de ea; oprit → drumul
 * vechi (serie locala + emite_factura). Esecul prin Oblio intoarce null si
 * arata mesajul functiei, fara sa arunce. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const toaster = { show: vi.fn() };
vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./ui/primitive.jsx", () => ({ toaster, Dialog: () => null, useModalLock: () => {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}) } }));
const setariOblioStrict = vi.fn();
const cheamaOblio = vi.fn();
vi.mock("./data/oblio.js", async (importOriginal) => ({ ...(await importOriginal()), setariOblioStrict, cheamaOblio }));
const serieActiva = vi.fn(async () => "LL");
const emiteLocal = vi.fn(async () => ({ id: "i", series: "LL", number: 1 }));
vi.mock("./data/facturare.js", async (importOriginal) => ({ ...(await importOriginal()), serieActiva, emiteFactura: emiteLocal }));

const { emiteFactura } = await import("./features/facturare/emitere.jsx");
const FACTURA = { id: "i", total_amount: 100 };

beforeEach(() => { toaster.show.mockClear(); cheamaOblio.mockReset(); emiteLocal.mockClear(); setariOblioStrict.mockReset(); });

describe("emiteFactura", () => {
  it("Oblio oprit: drumul vechi", async () => {
    setariOblioStrict.mockResolvedValue({ activ: false });
    expect(await emiteFactura(FACTURA)).toEqual({ id: "i", series: "LL", number: 1 });
    expect(emiteLocal).toHaveBeenCalledWith("i", "LL");
    expect(cheamaOblio).not.toHaveBeenCalled();
  });
  it("Oblio pornit: functia edge, factura ei, mesaj cu numarul lui Oblio", async () => {
    setariOblioStrict.mockResolvedValue({ activ: true, cif: "RO1", serie: "LL" });
    cheamaOblio.mockResolvedValue({ ok: true, factura: { id: "i", series: "LL", number: 7, oblio_numar: "0007", oblio_stare: "emisa" } });
    const r = await emiteFactura(FACTURA);
    expect(r.oblio_numar).toBe("0007");
    expect(cheamaOblio).toHaveBeenCalledWith("emite", { invoiceId: "i" });
    expect(emiteLocal).not.toHaveBeenCalled();
    expect(toaster.show.mock.calls[0][0]).toContain("LL 0007");
  });
  it("Oblio pornit, dar a refuzat: null si mesajul lor", async () => {
    setariOblioStrict.mockResolvedValue({ activ: true });
    cheamaOblio.mockResolvedValue({ ok: false, error: "Oblio: Cota de TVA 5% nu există" });
    expect(await emiteFactura(FACTURA)).toBeNull();
    expect(toaster.show).toHaveBeenCalledWith("Oblio: Cota de TVA 5% nu există", { tone: "danger" });
  });
  /* Setarile necitite nu inseamna „Oblio oprit": un numar local alocat
     dintr-o pana de retea ar fi o factura fara pereche in Oblio. */
  it("setarile necitite opresc emiterea, nu o trimit pe drumul local", async () => {
    setariOblioStrict.mockRejectedValue(new Error("network"));
    expect(await emiteFactura(FACTURA)).toBeNull();
    expect(emiteLocal).not.toHaveBeenCalled();
    expect(cheamaOblio).not.toHaveBeenCalled();
    expect(toaster.show.mock.calls[0][0]).toContain("Nu am putut citi setările Oblio");
    expect(toaster.show.mock.calls[0][1]).toEqual({ tone: "danger" });
  });
});
