/* Cine ajunge DELEGAT pe o factură nouă.
 *
 * Regula, cerută pe 17 septembrie 2026: delegatul e cel care stă în cameră —
 * la o cameră de grup ocupantul ei, altfel clientul pe care s-a făcut
 * rezervarea. Până acum numele venea din fișa de cazare, care e a
 * titularului actului: la o cameră unde tatăl semnează fișa pentru toată
 * familia, pe factură apărea el, nu cel trecut ca ocupant.
 *
 * Două jumătăți, testate separat pentru că se pot strica separat:
 *  - `numeDelegat` decide NUMELE, din rezervare, fără nicio citire din bază;
 *  - `delegatPentruFactura` ia numele de la apelant și DOAR actul din fișă.
 *
 * Capcana pe care o apără al doilea grup: fișa ține și pașaport sau permis,
 * dar rubrica de pe factură scrie „CI seria … nr. …". Un număr de pașaport
 * trecut acolo e o afirmație falsă pe un document fiscal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fisaActiva = vi.fn();
vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./ui/primitive.jsx", () => ({ toaster: { show: vi.fn() }, Dialog: () => null, useModalLock: () => {} }));
vi.mock("./lib/audit.js", () => ({ audit: { push: vi.fn(async () => {}) } }));
vi.mock("./data/fise.js", () => ({ fisaActiva }));

const { numeDelegat, occupantName } = await import("./lib/nume.js");
const { delegatPentruFactura } = await import("./features/facturare/emitere.jsx");

const CORE = {
  guests: [
    { id: "g1", lastName: "Firma", firstName: "Client" },
    { id: "g2", lastName: "Ionescu", firstName: "Maria" },
  ],
};

describe("numeDelegat", () => {
  it("ocupantul camerei bate clientul rezervării", () => {
    const rez = { guestId: "g1", occupantName: "  Patap Simion  " };
    expect(numeDelegat(rez, CORE)).toBe("Patap Simion");
  });

  it("fără ocupant, numele pe care e făcută rezervarea", () => {
    expect(numeDelegat({ guestId: "g2", occupantName: "" }, CORE)).toBe("Ionescu Maria");
  });

  /* Aici e toată miza: `occupantName` din lib/nume.js cade pe numele
     grupului, iar „Excursie Cluj" pe rubrica de delegat ar fi o etichetă, nu
     cineva care poate semna de primire. Mai bine gol — câmpul e editabil pe
     draft și recepția scrie cine a luat factura. */
  it("nu cade niciodată pe numele grupului, deși `occupantName` o face", () => {
    const rez = { guestId: "necunoscut", groupId: "gr1", occupantName: "" };
    const groups = [{ id: "gr1", name: "Excursie Cluj" }];
    expect(occupantName(rez, CORE, groups)).toBe("Excursie Cluj");
    expect(numeDelegat(rez, CORE)).toBe("");
  });

  it("nu crapă pe o rezervare sau un core lipsă", () => {
    expect(numeDelegat(null, CORE)).toBe("");
    expect(numeDelegat({ guestId: "g2" }, null)).toBe("");
    expect(numeDelegat(undefined, undefined)).toBe("");
  });
});

describe("delegatPentruFactura", () => {
  beforeEach(() => { fisaActiva.mockReset(); });

  it("numele vine de la apelant, nu din fișă; actul din fișă", async () => {
    fisaActiva.mockResolvedValue({
      nume: "Patap", prenume: "Gheorghe", act_tip: "ci", act_seria: "VS", act_numarul: "123456",
    });
    expect(await delegatPentruFactura("r1", "Ionescu Maria"))
      .toEqual({ nume: "Ionescu Maria", serie: "VS", numar: "123456" });
  });

  it("alt act decât buletinul: doar numele, fără serie și număr", async () => {
    fisaActiva.mockResolvedValue({
      nume: "Smith", prenume: "John", act_tip: "pasaport", act_seria: "", act_numarul: "X9988776",
    });
    expect(await delegatPentruFactura("r1", "Smith John"))
      .toEqual({ nume: "Smith John", serie: "", numar: "" });
  });

  it("fără fișă rămâne numele, tot de la apelant", async () => {
    fisaActiva.mockResolvedValue(null);
    expect(await delegatPentruFactura("r1", "  Ionescu Maria  "))
      .toEqual({ nume: "Ionescu Maria", serie: "", numar: "" });
  });

  /* Delegatul e o rubrică ce se completează oricând înainte de emitere, spre
     deosebire de linii sau client — o fișă necitibilă nu are voie să oprească
     facturarea. */
  it("o citire eșuată nu aruncă", async () => {
    const eroare = vi.spyOn(console, "error").mockImplementation(() => {});
    fisaActiva.mockRejectedValue(new Error("rețea"));
    expect(await delegatPentruFactura("r1", "Ionescu Maria"))
      .toEqual({ nume: "Ionescu Maria", serie: "", numar: "" });
    expect(eroare).toHaveBeenCalled();
    eroare.mockRestore();
  });
});
