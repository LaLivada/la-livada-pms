/* Poarta features/rezervari.jsx (faza 4, D1): dupa spargerea in
 * features/rezervari/, exporta aceleasi nume ca inainte. Un export lipsa s-ar
 * vedea abia la deschiderea ecranului (pms-app il importa lazy), nu la build;
 * testul asta il prinde la `npm test`, si odata cu el orice fisier din dosar
 * care nu se mai incarca (import gresit, ciclu care lasa un nume nedefinit).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn().mockResolvedValue({ ok: true }),
}));

const poarta = await import("./features/rezervari.jsx");

const NUMELE = [
  "NightAuditGate", "EtichetaNou", "CalendarView", "ReservationViewModal", "ReservationModal",
  "doCheckIn", "doCheckOut", "CardOnline", "TodayView", "ReservationActions",
];

describe("poarta features/rezervari.jsx", () => {
  it("exporta toate componentele si actiunile de dinainte de spargere, ca functii", () => {
    const lipsa = NUMELE.filter((n) => typeof poarta[n] !== "function");
    expect(lipsa, "nume care nu mai ies din poarta").toEqual([]);
  });

  it("nu exporta nimic in plus fata de inainte", () => {
    expect(Object.keys(poarta).sort()).toEqual([...NUMELE].sort());
  });
});
