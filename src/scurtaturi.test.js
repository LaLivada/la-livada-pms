/* Scurtaturile de tastatura si intentiile calendarului (faza 3, C2 + C1).
 *
 * Ce s-ar strica tacut: un „n" tastat intr-o nota sa deschida o rezervare
 * noua peste cea editata; Ctrl+K sa fie inghitit de un camp; o tasta
 * tinuta apasata sa deschida zece dialoguri; saltul la un rezultat sa cada
 * fix pe marginea grilei. Regulile sunt pure (lib/scurtaturi.js), deci se
 * testeaza fara DOM.
 */
import { describe, it, expect } from "vitest";
import { decideScurtatura, tintaEditabila, planIntentie, intentie } from "./lib/scurtaturi.js";
import { ziLocala, adaugaZile } from "./lib/timp.js";

const tasta = (key, extra = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra });

describe("decideScurtatura", () => {
  it("Ctrl+K si Cmd+K deschid cautarea, chiar dintr-un camp", () => {
    expect(decideScurtatura(tasta("k", { ctrlKey: true }))).toBe("cautare");
    expect(decideScurtatura(tasta("K", { metaKey: true }))).toBe("cautare");
    expect(decideScurtatura(tasta("k", { ctrlKey: true }), { editabil: true })).toBe("cautare");
    expect(decideScurtatura(tasta("k", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("/ deschide cautarea din afara campurilor, si cu Shift (tastatura germana)", () => {
    expect(decideScurtatura(tasta("/"))).toBe("cautare");
    expect(decideScurtatura(tasta("/", { shiftKey: true }))).toBe("cautare");
    expect(decideScurtatura(tasta("/"), { editabil: true })).toBeNull();
  });

  it("N si T, fara modificatori, din afara campurilor", () => {
    expect(decideScurtatura(tasta("n"))).toBe("nou");
    expect(decideScurtatura(tasta("N"))).toBe("nou"); // CapsLock
    expect(decideScurtatura(tasta("t"))).toBe("azi");
    expect(decideScurtatura(tasta("n"), { editabil: true })).toBeNull();
    expect(decideScurtatura(tasta("n", { ctrlKey: true }))).toBeNull();
    expect(decideScurtatura(tasta("N", { shiftKey: true }))).toBeNull();
    expect(decideScurtatura(tasta("t", { altKey: true }))).toBeNull();
  });

  it("sagetile muta saptamana, dar nu intr-un camp (acolo muta cursorul)", () => {
    expect(decideScurtatura(tasta("ArrowLeft"))).toBe("inapoi");
    expect(decideScurtatura(tasta("ArrowRight"))).toBe("inainte");
    expect(decideScurtatura(tasta("ArrowRight"), { editabil: true })).toBeNull();
    expect(decideScurtatura(tasta("ArrowRight", { shiftKey: true }))).toBeNull();
  });

  /* Testul care conteaza: cu un dialog deschis NIMIC nu trece — nici
     Ctrl+K, altfel ai deschide cautarea peste fisa de rezervare. */
  it("cu un dialog deschis totul tace", () => {
    for (const e of [tasta("k", { ctrlKey: true }), tasta("/"), tasta("n"), tasta("t"), tasta("ArrowLeft")]) {
      expect(decideScurtatura(e, { dialogDeschis: true }), e.key).toBeNull();
    }
  });

  it("o tasta tinuta apasata nu repeta N/T; sagetile da", () => {
    expect(decideScurtatura(tasta("n", { repeat: true }))).toBeNull();
    expect(decideScurtatura(tasta("t", { repeat: true }))).toBeNull();
    expect(decideScurtatura(tasta("ArrowRight", { repeat: true }))).toBe("inainte");
  });

  it("alte taste: nimic", () => {
    for (const k of ["a", "Escape", "Enter", "ArrowUp", " ", ""]) {
      expect(decideScurtatura(tasta(k)), k).toBeNull();
    }
    expect(decideScurtatura(null)).toBeNull();
  });
});

describe("tintaEditabila", () => {
  it("campurile de scris sunt editabile, restul nu", () => {
    expect(tintaEditabila({ tagName: "INPUT" })).toBe(true);
    expect(tintaEditabila({ tagName: "textarea" })).toBe(true);
    expect(tintaEditabila({ tagName: "SELECT" })).toBe(true);
    expect(tintaEditabila({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(tintaEditabila({ tagName: "DIV" })).toBe(false);
    expect(tintaEditabila({ tagName: "BUTTON" })).toBe(false);
    expect(tintaEditabila(null)).toBe(false);
    expect(tintaEditabila(undefined)).toBe(false);
  });
});

describe("planIntentie", () => {
  it("grup: dialogul de grup, si in forma veche „group”", () => {
    expect(planIntentie(intentie("grup"))).toEqual({ modal: { reservation: null, mode: "group" } });
    expect(planIntentie("group")).toEqual({ modal: { reservation: null, mode: "group" } });
  });

  it("nou: dialogul de rezervare noua, fara camera si zi prealese", () => {
    expect(planIntentie(intentie("nou"))).toEqual({ modal: { reservation: null } });
  });

  it("azi: sare la miezul noptii de azi, la Vaslui", () => {
    const acum = new Date("2026-09-14T22:30:00Z"); // 15 septembrie 01:30 la Vaslui
    expect(planIntentie(intentie("azi"), acum)).toEqual({ salt: ziLocala(acum) });
    expect(ziLocala(acum).toISOString()).toBe("2026-09-14T21:00:00.000Z");
  });

  it("saptamana: cu cate zile se muta", () => {
    expect(planIntentie(intentie("saptamana", { zile: 7 }))).toEqual({ zile: 7 });
    expect(planIntentie(intentie("saptamana", { zile: -7 }))).toEqual({ zile: -7 });
    expect(planIntentie(intentie("saptamana"))).toEqual({ zile: 0 });
  });

  /* Saltul e cu o zi INAINTEA sosirii: bara rezervarii nu e lipita de
     marginea stanga a grilei. */
  it("deschide: sare cu o zi inaintea sosirii si tine minte rezervarea", () => {
    const plan = planIntentie(intentie("deschide", { id: "abc", checkin: "2026-10-17T11:00:00Z" }));
    expect(plan.deDeschis).toBe("abc");
    expect(plan.salt.toISOString()).toBe(adaugaZile(ziLocala(new Date("2026-10-17T11:00:00Z")), -1).toISOString());
    expect(plan.salt.toISOString()).toBe("2026-10-15T21:00:00.000Z"); // 16 octombrie 00:00 la Vaslui
  });

  it("deschide fara id sau cu data stricata: nimic de facut", () => {
    expect(planIntentie(intentie("deschide", { checkin: "2026-10-17T11:00:00Z" }))).toBeNull();
    expect(planIntentie(intentie("deschide", { id: "abc", checkin: "nu-e-data" }))).toBeNull();
  });

  it("necunoscut sau lipsa: null", () => {
    expect(planIntentie(null)).toBeNull();
    expect(planIntentie(intentie("altceva"))).toBeNull();
  });
});

describe("intentie", () => {
  /* Doua apasari de → una dupa alta trebuie sa fie doua obiecte diferite,
     altfel React ar lua a doua drept „aceeasi valoare" si n-ar mai muta. */
  it("doua intentii la fel nu sunt egale", () => {
    const a = intentie("saptamana", { zile: 7 });
    const b = intentie("saptamana", { zile: 7 });
    expect(a.tip).toBe("saptamana");
    expect(a.zile).toBe(7);
    expect(a.n).not.toBe(b.n);
    expect(a).not.toEqual(b);
  });
});
