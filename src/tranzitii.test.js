import { describe, it, expect } from "vitest";
import {
  canCheckIn, canCheckOut, canCancel, canNoShow,
  checkouturiRestante, zileIntarziere, ORE_CHECKIN_DEVREME, ZILE_CHECKIN_DEVREME,
  sosiriRestante, zileIntarziereSosire,
} from "./lib/tranzitii.js";

/* Momentul de referinta al tuturor testelor. Fix, injectat explicit: o
   regula despre timp testata cu "acum" real trece sau cade dupa ora la care
   ruleaza suita. */
const ACUM = new Date("2026-08-20T10:00:00");
const peste = (ore) => new Date(ACUM.getTime() + ore * 3600_000);

const rez = (over = {}) => ({
  id: "r1", status: "confirmed", roomId: "c1",
  checkin: peste(5).toISOString(), checkout: peste(29).toISOString(),
  ...over,
});

describe("canCheckIn — fereastra de 14 zile", () => {
  it("permite cazarea in ziua sosirii", () => {
    expect(canCheckIn(rez({ checkin: peste(5).toISOString() }), ACUM)).toBe(true);
  });

  it("permite cazarea cu 335h (sub 14 zile) inainte", () => {
    expect(canCheckIn(rez({ checkin: peste(335).toISOString() }), ACUM)).toBe(true);
  });

  it("refuza cazarea cu 337h (peste 14 zile) inainte", () => {
    expect(canCheckIn(rez({ checkin: peste(337).toISOString() }), ACUM)).toBe(false);
  });

  it("accepta exact la limita de 14 zile", () => {
    expect(canCheckIn(rez({ checkin: peste(ORE_CHECKIN_DEVREME).toISOString() }), ACUM)).toBe(true);
    expect(ORE_CHECKIN_DEVREME).toBe(ZILE_CHECKIN_DEVREME * 24);
  });

  it("refuza o sosire din trecut — data trebuie corectata intai", () => {
    expect(canCheckIn(rez({ checkin: peste(-24).toISOString() }), ACUM)).toBe(false);
  });

  it("permite cazarea mai devreme in ziua sosirii, chiar daca ora a trecut", () => {
    /* Sosire azi la 08:00, acum e 10:00: aceeasi zi, deci se poate caza —
       nu e o "sosire trecuta". */
    expect(canCheckIn(rez({ checkin: "2026-08-20T08:00:00" }), ACUM)).toBe(true);
  });

  it("refuza orice status care nu e confirmat", () => {
    for (const status of ["pending", "protocol", "checkedin", "checkedout", "cancelled", "noshow"]) {
      expect(canCheckIn(rez({ status }), ACUM)).toBe(false);
    }
  });
});

describe("canCheckOut / canCancel / canNoShow", () => {
  it("check-out doar dintr-un sejur inceput", () => {
    expect(canCheckOut(rez({ status: "checkedin" }))).toBe(true);
    expect(canCheckOut(rez({ status: "confirmed" }))).toBe(false);
  });

  it("anulare din confirmata sau din cerere (pending) — nu si din alte stari", () => {
    expect(canCancel(rez({ status: "confirmed" }))).toBe(true);
    expect(canCancel(rez({ status: "pending" }))).toBe(true);
    expect(canCancel(rez({ status: "checkedin" }))).toBe(false);
  });

  it("no-show doar dupa ce ziua sosirii a trecut, din confirmata sau din cerere", () => {
    expect(canNoShow(rez({ checkin: peste(-24).toISOString() }), ACUM)).toBe(true);
    expect(canNoShow(rez({ checkin: peste(5).toISOString() }), ACUM)).toBe(false);
    expect(canNoShow(rez({ status: "pending", checkin: peste(-24).toISOString() }), ACUM)).toBe(true);
    expect(canNoShow(rez({ status: "checkedin", checkin: peste(-24).toISOString() }), ACUM)).toBe(false);
  });
});

describe("sosiriRestante — night audit pe sosiri neprezentate", () => {
  it("nu semnaleaza o sosire de azi, oricat de tarziu ar fi ora", () => {
    const seara = new Date("2026-08-20T23:30:00");
    const r = rez({ status: "confirmed", checkin: "2026-08-20T14:00:00" });
    expect(sosiriRestante([r], seara)).toEqual([]);
  });

  it("semnaleaza o sosire de ieri ramasa confirmata sau in cerere", () => {
    const confirmata = rez({ id: "c", status: "confirmed", checkin: "2026-08-19T14:00:00" });
    const cerere = rez({ id: "p", status: "pending", checkin: "2026-08-19T14:00:00" });
    expect(sosiriRestante([confirmata, cerere], ACUM)).toEqual([confirmata, cerere]);
  });

  it("ignora sosirile deja rezolvate — checked-in, no-show sau anulate", () => {
    const cazata = rez({ id: "a", status: "checkedin", checkin: "2026-08-10T14:00:00" });
    const noshow = rez({ id: "n", status: "noshow", checkin: "2026-08-10T14:00:00" });
    const anulata = rez({ id: "x", status: "cancelled", checkin: "2026-08-10T14:00:00" });
    expect(sosiriRestante([cazata, noshow, anulata], ACUM)).toEqual([]);
  });

  it("fiecare restanta poate fi rezolvata pe loc — no-show sau anulare, mereu disponibile", () => {
    const a = rez({ id: "a", status: "confirmed", checkin: "2026-08-18T14:00:00" });
    for (const r of sosiriRestante([a], ACUM)) {
      expect(canNoShow(r, ACUM) || canCancel(r)).toBe(true);
    }
  });
});

describe("checkouturiRestante — night audit", () => {
  it("nu semnaleaza o plecare de azi, oricat de tarziu ar fi ora", () => {
    const seara = new Date("2026-08-20T23:30:00");
    const r = rez({ status: "checkedin", checkout: "2026-08-20T11:00:00" });
    expect(checkouturiRestante([r], seara)).toEqual([]);
  });

  it("semnaleaza o plecare de ieri ramasa checked-in", () => {
    const r = rez({ status: "checkedin", checkout: "2026-08-19T11:00:00" });
    expect(checkouturiRestante([r], ACUM)).toEqual([r]);
  });

  it("ignora rezervarile la care s-a facut deja check-out", () => {
    const r = rez({ status: "checkedout", checkout: "2026-08-19T11:00:00" });
    expect(checkouturiRestante([r], ACUM)).toEqual([]);
  });

  it("ignora anularile si no-show-urile vechi", () => {
    const anulata = rez({ id: "a", status: "cancelled", checkout: "2026-08-10T11:00:00" });
    const noshow = rez({ id: "n", status: "noshow", checkout: "2026-08-10T11:00:00" });
    expect(checkouturiRestante([anulata, noshow], ACUM)).toEqual([]);
  });

  it("intoarce toate restantele, nu doar prima", () => {
    const a = rez({ id: "a", status: "checkedin", checkout: "2026-08-18T11:00:00" });
    const b = rez({ id: "b", status: "checkedin", checkout: "2026-08-19T11:00:00" });
    expect(checkouturiRestante([a, b], ACUM)).toEqual([a, b]);
  });

  it("nu crapa pe lista lipsa", () => {
    expect(checkouturiRestante(undefined, ACUM)).toEqual([]);
  });

  it("fiecare restanta poate fi inchisa pe loc — altfel blocajul ar fi permanent", () => {
    const a = rez({ id: "a", status: "checkedin", checkout: "2026-08-18T11:00:00" });
    for (const r of checkouturiRestante([a], ACUM)) {
      expect(canCheckOut(r)).toBe(true);
    }
  });
});

describe("zileIntarziere", () => {
  it("numara zilele trecute peste plecarea programata", () => {
    expect(zileIntarziere({ checkout: "2026-08-19T11:00:00" }, ACUM)).toBe(1);
    expect(zileIntarziere({ checkout: "2026-08-17T11:00:00" }, ACUM)).toBe(3);
  });
});

describe("zileIntarziereSosire", () => {
  it("numara zilele trecute peste sosirea programata", () => {
    expect(zileIntarziereSosire({ checkin: "2026-08-19T14:00:00" }, ACUM)).toBe(1);
    expect(zileIntarziereSosire({ checkin: "2026-08-17T14:00:00" }, ACUM)).toBe(3);
  });
});
