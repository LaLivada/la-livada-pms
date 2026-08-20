import { describe, it, expect } from "vitest";
/* Logica pura sta acum in ./lib — testele nu mai incarca intreaga
   aplicatie (si tot lantul ei de dependinte React/Supabase) doar ca sa
   ajunga la cateva functii de calcul. */
import {
  nightsBetween, rangesOverlap, validateStay, isLive,
} from "./lib/availability.js";
import {
  inSeason, nightlyRate, liveReservationTotal,
  liveReservationTotalOnline, reservationTotal, onlineNightAdjustmentPct,
} from "./lib/pricing.js";
import { calcAmounts, round2, splitEvenly } from "./lib/money.js";
import { validateCUIFormat, validatePhone, validateEmail } from "./lib/validation.js";
import {
  MATRICE_TARIF, TARIFE_REFERINTA,
  PRAGURI_ONLINE_REFERINTA, MATRICE_AJUSTARE, MATRICE_ROTUNJIRE,
} from "./lib/pricing-matrice.js";

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
  // occupancyForStay exclude din numaratoare chiar rezervarea evaluata
  // (vezi comentariul ei) — ca sa iasa ocupare nenula e nevoie de o alta
  // camera ocupata: 1 din 2 => 50%, adica pragul al doilea (+20%).
  const res = { id: "a", roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", adults: 2, children: 0, status: "confirmed", source: "site" };
  const alta = { id: "b", roomId: "r2", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", status: "confirmed" };

  it("applies the tier increase when the booked night is busy", () => {
    expect(liveReservationTotalOnline(res, core, [res, alta])).toBe(360);
  });

  it("never goes below the base price, however empty the night is", () => {
    // Fara `alta`, ocuparea e 0% si cade in primul prag, care e -10%.
    // Ocuparea masoara rezervarile stranse pana acum, nu cererea: o zi
    // goala inseamna adesea doar ca e devreme, nu ca nu vrea nimeni.
    expect(liveReservationTotalOnline(res, core, [res])).toBe(300);
  });

  it("rounds a half-leu the same way SQL does", () => {
    // 350 × 15% = 402,50 exact. Scris ca `350 * 1.15`, JS da
    // 402,49999999999997 si coboara la 402, in timp ce SQL, pe numeric
    // zecimal, urca la 403 — un leu diferenta intre pretul afisat de site
    // si cel inregistrat in PMS. Verificat pe baza reala inainte de fix.
    const c = {
      rooms: [{ id: "r1", type: "loft" }, { id: "r2", type: "loft" }],
      rates: { base: { loft: 350, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
      onlinePricing: [{ min: 0, max: 50, adjustmentPct: 0 }, { min: 50, max: 101, adjustmentPct: 15 }],
    };
    const r = { id: "a", roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", adults: 2, children: 0, status: "confirmed", source: "site" };
    const b = { id: "b", roomId: "r2", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-19T11:00:00Z", status: "confirmed" };
    expect(liveReservationTotalOnline(r, c, [r, b])).toBe(403);
  });

  it("prices each night by its own occupancy, not by the stay average", () => {
    // Doua nopti: 18 aug e plina la 50% (r2 ocupata de altcineva), 19 aug
    // e goala. Pe noapte: 300×1,20 + 300 = 660.
    // Pe media sejurului ar fi iesit 25% ocupare, deci pragul de -10% —
    // adica 540, cu weekendul plin diluat de ziua goala de dupa.
    const douaNopti = { ...res, checkout: "2026-08-20T11:00:00Z" };
    expect(liveReservationTotalOnline(douaNopti, core, [douaNopti, alta])).toBe(660);
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

/* Jumătatea JS a contractului pentru ajustarea online. Perechea ei e
   secțiunea „AJUSTAREA ONLINE" din tests/paritate-pret.sql, care rulează
   aceleași valori prin implementarea din bază. Dacă modifici matricele,
   modifică-le în AMBELE locuri. */
describe("contractul ajustării online — jumătatea JS", () => {
  it.each(MATRICE_AJUSTARE)(
    "la %s%% ocupare aplică %s%%",
    (ocupare, asteptat) => {
      expect(onlineNightAdjustmentPct(ocupare, PRAGURI_ONLINE_REFERINTA)).toBe(asteptat);
    });

  it("nu ajustează nimic dacă nu există praguri configurate", () => {
    expect(onlineNightAdjustmentPct(95, [])).toBe(0);
    expect(onlineNightAdjustmentPct(95, null)).toBe(0);
  });

  it.each(MATRICE_ROTUNJIRE)(
    "însumează %j la %s",
    (nopti, asteptat) => {
      // Exact forma folosită de liveReservationTotalOnline și de stay_total:
      // înmulțire pe întregi, împărțire la final, rotunjire o singură dată
      // pe total — nu pe fiecare noapte.
      const total = nopti.reduce((s, [tarif, pct]) => s + tarif * (100 + pct) / 100, 0);
      expect(Math.round(total)).toBe(asteptat);
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
  it("survives an object that cannot be converted to a primitive at all", () => {
    // `Number({toString: null})` arunca TypeError: obiectul nu are nici
    // valueOf nici toString apelabile. Contraexemplu gasit de testele de
    // proprietate, dar doar in CI — fast-check schimba seed-ul la fiecare
    // rulare, deci local trecuse de zeci de ori. Fixat aici determinist,
    // ca sa nu mai depinda de noroc.
    const otrava = { toString: null };
    expect(round2(otrava)).toBe(0);
    expect(splitEvenly(100, otrava)).toEqual([100]);
    expect(calcAmounts(otrava, 1, 21)).toEqual({ totalAmount: 0, netAmount: 0, vatAmount: 0 });
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

describe("validatePhone", () => {
  it("accepts an empty number as optional", () => {
    expect(validatePhone("")).toEqual({ ok: true, warn: false });
  });
  it("accepts a normal local number, with or without a dial prefix known", () => {
    expect(validatePhone("722 111 222", "+40").ok).toBe(true);
    expect(validatePhone("722111222").ok).toBe(true);
  });
  it("rejects letters or other non-digit characters", () => {
    expect(validatePhone("722 ABC 222", "+40").ok).toBe(false);
  });
  // Bug real gasit in productie pe 20 august 2026: prefixul de tara ales
  // din PhoneDialPicker (+40), apoi numarul tastat cu 0 in fata, ca la un
  // numar local — rezultatul salvat ("+40 0733715111") nu suna niciodata.
  it("rejects a leading 0 when a dial prefix is already chosen", () => {
    const r = validatePhone("0733715111", "+40");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/0/);
  });
  it("accepts a leading 0 when there's no separate dial prefix (free-text phone fields)", () => {
    expect(validatePhone("0733715111").ok).toBe(true);
  });
  it("rejects numbers that are unreasonably short or long", () => {
    expect(validatePhone("123", "+40").ok).toBe(false);
    expect(validatePhone("1".repeat(20), "+40").ok).toBe(false);
  });
});

describe("validateEmail", () => {
  it("accepts an empty email as optional", () => {
    expect(validateEmail("")).toEqual({ ok: true, warn: false });
  });
  it("accepts a well-formatted email", () => {
    expect(validateEmail("andrei.popescu@example.com").ok).toBe(true);
  });
  it("rejects an email without @ or without a domain dot", () => {
    expect(validateEmail("andrei.popescu-example.com").ok).toBe(false);
    expect(validateEmail("andrei@example").ok).toBe(false);
  });
  it("rejects an email with embedded whitespace", () => {
    expect(validateEmail("andrei popescu@example.com").ok).toBe(false);
  });
});
