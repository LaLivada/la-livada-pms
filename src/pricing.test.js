import { describe, it, expect } from "vitest";
import {
  nightsBetween, rangesOverlap, inSeason, nightlyRate, liveReservationTotal,
  liveReservationTotalOnline, reservationTotal, calcAmounts, validateStay,
  validateCUIFormat, isLive,
} from "./pms-app.jsx";

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
  it("applies the online-pricing tier adjustment for source 'site'", () => {
    const res = { id: "a", roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", adults: 2, children: 0, status: "confirmed", source: "site" };
    // occupancyForStay excludes the reservation being priced from the
    // count (see its own comment) — need an *other* room occupied to get
    // a non-zero occupancy: 1 of 2 rooms taken by someone else => 50%,
    // which falls in the second tier (+20%).
    const other = { id: "b", roomId: "r2", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", status: "confirmed" };
    expect(liveReservationTotalOnline(res, core, [res, other])).toBe(360);
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
