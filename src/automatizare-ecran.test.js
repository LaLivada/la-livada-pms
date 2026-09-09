/* Test de randare pentru ecranul de Automatizare — al treilea din repo, dupa
 * fise si grupuri (vezi fise-ecran.test.js pentru motivul general: aplicatia
 * cere autentificare, deci "a compilat" nu e dovada ca ecranul arata bine).
 *
 * Motivul PUNCTUAL: pe 9 septembrie 2026, pe telefon, eticheta care
 * avertizeaza ca un releu e comun celor doua camere aparea taiata la
 * jumatate — ecranul folosea `.list-row`, iar `.list-row .secondary` are
 * `white-space:nowrap; overflow:hidden`. Un avertisment trunchiat despre
 * ceva partajat e mai rau decat niciunul: se citeste ca si cum ar privi o
 * singura camera. Testele de aici fixeaza structura, nu stilul — dar
 * structura e cea care a permis stilului sa taie.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const cheamaDispozitiv = vi.fn(async () => ({ ok: true, actualizate: 4 }));

/* Se mockeaza doar functiile care ating reteaua; CAMERE_TEHNICE si CANALE
   raman cele reale, fiindca tocmai maparea canal->camera e ce merita
   verificat — o greseala acolo stinge priza vecinului. */
vi.mock("./data/dispozitive.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    toateDispozitivele: vi.fn(async () => DISPOZITIVE),
    cheamaDispozitiv,
  };
});

const { audit } = await import("./lib/audit.js");
const { AutomatizareView } = await import("./features/automatizare.jsx");

/* Toate cele 16 camere, ca in productie. Fixtura partiala ar fi ascuns ca
   ecranul cade pe id-ul brut ("r1005") cand o camera lipseste — comportament
   acceptabil, dar nu ce trebuie sa vada testul asta. */
const CORE = {
  rooms: [
    1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008,
    1009, 1010, 1011, 1012, 1013, 1014, 1101, 1102,
  ].map((n) => ({ id: `r${n}`, name: String(n), type: n > 1100 ? "loft" : "tiny" })),
};

/* Camera tehnica 1 (1013 + 1011), toate patru releele. Starile sunt
   deliberat diferite pe canale: exact regresia in care toate patru primeau
   starea canalului 0. */
const ID = "ac15186ca8cc";
const DISPOZITIVE = [
  { id: `dv-${ID}-0`, idShelly: ID, canal: 0, iesire: 1, kind: "iluminat_exterior",
    eticheta: "Iluminat exterior", nume: "Iluminat exterior", activ: true, model: "Shelly Pro 4PM",
    camereIds: ["r1013", "r1011"], camere: ["1011", "1013"], partajat: true,
    pornit: false, online: true, vazutLa: "2026-09-09T15:00:00Z" },
  { id: `dv-${ID}-1`, idShelly: ID, canal: 1, iesire: 2, kind: "boiler",
    eticheta: "Boiler", nume: "Boiler", activ: true, model: "Shelly Pro 4PM",
    camereIds: ["r1013", "r1011"], camere: ["1011", "1013"], partajat: true,
    pornit: true, online: true, vazutLa: "2026-09-09T15:00:00Z" },
  { id: `dv-${ID}-2`, idShelly: ID, canal: 2, iesire: 3, kind: "prize",
    eticheta: "Prize", nume: "Prize", activ: true, model: "Shelly Pro 4PM",
    camereIds: ["r1013"], camere: ["1013"], partajat: false,
    pornit: true, online: true, vazutLa: "2026-09-09T15:00:00Z" },
  { id: `dv-${ID}-3`, idShelly: ID, canal: 3, iesire: 4, kind: "prize",
    eticheta: "Prize", nume: "Prize", activ: true, model: "Shelly Pro 4PM",
    camereIds: ["r1011"], camere: ["1011"], partajat: false,
    pornit: false, online: false, vazutLa: "2026-09-09T15:00:00Z" },
  /* Contorul general. Nu apartine niciunei camere tehnice — `camereIds` gol
     e tocmai ce il tine afara din gruparea pe perechi. */
  { id: "dv-441d647468c8-0", idShelly: "441d647468c8", canal: 0, iesire: 1,
    kind: "contor", eticheta: "Contor general", nume: "Contor general",
    activ: true, model: "Shelly Pro 3EM",
    camereIds: [], camere: [], partajat: false,
    pornit: false, online: true, vazutLa: "2026-09-09T15:00:00Z",
    consum: {
      totalKw: 2.4314, totalA: 10.57,
      faze: [
        { nume: "R", kw: 0.8124, a: 3.54, v: 231.2 },
        { nume: "S", kw: 0.9031, a: 3.91, v: 230.8 },
        { nume: "T", kw: 0.7159, a: 3.12, v: 232.0 },
      ],
    } },
];

async function randeaza() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(React.createElement(AutomatizareView, { core: CORE }));
  });
  return host;
}

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  cheamaDispozitiv.mockClear();
});

describe("AutomatizareView — structura pe camere tehnice", () => {
  it("are cate un tab pentru fiecare din cele sapte camere tehnice", async () => {
    const g = await randeaza();
    const taburi = [...g.querySelectorAll('.dv-tabs [role="tab"]')];
    expect(taburi.map((t) => t.textContent)).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7"]);
    // Numarul singur n-ar spune ce camere sunt dedesubt.
    expect(taburi[0].getAttribute("title")).toContain("camerele 1013 și 1011");
    expect(taburi[6].getAttribute("title")).toContain("camerele 1002 și 1001");
  });

  it("arata o singura camera tehnica odata — cea din tabul activ", async () => {
    const g = await randeaza();
    const panouri = [...g.querySelectorAll(".panel")]
      .filter((p) => p.textContent.includes("Camera tehnică"));
    expect(panouri.length).toBe(1);
    expect(panouri[0].textContent).toContain("Camera tehnică 1");
    expect(g.querySelector('[role="tab"]').getAttribute("aria-selected")).toBe("true");
  });

  it("schimba panoul cand se apasa alt tab", async () => {
    const g = await randeaza();
    const tab3 = [...g.querySelectorAll('.dv-tabs [role="tab"]')][2];
    await act(async () => { tab3.click(); });
    const panou = [...g.querySelectorAll(".panel")]
      .find((p) => p.textContent.includes("Camera tehnică"));
    expect(panou.textContent).toContain("Camera tehnică 3");
    expect(panou.textContent).toContain("camerele 1005 și 1003");
    expect(g.textContent).not.toContain("Camera tehnică 1 ");
  });

  it("numeste cele patru relee in ordinea de pe dispozitiv", async () => {
    const g = await randeaza();
    const titluri = [...g.querySelectorAll(".dv-title")].map((n) => n.textContent.trim());
    expect(titluri).toContain("Releu 1 · Iluminat exterior");
    expect(titluri).toContain("Releu 2 · Boiler");
    expect(titluri.filter((t) => t === "Releu 3 · Prize").length).toBeGreaterThan(0);
    expect(titluri.filter((t) => t === "Releu 4 · Prize").length).toBeGreaterThan(0);
  });
});

describe("AutomatizareView — consumul general", () => {
  it("arata totalul si cele trei faze, deasupra camerelor tehnice", async () => {
    const g = await randeaza();
    const rand = g.querySelector(".dv-consum");
    expect(rand.textContent).toContain("Consum curent");
    expect(rand.textContent).toContain("2,43 kW");
    expect(rand.textContent).toContain("10,6 A");
    const faze = [...rand.querySelectorAll(".dv-faza")].map((f) => f.textContent);
    expect(faze.length).toBe(3);
    expect(faze[0]).toContain("R");
    expect(faze[0]).toContain("0,81 kW");
    expect(faze[1]).toContain("S");
    expect(faze[2]).toContain("T");
  });

  it("sta INAINTEA numerelor de camere tehnice", async () => {
    const g = await randeaza();
    const consum = g.querySelector(".dv-consum");
    const taburi = g.querySelector(".dv-tabs");
    // compareDocumentPosition: 4 = following
    expect(consum.compareDocumentPosition(taburi) & 4).toBeTruthy();
  });

  /* Contorul e in acelasi tabel ca releele, deci trebuie tinut explicit
     afara din camerele tehnice — altfel ar aparea ca un al cincilea releu
     fara camera, cu un buton de pornit care n-are ce comanda. */
  it("nu apare printre releele vreunei camere tehnice", async () => {
    const g = await randeaza();
    const panou = [...g.querySelectorAll(".panel")]
      .find((p) => p.textContent.includes("Camera tehnică"));
    expect(panou.querySelectorAll(".dv-row").length).toBe(4);
    expect(panou.textContent).not.toContain("Contor");
  });
});

describe("AutomatizareView — cele doua sectiuni", () => {
  it("porneste pe „Camere tehnice”, cu „Automatizări” ca a doua sectiune", async () => {
    const g = await randeaza();
    const sectiuni = [...g.querySelectorAll('.sub-tabs:not(.dv-tabs) [role="tab"]')];
    expect(sectiuni.map((t) => t.textContent.trim())).toEqual(["Camere tehnice", "Automatizări"]);
    expect(sectiuni[0].getAttribute("aria-selected")).toBe("true");
  });

  /* Sectiunea de automatizari nu are inca nicio regula. Ecranul trebuie sa
     spuna asta deschis: o lista goala nu lasa pe nimeni sa distinga o
     functie neterminata de „n-a configurat inca nimeni nimic". */
  it("spune deschis ca nu exista automatizari, si unde se comanda manual", async () => {
    const g = await randeaza();
    const sectiuni = [...g.querySelectorAll('.sub-tabs:not(.dv-tabs) [role="tab"]')];
    await act(async () => { sectiuni[1].click(); });
    expect(g.textContent).toContain("Nicio automatizare");
    expect(g.textContent).toContain("Camere tehnice");
    // Panoul de camere tehnice dispare cat timp esti in cealalta sectiune.
    expect(g.querySelectorAll(".dv-row").length).toBe(0);
  });
});

describe("AutomatizareView — ce releu serveste ce camere", () => {
  /* Partajarea nu mai are eticheta proprie: se citeste din cate camere sunt
     scrise sub releu. De-aia testul de mai jos e singurul lucru care mai
     apara distinctia „boilerul e comun / prizele nu" — daca pica, ecranul
     nu mai spune nicaieri ca oprind boilerul lui 1013 ramane fara si 1011. */
  it("scrie amandoua camerele la un releu comun, si una singura la prize", async () => {
    const g = await randeaza();
    const ct1 = [...g.querySelectorAll(".panel")]
      .find((p) => p.textContent.includes("Camera tehnică 1"));
    const subs = [...ct1.querySelectorAll(".dv-row .dv-sub")].map((n) => n.textContent);
    expect(subs[0]).toContain("1013 și 1011");   // iluminat, comun
    expect(subs[1]).toContain("1013 și 1011");   // boiler, comun
    expect(subs[2]).toContain("1013");           // prize camera 1
    expect(subs[2]).not.toContain("1011");
    expect(subs[3]).toContain("1011");           // prize camera 2
  });

  it("nu foloseste .list-row, unde .secondary taie textul cu overflow:hidden", async () => {
    const g = await randeaza();
    // Regresia de pe telefon: eticheta „comun" ajungea intr-un `.secondary`
    // cu white-space:nowrap si era retezata la marginea ecranului.
    expect(g.querySelectorAll(".dv-row").length).toBeGreaterThan(0);
    expect(g.querySelectorAll(".list-row").length).toBe(0);
  });
});

describe("AutomatizareView — starea, in culoarea iconului", () => {
  it("coloreaza iconul fiecarui releu dupa starea LUI, nu dupa a primului", async () => {
    const g = await randeaza();
    const ct1 = [...g.querySelectorAll(".panel")]
      .find((p) => p.textContent.includes("Camera tehnică 1"));
    const icoane = [...ct1.querySelectorAll(".dv-icon")];
    expect(icoane.length).toBe(4);
    expect(icoane[0].className).toContain("dv-icon-off");      // iluminat oprit
    expect(icoane[1].className).toContain("dv-icon-on");       // boiler pornit
    expect(icoane[2].className).toContain("dv-icon-on");       // prize 1013
    expect(icoane[3].className).toContain("dv-icon-offline");  // prize 1011, offline
  });

  it("nu mai exista un indicator separat de stare — o poarta iconul", async () => {
    const g = await randeaza();
    expect(g.querySelectorAll(".dv-led").length).toBe(0);
  });

  it("da iconului o eticheta in text, nu doar culoare", async () => {
    const g = await randeaza();
    /* Punctul din tab e `aria-hidden` deliberat: tabul isi are deja eticheta
       lui, iar un al doilea anunt ar fi zgomot pentru cine asculta ecranul. */
    const icoane = [...g.querySelectorAll(".dv-row .dv-icon")];
    expect(icoane.length).toBe(4);
    expect(icoane.every((b) => b.getAttribute("aria-label"))).toBe(true);
    expect(icoane.map((b) => b.getAttribute("aria-label"))).toContain("Pornit");
    expect(icoane.map((b) => b.getAttribute("aria-label"))).toContain("Oprit");
    expect(icoane.map((b) => b.getAttribute("aria-label"))).toContain("Offline");
  });

  it("butonul spune actiunea, nu starea", async () => {
    const g = await randeaza();
    const ct1 = [...g.querySelectorAll(".panel")]
      .find((p) => p.textContent.includes("Camera tehnică 1"));
    const butoane = [...ct1.querySelectorAll(".dv-ctrl .btn")].map((b) => b.textContent);
    expect(butoane[0]).toBe("Pornește");  // iluminat oprit -> se poate porni
    expect(butoane[1]).toBe("Oprește");   // boiler pornit  -> se poate opri
  });
});

describe("AutomatizareView — camerele tehnice fara Shelly", () => {
  it("cere adminului sa adauge dispozitivul, in loc sa arate relee goale", async () => {
    const g = await randeaza();
    await act(async () => { [...g.querySelectorAll('.dv-tabs [role="tab"]')][1].click(); });
    const ct2 = [...g.querySelectorAll(".panel")]
      .find((p) => p.textContent.includes("Camera tehnică 2"));
    expect(ct2.textContent).toContain("Niciun Shelly înregistrat");
    expect(ct2.textContent).toContain("Adaugă Shelly");
    expect(ct2.querySelectorAll(".dv-row").length).toBe(0);
  });

  /* Tabul unei camere tehnice fara Shelly poarta un bec stins, altfel
     adminul ar trebui sa le deschida pe toate sapte ca sa afle care mai
     asteapta configurare. */
  it("marcheaza in tab camerele tehnice inca neconfigurate", async () => {
    const g = await randeaza();
    const taburi = [...g.querySelectorAll('.dv-tabs [role="tab"]')];
    expect(taburi[0].querySelector(".dv-punct")).toBeNull();       // #1 are Shelly
    expect(taburi[1].querySelector(".dv-punct")).not.toBeNull();   // #2 nu are
  });

  it("nu-i arata cameristei butonul de adaugare", async () => {
    audit.user = { name: "Test", role: "housekeeping" };
    const g = await randeaza();
    await act(async () => { [...g.querySelectorAll('.dv-tabs [role="tab"]')][1].click(); });
    expect(g.textContent).not.toContain("Adaugă Shelly");
  });
});
