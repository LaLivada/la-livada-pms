/* Conflictul de concurenta (faza 3, C5) — regulile pure din lib/conflict.js.
 *
 * Ce s-ar strica tacut: doua forme ale aceluiasi moment („+00:00" de pe
 * server, „.000Z" din browser) sa para o diferenta; „pastreaza a mea" sa
 * calce peste ce au schimbat ei in campuri pe care nu le-am atins; „ia pe
 * a lor" sa lase in ecran randuri pe care baza nu le-a primit.
 */
import { describe, it, expect } from "vitest";
import {
  esteConflict, canonic, laFel, diferente, imbina, arataValoare, randuriInConflict,
  pregatesteConflict, aplicaAlegerea, ecranDupaAlegere,
} from "./lib/conflict.js";

const BAZA = {
  id: "r1", roomId: "c1", guestId: "g1", groupId: null, checkin: "2026-10-17T11:00:00.000Z",
  checkout: "2026-10-19T09:00:00.000Z", status: "confirmed", adults: 2, children: 0,
  priceOverride: null, bookedPrice: 600, source: "direct", tags: [], notes: "", occupantLastName: "",
  occupantFirstName: "", occupantPhone: "", occupantName: "", messages: [], billingCustomerId: "",
  guestCode: "AAAA", updatedAt: "2026-09-14T10:00:00.000Z",
};
/* Eu: am mutat plecarea cu o zi si am scris o nota. */
const A_MEA = { ...BAZA, checkout: "2026-10-20T09:00:00.000Z", notes: "vine târziu" };
/* Ei: au facut check-in si au pus un pret manual; forma serverului pentru
   momente e „+00:00". */
const A_LOR = {
  ...BAZA, checkin: "2026-10-17T11:00:00+00:00", checkout: "2026-10-19T09:00:00+00:00",
  status: "checkedin", priceOverride: 550, updatedAt: "2026-09-14T10:05:00+00:00", guestCode: "AAAA",
};

describe("esteConflict", () => {
  it("recunoaste codul triggerului si textul lui", () => {
    expect(esteConflict({ code: "40001", message: "x" })).toBe(true);
    expect(esteConflict({ message: "Rezervarea a fost modificata de altcineva intre timp." })).toBe(true);
    expect(esteConflict({ message: "Rezervarea a fost modificată de altcineva" })).toBe(true);
  });
  it("nu confunda alte erori", () => {
    expect(esteConflict({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(esteConflict({ message: "failed to fetch" })).toBe(false);
    expect(esteConflict(null)).toBe(false);
  });
});

describe("canonic / laFel", () => {
  it("acelasi moment in doua forme e acelasi", () => {
    expect(laFel("moment", "2026-10-17T11:00:00.000Z", "2026-10-17T11:00:00+00:00")).toBe(true);
    expect(laFel("moment", "2026-10-17T11:00:00Z", "2026-10-17T12:00:00Z")).toBe(false);
  });
  it("lipsa e lipsa, oricum ar fi scrisa", () => {
    expect(laFel("text", "", null)).toBe(true);
    expect(laFel("text", undefined, "")).toBe(true);
    expect(laFel("bani", null, "")).toBe(true);
    expect(laFel("text", "", "a")).toBe(false);
  });
  it("numerele din formular (text) sunt numere", () => {
    expect(laFel("bani", "550", 550)).toBe(true);
    expect(laFel("numar", 0, "0")).toBe(true);
    expect(canonic("numar", 0)).toBe(0);
  });
  it("listele se compara pe continut", () => {
    expect(laFel("lista", ["a", "b"], ["a", "b"])).toBe(true);
    expect(laFel("lista", [], undefined)).toBe(true);
    expect(laFel("lista", ["a"], ["b"])).toBe(false);
  });
});

describe("diferente", () => {
  it("arata ce am schimbat eu, ce au schimbat ei, si unde ne-am calcat", () => {
    const d = diferente(BAZA, A_MEA, A_LOR);
    expect(d.map((x) => x.cheie)).toEqual(["checkout", "status", "priceOverride", "notes"]);
    const plecare = d.find((x) => x.cheie === "checkout");
    expect(plecare.euAmSchimbat).toBe(true);
    expect(plecare.eiAuSchimbat).toBe(false);
    expect(plecare.amandoi).toBe(false);
    const status = d.find((x) => x.cheie === "status");
    expect(status.euAmSchimbat).toBe(false);
    expect(status.eiAuSchimbat).toBe(true);
  });

  it("acelasi camp schimbat de amandoi, diferit, e marcat", () => {
    const lorCuPlecare = { ...A_LOR, checkout: "2026-10-21T09:00:00+00:00" };
    const d = diferente(BAZA, A_MEA, lorCuPlecare).find((x) => x.cheie === "checkout");
    expect(d.amandoi).toBe(true);
  });

  it("acelasi camp schimbat de amandoi la fel NU e conflict", () => {
    const lorCaMine = { ...A_LOR, checkout: "2026-10-20T09:00:00+00:00" };
    const d = diferente(BAZA, A_MEA, lorCaMine).find((x) => x.cheie === "checkout");
    expect(d.euAmSchimbat && d.eiAuSchimbat).toBe(true);
    expect(d.amandoi).toBe(false);
  });

  /* Stampila si codul de oaspete se schimba la fiecare salvare — nu sunt
     „diferente" pe care sa le arati omului. */
  it("ignora campurile de sistem", () => {
    const d = diferente(BAZA, BAZA, { ...BAZA, updatedAt: "2026-09-14T11:00:00Z", guestCode: "BBBB" });
    expect(d).toEqual([]);
  });
});

describe("imbina (pastreaza a mea)", () => {
  it("ale mele raman, restul iau valorile lor, stampila e a lor", () => {
    const r = imbina(BAZA, A_MEA, A_LOR);
    expect(r.checkout).toBe("2026-10-20T09:00:00.000Z");
    expect(r.notes).toBe("vine târziu");
    expect(r.status).toBe("checkedin");
    expect(r.priceOverride).toBe(550);
    expect(r.updatedAt).toBe("2026-09-14T10:05:00+00:00");
    expect(r.checkin).toBe("2026-10-17T11:00:00+00:00");
  });

  it("recalculeaza numele ocupantului", () => {
    const mea = { ...BAZA, occupantLastName: "Olaru", occupantFirstName: "Florin", occupantName: "Olaru Florin" };
    expect(imbina(BAZA, mea, A_LOR).occupantName).toBe("Olaru Florin");
    expect(imbina(BAZA, BAZA, { ...A_LOR, occupantLastName: "Pop", occupantName: "Pop" }).occupantName).toBe("Pop");
  });
});

describe("arataValoare", () => {
  const ctx = { numeCamera: (id) => ({ c1: "1005" })[id], numeOaspete: (id) => ({ g1: "Popescu Ana" })[id] };
  it("traduce id-urile, momentele, banii si statusul", () => {
    expect(arataValoare({ tip: "camera" }, "c1", ctx)).toBe("1005");
    expect(arataValoare({ tip: "oaspete" }, "g1", ctx)).toBe("Popescu Ana");
    expect(arataValoare({ tip: "oaspete" }, "g9", ctx)).toBe("g9");
    expect(arataValoare({ tip: "status" }, "checkedin")).toBe("Checked-in");
    expect(arataValoare({ tip: "bani" }, 550)).toBe("550 lei");
    expect(arataValoare({ tip: "moment" }, "2026-10-17T11:00:00Z")).toMatch(/17\.10/);
    expect(arataValoare({ tip: "lista" }, ["vip", "pat suplimentar"])).toBe("vip, pat suplimentar");
    expect(arataValoare({ tip: "mesaje" }, [{}])).toBe("1 mesaj");
  });
  it("lipsa e o liniuta", () => {
    expect(arataValoare({ tip: "text" }, "")).toBe("—");
    expect(arataValoare({ tip: "bani" }, null)).toBe("—");
    expect(arataValoare({ tip: "lista" }, [])).toBe("—");
  });
});

describe("randuriInConflict / pregatesteConflict", () => {
  it("doar randurile cu stampila mai noua pe server", () => {
    const trimise = [A_MEA, { ...BAZA, id: "r2", notes: "x" }, { id: "r3", updatedAt: null, roomId: "c1" }];
    const server = [A_LOR, { ...BAZA, id: "r2" }, { ...BAZA, id: "r3", updatedAt: "2026-09-14T12:00:00Z" }];
    expect(randuriInConflict(trimise, server).map((r) => r.id)).toEqual(["r1"]);
  });

  it("pregateste cele trei versiuni si cine a umblat", () => {
    const cine = new Map([["r1", { userName: "Razvan", at: "2026-09-14T10:05:00Z", action: "Check-in" }]]);
    const randuri = pregatesteConflict([BAZA], [A_MEA], [A_LOR], cine);
    expect(randuri).toHaveLength(1);
    expect(randuri[0].baza).toBe(BAZA);
    expect(randuri[0].aMea).toBe(A_MEA);
    expect(randuri[0].aLor).toBe(A_LOR);
    expect(randuri[0].cine.userName).toBe("Razvan");
  });

  it("fara un rand explicabil, null — apelantul cade pe drumul vechi", () => {
    expect(pregatesteConflict([BAZA], [A_MEA], [{ ...A_LOR, updatedAt: BAZA.updatedAt }])).toBeNull();
    expect(pregatesteConflict([BAZA], [A_MEA], [])).toBeNull();
  });
});

describe("aplicaAlegerea", () => {
  const ALT = { ...BAZA, id: "r2", notes: "alta rezervare, tot a mea" };
  const before = [BAZA, { ...BAZA, id: "r2" }];
  const combinat = [A_MEA, ALT];
  const randuri = pregatesteConflict(before, combinat, [A_LOR]);

  it("„mea”: se scrie lista imbinata, cu celelalte modificari ale mele intacte", () => {
    const { scrie, final } = aplicaAlegerea("mea", combinat, randuri);
    expect(scrie).toBe(true);
    expect(final.find((r) => r.id === "r1").status).toBe("checkedin");
    expect(final.find((r) => r.id === "r1").notes).toBe("vine târziu");
    expect(final.find((r) => r.id === "r2")).toBe(ALT);
  });

  /* Ce se vede dupa „lor" hotaraste ecranDupaAlegere, peste ecranul de
     ACUM; o lista refacuta aici din instantaneu ar fi o invitatie sa fie
     pusa pe ecran, cum se intampla pana pe 21 septembrie 2026. */
  it("„lor” sau dialog inchis: nu se scrie nimic, deci nu exista lista", () => {
    expect(aplicaAlegerea("lor", combinat, randuri)).toEqual({ scrie: false, final: null });
    expect(aplicaAlegerea(null, combinat, randuri)).toEqual({ scrie: false, final: null });
  });
});

/* Ce se vede dupa alegere. Dialogul poate sta deschis minute intregi, iar
   in spatele lui ecranul merge mai departe (Realtime, alte salvari, alt
   conflict rezolvat): alegerea se aplica peste ce e pe ecran ACUM, doar pe
   randurile salvarii respinse. */
describe("ecranDupaAlegere", () => {
  /* O salvare cu trei randuri: r1 (in conflict), r2 (modificat, fara
     conflict) si r9 (nou). r3 nu e al ei. */
  const R2 = { ...BAZA, id: "r2" };
  const R2_MEA = { ...R2, notes: "alta rezervare, tot a mea" };
  const R3 = { ...BAZA, id: "r3" };
  const NOU = { ...BAZA, id: "r9", guestCode: "", updatedAt: null };
  const before = [BAZA, R2, R3];
  const trimise = [A_MEA, R2_MEA, NOU];
  const dupaSalvare = [A_MEA, R2_MEA, R3, NOU]; // ce a pus salvarea pe ecran
  const randuri = pregatesteConflict(before, trimise, [A_LOR, R2]);
  const MAI_TARZIU = "2026-09-14T10:09:00+00:00";

  it("„mea”: randul in conflict ia versiunea imbinata, cea care se scrie; restul ramane cum e", () => {
    expect(ecranDupaAlegere("mea", dupaSalvare, before, trimise, randuri))
      .toEqual([imbina(BAZA, A_MEA, A_LOR), R2_MEA, R3, NOU]);
  });

  /* Scrierea respinsa era una singura, atomica: nici r2, nici r9 n-au ajuns
     in baza, deci nici pe ecran nu raman „modificat", respectiv „creat". */
  it("„lor”: versiunea lor pe randul in conflict; celelalte randuri ale salvarii revin la ce era, cele noi dispar", () => {
    expect(ecranDupaAlegere("lor", dupaSalvare, before, trimise, randuri)).toEqual([A_LOR, R2, R3]);
  });

  it("dialog inchis = ca „lor”", () => {
    expect(ecranDupaAlegere(null, dupaSalvare, before, trimise, randuri))
      .toEqual(ecranDupaAlegere("lor", dupaSalvare, before, trimise, randuri));
  });

  it.each(["mea", "lor"])("„%s”: randurile neatinse de salvare raman cum sunt ACUM, nu cum erau in instantaneu", (alegere) => {
    const R3_LIVE = { ...R3, children: 1, updatedAt: MAI_TARZIU };
    const SOSIT = { ...BAZA, id: "r7" };
    const ecran = ecranDupaAlegere(alegere, [A_MEA, R2_MEA, R3_LIVE, NOU, SOSIT], before, trimise, randuri);
    expect(ecran.find((r) => r.id === "r3")).toBe(R3_LIVE);
    expect(ecran.find((r) => r.id === "r7")).toBe(SOSIT);
  });

  /* Realtime inlocuieste randul dupa id, iar o salvare de mai tarziu il
     rescrie: ce e acum pe ecran e mai nou decat instantaneul, deci ramane. */
  it("„lor”: un rand al salvarii inlocuit intre timp pe ecran nu e dat inapoi", () => {
    const R2_LIVE = { ...R2, children: 1, updatedAt: MAI_TARZIU };
    const NOU_SCRIS = { ...NOU, notes: "completat si salvat apoi", updatedAt: MAI_TARZIU };
    const ecran = ecranDupaAlegere("lor", [A_MEA, R2_LIVE, R3, NOU_SCRIS], before, trimise, randuri);
    expect(ecran).toEqual([A_LOR, R2_LIVE, R3, NOU_SCRIS]);
  });

  it("„lor”: daca intre timp a sosit ceva si pe randul in conflict, ramane ce e pe ecran", () => {
    const A_LOR_APOI = { ...A_LOR, notes: "au mai scris o data", updatedAt: MAI_TARZIU };
    const ecran = ecranDupaAlegere("lor", [A_LOR_APOI, R2_MEA, R3, NOU], before, trimise, randuri);
    expect(ecran.find((r) => r.id === "r1")).toBe(A_LOR_APOI);
  });

  /* Salvarea lor ajunge de obicei si prin Realtime cat dialogul e deschis si
     ia locul versiunii mele pe ecran; ce se scrie tot imbinarea e. */
  it("„mea”: imbinarea se pune si peste ecoul Realtime al salvarii lor", () => {
    const ecran = ecranDupaAlegere("mea", [A_LOR, R2_MEA, R3, NOU], before, trimise, randuri);
    expect(ecran.find((r) => r.id === "r1")).toEqual(imbina(BAZA, A_MEA, A_LOR));
  });

  it.each(["mea", "lor"])("„%s”: un rand disparut intre timp de pe ecran nu reapare", (alegere) => {
    expect(ecranDupaAlegere(alegere, [R3], before, trimise, randuri)).toEqual([R3]);
  });
});
