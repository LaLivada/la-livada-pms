/* Teste de proprietate (property-based) pentru invariantii de business.
 *
 * Diferenta fata de testele obisnuite din pricing.test.js: acolo scriem
 * noi exemplele si verificam raspunsul asteptat, deci gasim doar cazurile
 * la care ne-am gandit. Aici declaram o REGULA care trebuie sa fie
 * mereu adevarata, iar fast-check incearca sa o spulbere cu sute de
 * combinatii generate automat — inclusiv cele la care nu ne-am gandit
 * (zero, valori uriase, fractii urate, ordine inversata).
 *
 * Cand un test de aici pica, fast-check reduce automat cazul la cel mai
 * mic contraexemplu si il afiseaza — deci mesajul de eroare arata exact
 * ce combinatie strica regula.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { round2, splitEvenly, calcAmounts } from "./lib/money.js";
import { nightsBetween, rangesOverlap, validateStay } from "./lib/availability.js";
import { nightlyRate, reservationTotal, onlinePriceAdjustmentPct } from "./lib/pricing.js";

/* Sume de bani realiste: pana la 1.000.000 lei, cu 2 zecimale. Nu
   generam Infinity/NaN — acelea sunt tratate separat, ca date invalide. */
const suma = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });
const cota = fc.constantFrom(0, 5, 9, 11, 19, 21);
const cantitate = fc.integer({ min: 1, max: 500 });

describe("Bani — invarianti", () => {
  it("round2 nu se indeparteaza niciodata cu mai mult de jumatate de ban", () => {
    fc.assert(fc.property(suma, (x) => {
      expect(Math.abs(round2(x) - x)).toBeLessThanOrEqual(0.005 + 1e-9);
    }));
  });

  it("round2 e idempotent — rotunjirea unei valori deja rotunjite nu o mai schimba", () => {
    fc.assert(fc.property(suma, (x) => {
      expect(round2(round2(x))).toBe(round2(x));
    }));
  });

  it("round2 intoarce mereu un numar finit, orice ar primi", () => {
    fc.assert(fc.property(fc.anything(), (x) => {
      expect(Number.isFinite(round2(x))).toBe(true);
    }));
  });

  /* INVARIANTUL CENTRAL AL FACTURARII: baza + TVA trebuie sa dea exact
     totalul. Daca pica, o factura poate avea sumele defalcate care nu se
     aduna la cat scrie jos — greseala vizibila la orice control. */
  it("net + TVA == total, pentru orice pret, cantitate si cota", () => {
    fc.assert(fc.property(suma, cantitate, cota, (pret, qty, tva) => {
      const { totalAmount, netAmount, vatAmount } = calcAmounts(pret, qty, tva);
      expect(round2(netAmount + vatAmount)).toBe(totalAmount);
    }));
  });

  it("toate cele trei sume au cel mult 2 zecimale", () => {
    fc.assert(fc.property(suma, cantitate, cota, (pret, qty, tva) => {
      const a = calcAmounts(pret, qty, tva);
      for (const v of [a.totalAmount, a.netAmount, a.vatAmount]) {
        expect(round2(v)).toBe(v);
      }
    }));
  });

  it("TVA-ul nu e niciodata negativ si nu depaseste totalul", () => {
    fc.assert(fc.property(suma, cantitate, cota, (pret, qty, tva) => {
      const { totalAmount, vatAmount } = calcAmounts(pret, qty, tva);
      expect(vatAmount).toBeGreaterThanOrEqual(0);
      expect(vatAmount).toBeLessThanOrEqual(totalAmount);
    }));
  });

  it("la cota 0, baza e chiar totalul si TVA-ul e zero", () => {
    fc.assert(fc.property(suma, cantitate, (pret, qty) => {
      const { totalAmount, netAmount, vatAmount } = calcAmounts(pret, qty, 0);
      expect(netAmount).toBe(totalAmount);
      expect(vatAmount).toBe(0);
    }));
  });

  /* Impartirea pretului unui grup pe camere: banii nu au voie sa apara
     sau sa dispara din cauza rotunjirii. */
  it("splitEvenly imparte fara sa piarda sau sa inventeze bani", () => {
    fc.assert(fc.property(suma, fc.integer({ min: 1, max: 30 }), (total, parti) => {
      const cote = splitEvenly(total, parti);
      expect(cote).toHaveLength(parti);
      expect(round2(cote.reduce((a, b) => a + b, 0))).toBe(round2(total));
    }));
  });

  it("splitEvenly nu produce cote negative, iar diferenta dintre ele e cel mult un ban", () => {
    fc.assert(fc.property(suma, fc.integer({ min: 1, max: 30 }), (total, parti) => {
      const cote = splitEvenly(total, parti);
      expect(Math.min(...cote)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...cote) - Math.min(...cote)).toBeLessThanOrEqual(0.01 + 1e-9);
    }));
  });
});

describe("Perioade si suprapuneri — invarianti", () => {
  const zi = fc.integer({ min: 0, max: 2000 })
    .map((n) => new Date(2026, 0, 1 + n).toISOString());

  /* Adunarea de N*86400000 ms NU inseamna N zile calendaristice: peste
     trecerea la ora de iarna se castiga o ora, asa ca rezultatul cade la
     23:00 in ziua precedenta. Testele de mai jos vorbesc despre zile de
     calendar (o noapte de cazare e o zi de calendar, indiferent daca are
     23 sau 25 de ore), deci le construim cu setDate.
     Prima versiune a acestor teste folosea milisecunde si pica exact pe
     schimbarea orei — nightsBetween era corecta, testul nu. */
  const adaugaZile = (iso, n) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };

  it("un sejur are mereu cel putin o noapte", () => {
    fc.assert(fc.property(zi, zi, (a, b) => {
      expect(nightsBetween(a, b)).toBeGreaterThanOrEqual(1);
    }));
  });

  it("numarul de nopti e chiar diferenta in zile, cand datele sunt in ordine", () => {
    fc.assert(fc.property(zi, fc.integer({ min: 1, max: 400 }), (start, nopti) => {
      const capat = adaugaZile(start, nopti);
      expect(nightsBetween(start, capat)).toBe(nopti);
    }));
  });

  /* Pe date inversate functia NU intoarce numarul real de nopti, ci 1:
     taierea la minimum o noapte e intentionata, ca sa nu se ajunga la un
     pret negativ dintr-o greseala de introducere. Inversarea propriu-zisa
     e prinsa mai devreme, de validateStay. Testul documenteaza asta ca sa
     nu fie "reparata" cu Math.abs — ar ascunde exact greseala pe care o
     semnalam. */
  it("pe date inversate se taie la o noapte, nu la numarul real (comportament voit)", () => {
    fc.assert(fc.property(zi, fc.integer({ min: 1, max: 400 }), (start, nopti) => {
      const capat = adaugaZile(start, nopti);
      expect(nightsBetween(capat, start)).toBe(1);
    }));
  });

  /* Suprapunerea trebuie sa fie simetrica: daca A se bate cu B, atunci si
     B se bate cu A. O implementare asimetrica ar lasa suprarezervari sa
     treaca in functie de ordinea in care sunt comparate rezervarile. */
  it("suprapunerea e simetrica", () => {
    fc.assert(fc.property(zi, zi, zi, zi, (a1, a2, b1, b2) => {
      const [as, ae] = [a1, a2].sort();
      const [bs, be] = [b1, b2].sort();
      expect(rangesOverlap(as, ae, bs, be)).toBe(rangesOverlap(bs, be, as, ae));
    }));
  });

  it("un interval se suprapune mereu cu el insusi (daca are macar o zi)", () => {
    fc.assert(fc.property(zi, fc.integer({ min: 1, max: 60 }), (start, zile) => {
      const e = adaugaZile(start, zile);
      expect(rangesOverlap(start, e, start, e)).toBe(true);
    }));
  });

  /* Regula de turnover: plecarea la 11:00 si sosirea la 15:00 in aceeasi
     zi NU sunt conflict. Daca s-ar considera conflict, camera ar ramane
     nevanduta o noapte la fiecare schimb de oaspeti. */
  it("doua sejururi cap la cap nu se suprapun", () => {
    fc.assert(fc.property(zi, fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 30 }),
      (start, zileA, zileB) => {
        const mijloc = adaugaZile(start, zileA);
        const sfarsit = adaugaZile(start, zileA + zileB);
        expect(rangesOverlap(start, mijloc, mijloc, sfarsit)).toBe(false);
      }));
  });

  it("validateStay accepta orice sejur de 1..365 nopti si respinge orice inversare", () => {
    fc.assert(fc.property(zi, fc.integer({ min: 1, max: 365 }), (start, nopti) => {
      const capat = adaugaZile(start, nopti);
      expect(validateStay(start, capat)).toBeNull();
      // Inversat, trebuie sa se planga mereu.
      expect(validateStay(capat, start)).not.toBeNull();
    }));
  });
});

describe("Tarife — invarianti", () => {
  const tarife = {
    base: { tiny: 300, loft: 400, tinySingle: 260, adultSupplement: 80, childSupplement: 30 },
    seasons: [],
  };

  it("tariful pe noapte nu e niciodata negativ sau NaN", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 2000 }),
      fc.constantFrom("tiny", "loft"),
      fc.integer({ min: 0, max: 12 }),
      fc.integer({ min: 0, max: 12 }),
      (n, tip, adulti, copii) => {
        const t = nightlyRate(new Date(2026, 0, 1 + n), tip, tarife, { adults: adulti, children: copii });
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(0);
      }));
  });

  /* Mai multi oaspeti nu pot costa mai putin — altfel s-ar putea obtine
     un pret mai mic declarand mai multe persoane. */
  it("un adult in plus nu scade niciodata tariful", () => {
    fc.assert(fc.property(
      fc.constantFrom("tiny", "loft"),
      fc.integer({ min: 2, max: 8 }),
      (tip, adulti) => {
        const d = new Date(2026, 5, 15);
        const cuMaiPutini = nightlyRate(d, tip, tarife, { adults: adulti, children: 0 });
        const cuUnulInPlus = nightlyRate(d, tip, tarife, { adults: adulti + 1, children: 0 });
        expect(cuUnulInPlus).toBeGreaterThanOrEqual(cuMaiPutini);
      }));
  });

  it("un copil in plus nu scade niciodata tariful", () => {
    fc.assert(fc.property(
      fc.constantFrom("tiny", "loft"),
      fc.integer({ min: 0, max: 8 }),
      (tip, copii) => {
        const d = new Date(2026, 5, 15);
        const a = nightlyRate(d, tip, tarife, { adults: 2, children: copii });
        const b = nightlyRate(d, tip, tarife, { adults: 2, children: copii + 1 });
        expect(b).toBeGreaterThanOrEqual(a);
      }));
  });

  /* Pretul afisat/facturat nu are voie sa fie negativ sau NaN indiferent
     ce contine rezervarea — inclusiv valori aberante ramase din import
     sau dintr-o editare gresita. */
  it("reservationTotal e mereu un numar finit, nenegativ", () => {
    const core = { rooms: [{ id: "r1", type: "tiny" }], rates: tarife };
    fc.assert(fc.property(
      fc.oneof(fc.constant(null), fc.constant(""), fc.double({ min: -1000, max: 100000, noNaN: true })),
      fc.oneof(fc.constant(null), fc.constant(""), fc.double({ min: -1000, max: 100000, noNaN: true })),
      (override, inghetat) => {
        const res = {
          roomId: "r1", checkin: "2026-08-18T15:00:00Z", checkout: "2026-08-21T11:00:00Z",
          adults: 2, children: 0, priceOverride: override, bookedPrice: inghetat,
        };
        const t = reservationTotal(res, core);
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(0);
      }));
  });

  it("ajustarea de pret online cade mereu intr-un prag definit sau in zero", () => {
    const praguri = [
      { min: 0, max: 40, adjustmentPct: -10 },
      { min: 40, max: 80, adjustmentPct: 0 },
      { min: 80, max: 101, adjustmentPct: 25 },
    ];
    const valori = praguri.map((p) => p.adjustmentPct).concat(0);
    fc.assert(fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (occ) => {
      expect(valori).toContain(onlinePriceAdjustmentPct(occ, praguri));
    }));
  });

  it("fara praguri configurate, pretul ramane neajustat", () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (occ) => {
      expect(onlinePriceAdjustmentPct(occ, [])).toBe(0);
      expect(onlinePriceAdjustmentPct(occ, null)).toBe(0);
    }));
  });
});
