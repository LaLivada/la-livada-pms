/* Test de randare pentru ecranul Evenimente (features/caldav.jsx): taburile,
 * calendarul pe ani (anul curent la pornire, navigarea, bulinele pe zi,
 * lista zilei alese sub luna ei, legenda care ascunde sali) si tabul
 * „Serverul & sali” cu adresa, salile si butoanele de import. Ecranul cere
 * autentificare in aplicatie, deci „a compilat” nu e dovada ca arata bine.
 * Momentele din fixtura sunt UTC; zilele asteptate sunt cele de la Vaslui. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const CALENDARE = [
  { id: "c1", slug: "grand-or-ballroom", nume: "Grand’Or Ballroom", culoare: "#BD9B00", ordine: 0, ctag: 1, activ: true, creat_la: "2026-09-15T16:31:50Z", actualizat_la: "2026-09-15T19:04:41Z" },
  { id: "c2", slug: "sera", nume: "Sera", culoare: "#016AFF", ordine: 1, ctag: 1, activ: true, creat_la: "2026-09-15T16:32:24Z", actualizat_la: "2026-09-15T19:06:52Z" },
  /* Calendarul gri in care functia edge muta anulatele; ecranul il tine
     ascuns pana il ceri din legenda. */
  { id: "c3", slug: "anulate", nume: "Anulate", culoare: "#6B7280", ordine: 2, ctag: 1, activ: true, creat_la: "2026-09-15T21:00:00Z", actualizat_la: "2026-09-15T21:00:00Z" },
];
const EVENIMENTE = [
  { id: "e1", calendar_id: "c1", uid: "u1", rezumat: "Alexandru & Alexandra", incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-05T21:00:00Z", toata_ziua: true, recurent: false },
  { id: "e2", calendar_id: "c2", uid: "u2", rezumat: "Botez Maria", incepe: "2027-06-05T09:00:00Z", se_termina: "2027-06-05T15:00:00Z", toata_ziua: false, recurent: false },
  { id: "e3", calendar_id: "c2", uid: "u3", rezumat: "Revelion", incepe: "2027-12-31T18:00:00Z", se_termina: "2028-01-01T02:00:00Z", toata_ziua: false, recurent: false },
  { id: "e4", calendar_id: "c3", uid: "u4", rezumat: "Adrian & Monica", incepe: "2027-06-04T21:00:00Z", se_termina: "2027-06-05T21:00:00Z", toata_ziua: true, recurent: false, anulat: true },
];
/* Aceeasi lista pentru orice an: ecranul e cel care asaza evenimentele pe
   zilele anului cerut, deci un an gol trebuie sa ramana gol si asa. */
const listeazaEvenimente = vi.fn(async () => EVENIMENTE);
const importaICS = vi.fn(async () => ({ noi: 1, actualizate: 0, ignorate: 0, total: 1 }));

vi.mock("./data/caldav.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    listeazaCalendare: vi.fn(async () => CALENDARE),
    numarEvenimente: vi.fn(async () => ({ c1: 1, c2: 2, c3: 1 })),
    listeazaEvenimente,
    importaICS,
  };
});

const { EvenimenteView } = await import("./features/caldav.jsx");

const montate = [];
async function randeaza() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(EvenimenteView)); });
  await act(async () => {});
  return host;
}
const apasa = async (el) => { await act(async () => { el.click(); }); await act(async () => {}); };
const butonEticheta = (host, text) => [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === text);
const butonText = (host, text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const anAfisat = (host) => host.querySelector(".an-nav strong").textContent;

beforeEach(() => {
  /* Doar Date: „anul curent” trebuie sa fie 2026 oricand ar rula testul. */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
  listeazaEvenimente.mockClear();
});

afterEach(async () => {
  await act(async () => { montate.forEach((m) => m.root.unmount()); });
  montate.forEach((m) => m.host.remove());
  montate.length = 0;
  vi.useRealTimers();
});

describe("EvenimenteView", () => {
  it("porneste pe „Calendar pe ani”, in anul curent, cu 12 luni si legenda salilor", async () => {
    const host = await randeaza();
    const taburi = [...host.querySelectorAll('[role="tab"]')];
    expect(taburi.map((t) => t.textContent.trim())).toEqual(["Calendar pe ani", "Serverul & săli"]);
    expect(taburi[0].getAttribute("aria-selected")).toBe("true");
    expect(anAfisat(host)).toBe("2026");
    expect(listeazaEvenimente).toHaveBeenLastCalledWith(2026);
    expect(host.querySelectorAll("section.luna")).toHaveLength(12);
    expect([...host.querySelectorAll(".luna-cap h4")].map((h) => h.textContent)[0]).toBe("ianuarie");
    const legenda = [...host.querySelectorAll(".an-legenda button")];
    expect(legenda.map((b) => b.textContent.trim())).toEqual(["Grand’Or Ballroom 0", "Sera 0", "Anulate 0"]);
    /* Gri-ul porneste ascuns, sălile pornesc arătate. */
    expect(legenda.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
    expect(host.querySelector(".an-cap .sali-nota").textContent).toBe("0 evenimente în 2026");
    /* Ziua de azi (15 septembrie 2026) e marcata, dar fara evenimente nu e buton. */
    const azi = host.querySelector(".zi.azi");
    expect(azi.tagName).toBe("SPAN");
    expect(azi.textContent).toBe("15");
    expect(butonText(host, "Anul curent")).toBeUndefined();
  });

  it("anul urmator: zilele cu evenimente au buline si eticheta, ziua apasata isi desface lista sub luna ei", async () => {
    const host = await randeaza();
    await apasa(butonEticheta(host, "Anul următor"));
    expect(anAfisat(host)).toBe("2027");
    expect(listeazaEvenimente).toHaveBeenLastCalledWith(2027);
    /* La TOTALURI intra doar cele de toata ziua (cerut pe 16 septembrie
       2026): din cele trei aratate, doar nunta „Alexandru & Alexandra". */
    expect(host.querySelector(".an-cap .sali-nota").textContent).toBe("1 eveniment în 2027");
    expect([...host.querySelectorAll(".an-legenda button")].map((b) => b.textContent.trim())).toEqual(["Grand’Or Ballroom 1", "Sera 0", "Anulate 1"]);

    const iunie = host.querySelectorAll("section.luna")[5];
    expect(iunie.querySelector(".luna-cap .sali-nota").textContent).toBe("1 eveniment");
    /* Dar in calendar se vad amandoua, cu bulinele lor. */
    const zi = butonEticheta(host, "5 iunie: 2 evenimente");
    expect(zi).toBeDefined();
    expect(zi.querySelectorAll(".zi-pct svg")).toHaveLength(2);
    /* 1 ianuarie 2028 nu e in 2027, dar Revelionul incepe pe 31 decembrie.
       Are doar ore, deci decembrie ramane fara numar. */
    expect(butonEticheta(host, "31 decembrie: 1 eveniment")).toBeDefined();
    expect(host.querySelectorAll("section.luna")[11].querySelector(".luna-cap .sali-nota")).toBeNull();
    expect(host.querySelectorAll(".zi.cu")).toHaveLength(2);

    await apasa(zi);
    expect(zi.getAttribute("aria-pressed")).toBe("true");
    const lista = iunie.querySelector(".zi-lista");
    expect(lista).not.toBeNull();
    expect(lista.querySelector(".zi-lista-cap strong").textContent).toBe("sâmbătă, 5 iunie 2027");
    const randuri = [...lista.querySelectorAll("li")].map((li) => li.textContent);
    expect(randuri).toEqual(["Alexandru & AlexandraGrand’Or Ballroom · toată ziua", "Botez MariaSera · 12:00–18:00"]);
    /* Lista sta in luna ei, nu in alta. */
    expect(host.querySelectorAll(".zi-lista")).toHaveLength(1);

    await apasa(lista.querySelector('[aria-label="Închide lista zilei"]'));
    expect(host.querySelector(".zi-lista")).toBeNull();
    expect(zi.getAttribute("aria-pressed")).toBe("false");
  });

  it("calendarul gri al anulatelor: ascuns la pornire, iar un clic il aduce inapoi", async () => {
    const host = await randeaza();
    await apasa(butonEticheta(host, "Anul următor"));
    /* „Adrian & Monica" e anulat si cade pe 5 iunie 2027, peste celelalte
       doua — ziua arata doua evenimente, nu trei, iar anul 3, nu 4. */
    expect(host.querySelector(".an-cap .sali-nota").textContent).toBe("1 eveniment în 2027");
    expect(butonEticheta(host, "5 iunie: 2 evenimente")).toBeDefined();

    const gri = [...host.querySelectorAll(".an-legenda button")].find((b) => b.textContent.includes("Anulate"));
    expect(gri.className).toContain("ascuns");
    await apasa(gri);
    expect(gri.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".an-cap .sali-nota").textContent).toBe("2 evenimente în 2027");
    const zi = butonEticheta(host, "5 iunie: 3 evenimente");
    expect(zi).toBeDefined();
    await apasa(zi);
    expect([...host.querySelectorAll(".zi-lista li")].map((li) => li.textContent)).toEqual([
      "Alexandru & AlexandraGrand’Or Ballroom · toată ziua",
      "Adrian & MonicaAnulate · toată ziua",
      "Botez MariaSera · 12:00–18:00",
    ]);
  });

  it("legenda ascunde o sala: zilele ei raman fara buline, iar numerele din legenda nu se schimba", async () => {
    const host = await randeaza();
    await apasa(butonEticheta(host, "Anul următor"));
    const sera = [...host.querySelectorAll(".an-legenda button")].find((b) => b.textContent.includes("Sera"));
    await apasa(sera);
    expect(sera.getAttribute("aria-pressed")).toBe("false");
    expect(sera.className).toContain("ascuns");
    /* Numarul salii e tot un total, deci si el numara doar toata-ziua. */
    expect(sera.textContent.trim()).toBe("Sera 0");
    expect(butonEticheta(host, "5 iunie: 1 eveniment")).toBeDefined();
    expect(butonEticheta(host, "31 decembrie: 1 eveniment")).toBeUndefined();
    expect(host.querySelectorAll(".zi.cu")).toHaveLength(1);
    await apasa(sera);
    expect(butonEticheta(host, "5 iunie: 2 evenimente")).toBeDefined();
  });

  it("„Anul curent” apare doar in alt an si readuce anul de azi", async () => {
    const host = await randeaza();
    await apasa(butonEticheta(host, "Anul anterior"));
    expect(anAfisat(host)).toBe("2025");
    await apasa(butonText(host, "Anul curent"));
    expect(anAfisat(host)).toBe("2026");
    expect(butonText(host, "Anul curent")).toBeUndefined();
  });

  it("tabul „Serverul & sali” arata adresa serverului, salile cu numarul de evenimente si butoanele de import", async () => {
    const host = await randeaza();
    await apasa([...host.querySelectorAll('[role="tab"]')][1]);
    expect([...host.querySelectorAll('[role="tab"]')][1].getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".calendar-an")).toBeNull();
    expect(host.querySelector('input[aria-label="Adresa serverului CalDAV"]')).not.toBeNull();
    const randuri = [...host.querySelectorAll(".sala-rand")];
    expect(randuri).toHaveLength(3);
    expect(randuri[0].querySelector(".sala-meta").textContent).toContain("1 eveniment · grand-or-ballroom");
    expect(randuri[1].querySelector(".sala-meta").textContent).toContain("2 evenimente · sera");
    /* Calendarul gri apare aici ca oricare altul, cu evenimentele lui. */
    expect(randuri[2].querySelector(".sala-nume").textContent).toBe("Anulate");
    expect(randuri[2].querySelector(".sala-meta").textContent).toContain("1 eveniment · anulate");
    expect(butonEticheta(host, "Importă .ics în Grand’Or Ballroom")).toBeDefined();
    expect(butonEticheta(host, "Importă .ics în Sera")).toBeDefined();
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
  });
});
