import { describe, it, expect } from "vitest";
/* Logica pura sta acum in ./lib — testele nu mai incarca intreaga
   aplicatie (si tot lantul ei de dependinte React/Supabase) doar ca sa
   ajunga la cateva functii de calcul. */
import {
  nightsBetween, rangesOverlap, validateStay, isLive,
} from "./lib/availability.js";
import {
  inSeason, nightlyRate, liveReservationTotal,
  liveReservationTotalOnline, reservationTotal,
} from "./lib/pricing.js";
import { calcAmounts, round2, splitEvenly } from "./lib/money.js";
import { validateCUIFormat } from "./lib/validation.js";
import { MATRICE_TARIF, TARIFE_REFERINTA } from "./lib/pricing-matrice.js";

describe("nightsBetween", () => {
  it("counts full nights between two dates, ignoring time-of-day", () => {
    expect(nightsBetween("2026-08-18T15:00:00Z", "2026-08-21T11:00:00Z")).toBe(3);
  });
  it("never returns less than 1 night, even for a same-day range", () => {
    expect(nightsBetween("2026-08-18T15:00:00Z", "2026-08-18T18:00:00Z")).toBe(1);
  });
});

describe("rangesOverlap", () => {
  it("detects a genuine overlap", () => {
    expect(rangesOverlap("2026-08-18", "2026-08-22", "2026-08-20", "2026-08-25")).toBe(true);
  });
  it("treats back-to-back stays (checkout === checkin) as NOT overlapping — same-day turnover is allowed", () => {
    expect(rangesOverlap("2026-08-18", "2026-08-20", "2026-08-20", "2026-08-22")).toBe(false);
  });
  it("detects no overlap for clearly separate ranges", () => {
    expect(rangesOverlap("2026-08-18", "2026-08-20", "2026-08-25", "2026-08-28")).toBe(false);
  });
  it("detects one range fully containing the other", () => {
    expect(rangesOverlap("2026-08-18", "2026-08-28", "2026-08-20", "2026-08-22")).toBe(true);
  });
});

describe("isLive", () => {
  it("treats cancelled/noshow as not live, everything else as live", () => {
    expect(isLive({ status: "cancelled" })).toBe(false);
    expect(isLive({ status: "noshow" })).toBe(false);
    expect(isLive({ status: "confirmed" })).toBe(true);
    expect(isLive({ status: "checkedin" })).toBe(true);
  });
});

describe("inSeason", () => {
  const summer = { start: "06-01", end: "08-31" };
  it("matches a date inside a normal (non-wrapping) season", () => {
    expect(inSeason(new Date("2026-07-15"), summer)).toBe(true);
  });
  it("rejects a date outside a normal season", () => {
    expect(inSeason(new Date("2026-12-15"), summer)).toBe(false);
  });
  it("handles a season that wraps across the new year", () => {
    const winter = { start: "12-01", end: "02-28" };
    expect(inSeason(new Date("2026-01-15"), winter)).toBe(true);
    expect(inSeason(new Date("2026-07-15"), winter)).toBe(false);
  });
});

describe("nightlyRate", () => {
  const rates = {
    base: { tiny: 300, tinySingle: 280, adultSupplement: 80, childSupplement: 30 },
    seasons: [],
  };
  it("uses the base rate for standard 2-adult occupancy", () => {
    expect(nightlyRate(new Date("2026-08-18"), "tiny", rates, { adults: 2, children: 0 })).toBe(300);
  });
  it("applies the single rate strictly for 1 adult and 0 children", () => {
    expect(nightlyRate(new Date("2026-08-18"), "tiny", rates, { adults: 1, children: 0 })).toBe(280);
  });
  it("does NOT apply the single rate when a child is present, even with 1 adult", () => {
    expect(nightlyRate(new Date("2026-08-18"), "tiny", rates, { adults: 1, children: 1 })).toBe(300 + 30);
  });
  it("adds the adult supplement only for adults beyond 2", () => {
    expect(nightlyRate(new Date("2026-08-18"), "tiny", rates, { adults: 3, children: 0 })).toBe(300 + 80);
    expect(nightlyRate(new Date("2026-08-18"), "tiny", rates, { adults: 4, children: 0 })).toBe(300 + 160);
  });
  it("adds the child supplement per child regardless of total occupancy", () => {
    expect(nightlyRate(new Date("2026-08-18"), "tiny", rates, { adults: 2, children: 2 })).toBe(300 + 60);
  });
  it("prefers the season price over the base price when a season matches", () => {
    const withSeason = {
      base: { tiny: 300, adultSupplement: 80, childSupplement: 30 },
      seasons: [{ start: "07-01", end: "08-31", tiny: 450 }],
    };
    expect(nightlyRate(new Date("2026-08-18"), "tiny", withSeason, { adults: 2, children: 0 })).toBe(450);
  });
});

describe("liveReservationTotal", () => {
  const core = {
    rooms: [{ id: "r1", type: "tiny" }],
    rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  };
  it("multiplies the nightly rate by the number of nights", () => {
    const res = { roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-21T11:00:00Z", adults: 2, children: 0 };
    expect(liveReservationTotal(res, core)).toBe(900);
  });
  it("returns 0 if the room can't be found (defensive — should never render a NaN price)", () => {
    const res = { roomId: "missing", checkin: "2026-08-18", checkout: "2026-08-19", adults: 2, children: 0 };
    expect(liveReservationTotal(res, core)).toBe(0);
  });
});

describe("reservationTotal", () => {
  const core = {
    rooms: [{ id: "r1", type: "tiny" }],
    rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  };
  const res = { roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", adults: 2, children: 0 };

  it("prefers a manual price override over everything else", () => {
    expect(reservationTotal({ ...res, priceOverride: 123, bookedPrice: 999 }, core)).toBe(123);
  });
  it("falls back to the frozen bookedPrice when there's no override", () => {
    expect(reservationTotal({ ...res, bookedPrice: 555 }, core)).toBe(555);
  });
  it("falls back to a live recalculation when neither override nor bookedPrice exist", () => {
    expect(reservationTotal(res, core)).toBe(300);
  });
  it("clamps a negative override to 0 rather than falling back to bookedPrice", () => {
    // Documents actual behaviour: an out-of-range override short-circuits
    // the function and returns 0 directly — it does not fall through to
    // bookedPrice/live pricing. Worth knowing since it means a stray
    // negative value silently zeroes an invoice line instead of erroring.
    expect(reservationTotal({ ...res, priceOverride: -5, bookedPrice: 555 }, core)).toBe(0);
  });
});

describe("liveReservationTotalOnline", () => {
  const core = {
    rooms: [{ id: "r1", type: "tiny" }, { id: "r2", type: "tiny" }],
    rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
    onlinePricing: [{ min: 0, max: 50, adjustmentPct: -10 }, { min: 50, max: 101, adjustmentPct: 20 }],
  };
  it("leaves the price untouched for reservations not made through the online site", () => {
    const res = { id: "a", roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", adults: 2, children: 0, source: "direct" };
    expect(liveReservationTotalOnline(res, core, [res])).toBe(300);
  });
  // Sosirea e 18 august, ora 18:00 in Romania (15:00 UTC). `acum` se da
  // explicit, ca testele sa nu depinda de ziua in care ruleaza.
  const res = { id: "a", roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", adults: 2, children: 0, status: "confirmed", source: "site" };
  // occupancyForStay exclude din numaratoare chiar rezervarea evaluata
  // (vezi comentariul ei) — ca sa iasa ocupare nenula e nevoie de o alta
  // camera ocupata: 1 din 2 => 50%, adica pragul al doilea (+20%).
  const alta = { id: "b", roomId: "r2", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", status: "confirmed" };

  it("applies the online-pricing tier adjustment for a stay starting today", () => {
    const acum = new Date("2026-08-18T09:00:00Z"); // 18 aug, 12:00 in Romania
    expect(liveReservationTotalOnline(res, core, [res, alta], acum)).toBe(360);
  });

  it("leaves the price untouched when the stay starts on any later day", () => {
    // Aceeasi ocupare, aceeasi rezervare — doar ca azi e cu o zi inainte.
    // Optimizatorul e o parghie de last-minute: fara regula asta, cine
    // rezerva din timp ar primi ajustarea pe o ocupare inca nestransa.
    const acum = new Date("2026-08-17T09:00:00Z");
    expect(liveReservationTotalOnline(res, core, [res, alta], acum)).toBe(300);
  });

  it("treats 'today' in Romanian time, not UTC", () => {
    // 17 aug 22:00 UTC = 18 aug, ora 1 noaptea in Romania. Cine cere o
    // camera atunci pentru chiar acea noapte e last-minute; dupa data UTC
    // ar fi parut ca rezerva pentru maine si ar fi ratat ajustarea.
    const acum = new Date("2026-08-17T22:00:00Z");
    expect(liveReservationTotalOnline(res, core, [res, alta], acum)).toBe(360);
  });
});

describe("calcAmounts", () => {
  it("splits a VAT-inclusive total into net + VAT at 21%", () => {
    const { totalAmount, netAmount, vatAmount } = calcAmounts(121, 1, 21);
    expect(totalAmount).toBe(121);
    expect(netAmount).toBeCloseTo(100, 6);
    expect(vatAmount).toBeCloseTo(21, 6);
  });
  it("multiplies unit price by quantity before splitting VAT", () => {
    const { totalAmount, netAmount } = calcAmounts(100, 3, 0);
    expect(totalAmount).toBe(300);
    expect(netAmount).toBe(300);
  });
  it("treats a missing/invalid VAT rate as 0%", () => {
    const { netAmount, vatAmount } = calcAmounts(100, 1, undefined);
    expect(netAmount).toBe(100);
    expect(vatAmount).toBe(0);
  });
});

/* Paritatea cu implementarea din SQL. Vezi src/lib/pricing-matrice.js
   pentru context: cele două formule au divergat luni de zile, iar acest
   test e jumătatea JS a contractului. Cealaltă jumătate e verificată de
   tests/paritate-pret.sql, pe aceleași valori. */
describe("nightlyRate — paritate cu nightly_rate() din SQL", () => {
  it.each(MATRICE_TARIF)(
    "%s · %i adulți · %i copii → %i lei/noapte",
    (tip, adulti, copii, asteptat) => {
      const tarif = nightlyRate(
        new Date(2026, 7, 20), tip, TARIFE_REFERINTA,
        { adults: adulti, children: copii },
      );
      expect(tarif).toBe(asteptat);
    },
  );

  it("acoperă ambele tipuri de cameră și 1–4 adulți cu 0–2 copii", () => {
    // Dacă matricea se subțiază, testul de mai sus rămâne verde degeaba.
    expect(MATRICE_TARIF).toHaveLength(24);
  });
});

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(166.66666666666666)).toBe(166.67);
    expect(round2(100)).toBe(100);
  });
  it("handles the classic floating-point rounding trap (1.005 is really 1.00499...)", () => {
    expect(round2(1.005)).toBe(1.01);
  });
  it("returns 0 for non-numeric input rather than NaN, so a bad value can never reach the database", () => {
    expect(round2("nu-i numar")).toBe(0);
    expect(round2(undefined)).toBe(0);
  });
});

describe("splitEvenly", () => {
  it("splits a total across parts so the parts sum back to exactly the total", () => {
    const parts = splitEvenly(100, 3);
    expect(parts).toHaveLength(3);
    expect(round2(parts.reduce((a, b) => a + b, 0))).toBe(100);
  });
  it("gives the leftover bani to the first parts, not the last", () => {
    // 100 / 3 = 33.33 each, 1 ban left over -> first part gets it.
    expect(splitEvenly(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });
  it("splits an evenly-divisible total without a remainder", () => {
    expect(splitEvenly(300, 3)).toEqual([100, 100, 100]);
  });
  it("treats 0 or negative part counts as a single part rather than dividing by zero", () => {
    expect(splitEvenly(50, 0)).toEqual([50]);
  });
});

describe("validateStay", () => {
  it("accepts a normal, valid stay", () => {
    expect(validateStay("2026-08-18T15:00:00Z", "2026-08-20T11:00:00Z")).toBeNull();
  });
  it("rejects a checkout on/before checkin", () => {
    expect(validateStay("2026-08-20T15:00:00Z", "2026-08-18T11:00:00Z")).toMatch(/după check-in/);
  });
  it("rejects an unparsable date", () => {
    expect(validateStay("not-a-date", "2026-08-20T11:00:00Z")).toMatch(/check-in/);
  });
  it("rejects a stay longer than 365 nights (very likely a data-entry mistake)", () => {
    expect(validateStay("2026-01-01T15:00:00Z", "2028-01-01T11:00:00Z")).toMatch(/365/);
  });
});

describe("validateCUIFormat", () => {
  it("accepts an empty CUI as optional (ok, no warning)", () => {
    expect(validateCUIFormat("")).toEqual({ ok: true, warn: false });
  });
  it("rejects a CUI with non-digit characters (beyond an optional RO prefix)", () => {
    expect(validateCUIFormat("ABCDEFG").ok).toBe(false);
  });
  it("rejects a CUI that's too long", () => {
    expect(validateCUIFormat("12345678901").ok).toBe(false);
  });
  it("accepts a correctly-formatted CUI with a valid control digit, with or without the RO prefix", () => {
    // RO33918057 is a real, valid-format CUI used elsewhere in this session's test data.
    expect(validateCUIFormat("RO33918057")).toEqual({ ok: true, warn: false, message: expect.any(String) });
    expect(validateCUIFormat("33918057")).toEqual({ ok: true, warn: false, message: expect.any(String) });
  });
  it("flags (but doesn't reject) a well-formatted CUI whose control digit doesn't match", () => {
    const result = validateCUIFormat("RO12345678");
    expect(result.ok).toBe(true);
    expect(result.warn).toBe(true);
  });
});
