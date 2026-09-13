/* Erorile din productie ajung in jurnal — src/lib/erori-productie.js (faza 2,
 * D7 din docs/audit-2026-09.md). Logica pura (descriere, loc, dedupe,
 * plafon) se testeaza fara DOM; instalarea, cu o „fereastra" falsa care doar
 * tine minte ce ascultatori i s-au pus.
 *
 * Erorile „de randare" din teste sunt obiecte simple ({ message }), nu
 * `new Error`: un Error creat aici are stack-ul vitest-ului, iar locul
 * (erori-productie.test.js:NN:NN) ar intra in detaliu — corect in productie,
 * nefolositor intr-o asteptare exacta.
 */
import { describe, it, expect, vi } from "vitest";
import {
  ACTIUNE_EROARE, FEREASTRA_DUBLURI_MS, MAX_PE_SESIUNE, MAX_DETALIU,
  descrieEroare, esteZgomot, loculErorii, agentScurt, detaliuEroare, componentaDin,
  creeazaColector, instaleazaCapturaErori, raporteazaEroare, seteazaEcranCurent,
} from "./lib/erori-productie.js";

describe("descrieEroare — ce se scrie despre o eroare", () => {
  it("mesajul si codul unei erori Supabase/Postgres", () => {
    expect(descrieEroare({ message: "duplicate key", code: "23505" })).toBe("duplicate key (23505)");
  });

  it("numele erorii, cand nu e generic", () => {
    expect(descrieEroare(new TypeError("x is not a function"))).toBe("TypeError: x is not a function");
    expect(descrieEroare(new Error("simplu"))).toBe("simplu");
  });

  it("un sir, un obiect oarecare, nimic", () => {
    expect(descrieEroare("a picat")).toBe("a picat");
    expect(descrieEroare({ status: 502, statusText: "Bad Gateway" })).toBe('{"status":502,"statusText":"Bad Gateway"} (502)');
    expect(descrieEroare(null)).toBe("eroare fără detalii");
    expect(descrieEroare(undefined)).toBe("eroare fără detalii");
  });
});

describe("esteZgomot — ce NU merita un rand in jurnal", () => {
  it("avertismentul de layout al browserului si scripturile straine fara detalii", () => {
    expect(esteZgomot("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(esteZgomot("Script error.")).toBe(true);
  });

  it("modulul lipsa dupa un deploy — ErrorBoundary reincarca singur pagina", () => {
    expect(esteZgomot("Failed to fetch dynamically imported module: https://x/assets/a.js")).toBe(true);
  });

  it("orice altceva e semnal", () => {
    expect(esteZgomot("Cannot read properties of undefined (reading 'id')")).toBe(false);
    expect(esteZgomot("")).toBe(false);
  });
});

describe("loculErorii — fisier:linie:coloana, doar numele fisierului", () => {
  it("din ErrorEvent", () => {
    expect(loculErorii({ filename: "https://pms.lalivada.ro/assets/index-Ab12.js", lineno: 12, colno: 5 })).toBe("index-Ab12.js:12:5");
  });

  it("din stack, cand evenimentul nu spune", () => {
    const e = new Error("x");
    e.stack = "Error: x\n    at salveaza (https://pms.lalivada.ro/assets/rezervari-Cd34.js:210:17)\n    at HTMLButtonElement";
    expect(loculErorii(null, e)).toBe("rezervari-Cd34.js:210:17");
  });

  it("gol cand nu se stie", () => {
    expect(loculErorii(null, { stack: "" })).toBe("");
    expect(loculErorii(undefined, undefined)).toBe("");
  });
});

describe("componentaDin — prima componenta din componentStack", () => {
  it("formatul React 19 (at X) si cel vechi (in X)", () => {
    expect(componentaDin("\n    at CalendarView (http://x/a.js:1:2)\n    at Shell")).toBe("CalendarView");
    expect(componentaDin("    in ReservationModal\n    in div")).toBe("ReservationModal");
    expect(componentaDin("")).toBe("");
    expect(componentaDin(undefined)).toBe("");
  });
});

describe("agentScurt — de pe ce vine eroarea, in doua cuvinte", () => {
  it("tableta cu Chrome pe Android", () => {
    expect(agentScurt("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Safari/537.36")).toBe("Chrome 128 · Android");
  });

  it("Safari pe iPad si Edge pe Windows", () => {
    expect(agentScurt("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari 17 · iPad");
    expect(agentScurt("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42")).toBe("Edge 128 · Windows");
  });

  it("necunoscut: sir gol, nu tot user-agentul", () => {
    expect(agentScurt("")).toBe("");
    expect(agentScurt(undefined)).toBe("");
  });
});

describe("detaliuEroare — randul din jurnal", () => {
  it("tip, descriere, loc, ecran, agent — separate cu punct median", () => {
    const d = detaliuEroare({
      tip: "script", eroare: new TypeError("x is undefined"),
      ev: { filename: "https://x/assets/index-A.js", lineno: 3, colno: 9 },
      ecran: "calendar", agent: "Chrome 128 · Android",
    });
    expect(d).toBe("[script] TypeError: x is undefined · index-A.js:3:9 · ecran calendar · Chrome 128 · Android");
  });

  it("componenta React, cand vine din ErrorBoundary", () => {
    const d = detaliuEroare({ tip: "randare", eroare: { message: "boom" }, componenta: "CalendarView" });
    expect(d).toBe("[randare] boom · în CalendarView");
  });

  it("nu depaseste limita coloanei `detail` din activity_log", () => {
    const d = detaliuEroare({ tip: "script", eroare: "x".repeat(5000) });
    expect(d.length).toBe(MAX_DETALIU);
    expect(MAX_DETALIU).toBe(1000);
  });
});

describe("creeazaColector — dedupe si plafon", () => {
  const cuCeas = (t0 = 1_000_000) => {
    let t = t0;
    const scrie = vi.fn(async () => {});
    const c = creeazaColector({ scrie, acum: () => t });
    return { c, scrie, avans: (ms) => { t += ms; } };
  };

  it("scrie prima aparitie, cu actiunea fixa", () => {
    const { c, scrie } = cuCeas();
    expect(c.inregistreaza("[script] boom")).toBe(true);
    expect(scrie).toHaveBeenCalledWith(ACTIUNE_EROARE, "[script] boom");
  });

  it("aceeasi eroare nu se scrie de doua ori in fereastra de 10 minute", () => {
    const { c, scrie, avans } = cuCeas();
    c.inregistreaza("[script] boom");
    avans(FEREASTRA_DUBLURI_MS - 1);
    expect(c.inregistreaza("[script] boom")).toBe(false);
    avans(2);
    expect(c.inregistreaza("[script] boom")).toBe(true);
    expect(scrie).toHaveBeenCalledTimes(2);
  });

  it("erori diferite se scriu fiecare", () => {
    const { c, scrie } = cuCeas();
    c.inregistreaza("[script] a");
    c.inregistreaza("[script] b");
    expect(scrie).toHaveBeenCalledTimes(2);
  });

  it("plafon pe sesiune, ca o bucla de erori sa nu umple jurnalul", () => {
    const { c, scrie } = cuCeas();
    for (let i = 0; i < MAX_PE_SESIUNE + 10; i++) c.inregistreaza(`[script] e${i}`);
    expect(scrie).toHaveBeenCalledTimes(MAX_PE_SESIUNE);
    expect(MAX_PE_SESIUNE).toBe(30);
  });

  it("scrierea care esueaza nu arunca mai departe — raportarea nu are voie sa strice nimic", () => {
    const c = creeazaColector({ scrie: () => { throw new Error("baza e jos"); } });
    expect(() => c.inregistreaza("[script] x")).not.toThrow();
    const c2 = creeazaColector({ scrie: () => Promise.reject(new Error("baza e jos")) });
    expect(c2.inregistreaza("[script] y")).toBe(true);
  });

  it("nimic de scris pentru un detaliu gol", () => {
    const { c, scrie } = cuCeas();
    expect(c.inregistreaza("")).toBe(false);
    expect(scrie).not.toHaveBeenCalled();
  });
});

describe("instaleazaCapturaErori — window.onerror si unhandledrejection", () => {
  /* O fereastra falsa + instalarea pe ea; `dezinstaleaza` se cheama la
     sfarsitul fiecarui test, ca starea de modul (colectorul activ) sa nu
     treaca de la un test la altul. */
  const instaleaza = () => {
    const ascultatori = new Map();
    const w = {
      ascultatori,
      addEventListener: (tip, fn) => ascultatori.set(tip, fn),
      removeEventListener: (tip) => ascultatori.delete(tip),
      navigator: { userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/128.0.0.0" },
    };
    const scrie = vi.fn(async () => {});
    const dezinstaleaza = instaleazaCapturaErori(w, creeazaColector({ scrie }));
    return { w, scrie, dezinstaleaza };
  };

  it("o eroare de script ajunge in jurnal cu locul ei", () => {
    const { w, scrie, dezinstaleaza } = instaleaza();
    w.ascultatori.get("error")({ message: "x is undefined", error: new TypeError("x is undefined"), filename: "https://x/assets/index-A.js", lineno: 3, colno: 9 });
    expect(scrie).toHaveBeenCalledTimes(1);
    expect(scrie.mock.calls[0][1]).toContain("[script] TypeError: x is undefined · index-A.js:3:9");
    expect(scrie.mock.calls[0][1]).toContain("Chrome 128 · Android");
    dezinstaleaza();
  });

  it("o promisiune respinsa fara catch, cu codul de la Supabase", () => {
    const { w, scrie, dezinstaleaza } = instaleaza();
    w.ascultatori.get("unhandledrejection")({ reason: { message: "permission denied", code: "42501" } });
    expect(scrie.mock.calls[0][1]).toContain("[promisiune] permission denied (42501)");
    dezinstaleaza();
  });

  it("zgomotul nu se scrie", () => {
    const { w, scrie, dezinstaleaza } = instaleaza();
    w.ascultatori.get("error")({ message: "ResizeObserver loop limit exceeded" });
    w.ascultatori.get("unhandledrejection")({ reason: new Error("Failed to fetch dynamically imported module: a.js") });
    expect(scrie).not.toHaveBeenCalled();
    dezinstaleaza();
  });

  it("ecranul curent intra in detaliu, iar ErrorBoundary raporteaza prin raporteazaEroare", () => {
    expect(raporteazaEroare("randare", { message: "inainte de instalare" })).toBe(false);
    const { w, scrie, dezinstaleaza } = instaleaza();
    seteazaEcranCurent("calendar");
    expect(raporteazaEroare("randare", { message: "boom" }, "CalendarView")).toBe(true);
    expect(scrie.mock.calls[0][1]).toBe("[randare] boom · în CalendarView · ecran calendar · Chrome 128 · Android");
    dezinstaleaza();
    expect(w.ascultatori.size).toBe(0);
    expect(raporteazaEroare("randare", { message: "dupa" })).toBe(false);
  });
});
