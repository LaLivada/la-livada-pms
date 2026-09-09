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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const cheamaDispozitiv = vi.fn(async () => ({ ok: true, actualizate: 4 }));
const comutaRegula = vi.fn(async () => {});

/* Rescrise de fiecare test care are nevoie de altceva — vezi beforeEach. */
let ISTORIC = { total: 8914.2, kwh30: 412.7, deLa: "2026-08-11T00:00:00Z", complet: true };
let RULARE = {
  at: "2026-09-10T00:00:00Z", ok: true, verificate: 14, schimbate: 0, erori: null, tace: false,
};

/* Una oprita din trei, deliberat: asa acelasi ecran arata si „Activ" si
   „Oprit", si amandoua etichetele de buton. */
const REGULI = [
  { key: "preincalzire_boiler", titlu: "Preîncălzire boiler", descriere: "Cu 4 ore înainte.", activ: true },
  { key: "lumini_exterioare", titlu: "Lumini exterioare după soare", descriere: "De la apus la răsărit.", activ: true },
  { key: "anti_legionella", titlu: "Anti-legionella", descriere: "O dată la 10 zile.", activ: false },
];

/* Se mockeaza doar functiile care ating reteaua; CAMERE_TEHNICE si CANALE
   raman cele reale, fiindca tocmai maparea canal->camera e ce merita
   verificat — o greseala acolo stinge priza vecinului. */
vi.mock("./data/dispozitive.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    toateDispozitivele: vi.fn(async () => DISPOZITIVE),
    cheamaDispozitiv,
    reguliAutomate: vi.fn(async () => REGULI),
    comutaRegula,
    consumIstoric: vi.fn(async () => ISTORIC),
    ultimaRulareAutomatizari: vi.fn(async () => RULARE),
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

/* Tot ce s-a montat, ca sa poata fi demontat dupa fiecare test. Vezi
   `afterEach` — nu e curatenie de forma. */
const montate = [];

async function randeaza() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(AutomatizareView, { core: CORE }));
  });
  return host;
}

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  /* mockReset, nu mockClear: testele de mai jos schimba ce intoarce apelul,
     iar un `mockResolvedValue` ramas de la testul anterior s-ar scurge in
     urmatorul. */
  cheamaDispozitiv.mockReset();
  cheamaDispozitiv.mockResolvedValue({ ok: true, actualizate: 4 });
  /* Fixturile mutabile se readuc la valoarea implicita, ca un test care le
     schimba (ciclu tacut, istoric incomplet) sa nu se scurga in urmatorul. */
  ISTORIC = { total: 8914.2, kwh30: 412.7, deLa: "2026-08-11T00:00:00Z", complet: true };
  RULARE = {
    at: "2026-09-10T00:00:00Z", ok: true, verificate: 14, schimbate: 0, erori: null, tace: false,
  };
});

afterEach(async () => {
  /* Demontarea NU e optionala aici. Ecranul citeste contorul cu un
     `setTimeout` care se reprogrameaza singur; o componenta ramasa montata
     de la un test anterior continua sa bata si dupa ce testul ei s-a
     terminat. Testul care numara apeluri ar numara atunci si bataile ei —
     exact ce s-a intamplat prima data cand am scris testele astea: treceau
     rulate singure si picau in suita intreaga. */
  await act(async () => { montate.forEach((m) => m.root.unmount()); });
  montate.forEach((m) => m.host.remove());
  montate.length = 0;
  vi.useRealTimers();
});

/* Trebuie sa ramana egal cu RITM_MS din automatizare.jsx. Daca cineva
   schimba unul si uita celalalt, testele de mai jos pica pe loc — ceea ce e
   exact reactia dorita. */
const RITM = 10000;

const RASPUNS_CONTOR = (kw) => ({
  ok: true,
  device: {
    id: "dv-441d647468c8-0",
    lastSeenAt: "2026-09-09T16:00:00Z",
    status: {
      online: true,
      consum: { totalKw: kw, totalA: 20.4, faze: [
        { nume: "R", kw: kw / 3, a: 6.8, v: 231 },
        { nume: "S", kw: kw / 3, a: 6.8, v: 231 },
        { nume: "T", kw: kw / 3, a: 6.8, v: 231 },
      ] },
    },
  },
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

describe("AutomatizareView — consumul se reciteste singur", () => {
  it("cere DOAR contorul, nu toate dispozitivele", async () => {
    vi.useFakeTimers();
    cheamaDispozitiv.mockResolvedValue(RASPUNS_CONTOR(6.6));
    const g = await randeaza();
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });

    expect(cheamaDispozitiv).toHaveBeenCalledWith("refresh", { deviceId: "dv-441d647468c8-0" });
    // Un refresh general ar fi insemnat sapte apeluri Shelly la fiecare
    // bataie, in loc de unul.
    expect(cheamaDispozitiv.mock.calls.every((c) => c[1]?.deviceId)).toBe(true);
    expect(g.querySelector(".dv-consum").textContent).toContain("6,60 kW");
  });

  it("continua sa citeasca, cu cifra care se schimba", async () => {
    vi.useFakeTimers();
    cheamaDispozitiv.mockResolvedValueOnce(RASPUNS_CONTOR(1.5))
                    .mockResolvedValueOnce(RASPUNS_CONTOR(9.9));
    const g = await randeaza();
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });
    expect(g.querySelector(".dv-consum").textContent).toContain("1,50 kW");
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });
    expect(g.querySelector(".dv-consum").textContent).toContain("9,90 kW");
  });

  /* Cea mai scumpa greseala posibila aici: sa citeasca in continuare dintr-o
     sectiune care nici macar nu arata cifra. */
  it("nu citeste nimic cat timp esti in sectiunea Automatizări", async () => {
    vi.useFakeTimers();
    cheamaDispozitiv.mockResolvedValue(RASPUNS_CONTOR(3.3));
    const g = await randeaza();
    const sectiuni = [...g.querySelectorAll('.sub-tabs:not(.dv-tabs) [role="tab"]')];
    await act(async () => { sectiuni[1].click(); });
    cheamaDispozitiv.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM * 4); });
    expect(cheamaDispozitiv).not.toHaveBeenCalled();
  });

  it("rareste cand Shelly nu raspunde, in loc sa insiste", async () => {
    vi.useFakeTimers();
    cheamaDispozitiv.mockResolvedValue({ ok: false, error: "Shelly Cloud n-a răspuns." });
    const g = await randeaza();

    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });
    expect(cheamaDispozitiv).toHaveBeenCalledTimes(1);
    // Dupa primul esec pauza se dubleaza, deci la +1 ritm inca nu vine al doilea.
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });
    expect(cheamaDispozitiv).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });
    expect(cheamaDispozitiv).toHaveBeenCalledTimes(2);
    expect(g.querySelector(".dv-live")).toBeNull();
  });

  /* Un ecran uitat deschis peste noapte ar consuma singur toata cota lunara
     de apeluri a planului. */
  it("se opreste dupa 30 de minute si cere o apasare ca sa continue", async () => {
    vi.useFakeTimers();
    cheamaDispozitiv.mockResolvedValue(RASPUNS_CONTOR(2.2));
    const g = await randeaza();
    await act(async () => { await vi.advanceTimersByTimeAsync(31 * 60 * 1000); });

    expect(g.querySelector(".dv-consum").textContent).toContain("actualizarea automată s-a oprit");
    const inainte = cheamaDispozitiv.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM * 6); });
    expect(cheamaDispozitiv).toHaveBeenCalledTimes(inainte);

    // ...si reporneste la cerere.
    await act(async () => { g.querySelector(".dv-reia").click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(RITM); });
    expect(cheamaDispozitiv.mock.calls.length).toBeGreaterThan(inainte);
  });
});

describe("AutomatizareView — cele doua sectiuni", () => {
  it("porneste pe „Camere tehnice”, cu „Automatizări” ca a doua sectiune", async () => {
    const g = await randeaza();
    const sectiuni = [...g.querySelectorAll('.sub-tabs:not(.dv-tabs) [role="tab"]')];
    expect(sectiuni.map((t) => t.textContent.trim())).toEqual(["Camere tehnice", "Automatizări"]);
    expect(sectiuni[0].getAttribute("aria-selected")).toBe("true");
  });

  /* Regulile ruleaza server-side (pg_cron -> device-provider); din ecran se
     schimba doar steagul lor. */
  it("listeaza cele trei reguli", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);
    expect(g.textContent).toContain("Preîncălzire boiler");
    expect(g.textContent).toContain("Lumini exterioare după soare");
    expect(g.textContent).toContain("Anti-legionella");
    // Panoul de camere tehnice dispare cat timp esti in cealalta sectiune.
    expect(g.textContent).not.toContain("Camera tehnică 1");
  });
});

const randRegula = (g, titlu) => [...g.querySelectorAll(".dv-row")]
  .find((r) => r.querySelector(".dv-regula-cap")?.textContent.includes(titlu));

describe("AutomatizareView — pornit/oprit per regula", () => {
  it("arata starea si butonul pe acelasi rand cu numele regulii", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);

    /* Amandoua trebuie sa fie in CAPUL randului, langa nume — nu oriunde in
       rand. Daca ar cadea sub descriere, testul asta pica. */
    const cap = randRegula(g, "Preîncălzire boiler").querySelector(".dv-regula-cap");
    expect(cap.querySelector(".dv-stare").textContent).toBe("Activ");
    expect(cap.querySelector("button").textContent).toBe("Oprește");
  });

  it("o regula oprita arata Oprit si butonul de pornire", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);

    const cap = randRegula(g, "Anti-legionella").querySelector(".dv-regula-cap");
    expect(cap.querySelector(".dv-stare").textContent).toBe("Oprit");
    expect(cap.querySelector("button").textContent).toBe("Pornește");
  });

  it("apasarea comuta exact regula aia, nu alta", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);
    comutaRegula.mockClear();

    const buton = randRegula(g, "Lumini exterioare după soare").querySelector(".dv-regula-cap button");
    await act(async () => { buton.click(); });

    expect(comutaRegula).toHaveBeenCalledTimes(1);
    expect(comutaRegula).toHaveBeenCalledWith("lumini_exterioare", false);
  });

  /* Comutarea unei reguli NU trece prin `device-provider`: schimba un steag in
     baza, iar ciclul server-side il citeste la urmatoarea rulare. Daca ar
     ajunge sa cheme functia edge, ar insemna ca cineva a legat butonul de o
     comanda de releu. */
  it("nu trimite nicio comanda catre relee cand opresti o regula", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);
    cheamaDispozitiv.mockClear();

    await act(async () => {
      randRegula(g, "Preîncălzire boiler").querySelector(".dv-regula-cap button").click();
    });

    expect(cheamaDispozitiv).not.toHaveBeenCalled();
  });

  it("camerista nu poate opri o automatizare", async () => {
    audit.user = { name: "Test", role: "housekeeping" };
    const g = await randeaza();
    await treciLaAutomatizari(g);

    const buton = randRegula(g, "Anti-legionella").querySelector(".dv-regula-cap button");
    expect(buton.disabled).toBe(true);
  });
});

/* Ciclul comanda relee SINGUR, la 10 minute. Testele astea apara singurul
   lucru care face o cadere vizibila — daca pica, sistemul redevine mut. */
describe("AutomatizareView — starea ciclului automat", () => {
  it("arata ultima rulare cand totul merge", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);

    const ciclu = g.querySelector(".dv-ciclu");
    expect(ciclu.textContent).toContain("14 verificate");
    expect(ciclu.classList.contains("dv-ciclu-tace")).toBe(false);
  });

  it("avertizeaza vizibil cand ciclul tace", async () => {
    RULARE = { ...RULARE, tace: true };
    const g = await randeaza();
    await treciLaAutomatizari(g);

    const ciclu = g.querySelector(".dv-ciclu");
    expect(ciclu.classList.contains("dv-ciclu-tace")).toBe(true);
    expect(ciclu.textContent).toContain("n-a mai rulat");
  });

  it("avertizeaza si cand a rulat, dar un releu n-a raspuns", async () => {
    RULARE = { ...RULARE, ok: false, erori: "Boiler: Dispozitivul e offline." };
    const g = await randeaza();
    await treciLaAutomatizari(g);

    const ciclu = g.querySelector(".dv-ciclu");
    expect(ciclu.classList.contains("dv-ciclu-tace")).toBe(true);
    // Eroarea concreta, nu un „ceva n-a mers" din care nu stii ce sa verifici.
    expect(ciclu.textContent).toContain("Dispozitivul e offline");
  });

  it("spune deschis cand n-a rulat niciodata", async () => {
    RULARE = null;
    const g = await randeaza();
    await treciLaAutomatizari(g);

    expect(g.querySelector(".dv-ciclu").textContent).toContain("niciodată");
  });
});

describe("AutomatizareView — consumul cumulat din card", () => {
  it("arata consumul pe 30 de zile si totalul de pe contor", async () => {
    const g = await randeaza();
    const jos = g.querySelector(".dv-consum-jos");
    expect(jos.textContent).toContain("Ultimele 30 de zile");
    expect(jos.textContent).toContain("412,7 kWh");
    expect(jos.textContent).toContain("8.914,2 kWh");
  });

  /* Cat timp n-avem 30 de zile de istoric, cifra e reala dar acopera mai
     putin. Eticheta trebuie sa spuna asta — altfel primele zile dupa
     pornire ar arata un consum lunar fals de mic, fara niciun indiciu. */
  it("spune de cand sunt datele cat timp istoricul e mai scurt de 30 de zile", async () => {
    ISTORIC = { total: 8914.2, kwh30: 12.3, deLa: "2026-09-08T00:00:00Z", complet: false };
    const g = await randeaza();

    const jos = g.querySelector(".dv-consum-jos");
    expect(jos.textContent).not.toContain("Ultimele 30 de zile");
    expect(jos.textContent).toContain("Din ");
  });

  it("arata liniuta, nu zero, cand contorul n-a fost citit inca", async () => {
    ISTORIC = { total: null, kwh30: null, deLa: null, complet: false };
    const g = await randeaza();

    const jos = g.querySelector(".dv-consum-jos");
    expect(jos.textContent).toContain("—");
    expect(jos.textContent).not.toContain("0,0 kWh");
  });
});

async function treciLaAutomatizari(g) {
  const sectiuni = [...g.querySelectorAll('.sub-tabs:not(.dv-tabs) [role="tab"]')];
  await act(async () => { sectiuni[1].click(); });
}

/* Cautare fara majuscule: titlurile randurilor incep cu litera mare
   („Boilere"), dar testele de mai jos le numesc cum le zice omul. */
const randGrup = (g, text) => [...g.querySelectorAll(".dv-row")]
  .find((r) => r.textContent.toLowerCase().includes(text.toLowerCase()));

describe("AutomatizareView — comanda manuala pe grup", () => {
  it("are cate un rand pentru lumini si unul pentru boilere, cu un singur buton", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);

    for (const titlu of ["Lumini exterioare", "Boilere"]) {
      const rand = randGrup(g, titlu);
      expect(rand).toBeTruthy();
      expect(rand.querySelectorAll(".dv-ctrl .btn").length).toBe(1);
    }
  });

  /* „Control manual" e scris o singura data, ca titlu deasupra ambelor
     randuri — nu repetat in fiecare dintre ele. Testul numara aparitiile:
     daca ajung doua, textul s-a intors in titlurile randurilor. */
  it("scrie Control manual o singura data, deasupra celor doua randuri", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);

    expect(g.textContent.match(/Control manual/g)).toHaveLength(1);
    for (const titlu of ["Lumini exterioare", "Boilere"]) {
      expect(randGrup(g, titlu).textContent).not.toContain("Control manual");
    }
  });

  /* Regula aleasa pentru un grup amestecat: daca MACAR UNUL e aprins,
     butonul stinge. Fixtura are iluminatul oprit si boilerul pornit, deci
     cele doua randuri arata etichete diferite in acelasi ecran. */
  it("butonul arata actiunea, nu starea: stinge daca macar unul e aprins", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);
    expect(randGrup(g, "lumini exterioare").querySelector(".dv-ctrl .btn").textContent)
      .toBe("Pornește");   // 0 din 1 aprinse
    expect(randGrup(g, "boilere").querySelector(".dv-ctrl .btn").textContent)
      .toBe("Oprește");    // 1 din 1 aprinse
  });

  it("numara cate relee din grup sunt pornite", async () => {
    const g = await randeaza();
    await treciLaAutomatizari(g);
    // Fixtura: iluminatul e oprit, boilerul e pornit.
    expect(randGrup(g, "lumini exterioare").textContent).toContain("0 din 1");
    expect(randGrup(g, "boilere").textContent).toContain("1 din 1");
  });

  /* Miezul: UN SINGUR apel pentru tot grupul. Sapte comenzi plecate deodata
     din browser ar lovi garantat limita de ritm a Shelly — exact eroarea de
     pe 9 septembrie. Distantarea o face functia edge, secvential. */
  it("trimite o singura cerere pe grup, nu cate una per releu", async () => {
    cheamaDispozitiv.mockResolvedValue({ ok: true, reusite: 7, total: 7, esuate: [] });
    const g = await randeaza();
    await treciLaAutomatizari(g);
    cheamaDispozitiv.mockClear();

    // Boilerul e pornit in fixtura, deci butonul lui stinge.
    const rand = randGrup(g, "boilere");
    await act(async () => { rand.querySelector(".dv-ctrl .btn").click(); });

    expect(cheamaDispozitiv).toHaveBeenCalledTimes(1);
    expect(cheamaDispozitiv).toHaveBeenCalledWith("off", { kind: "boiler" });
  });

  it("porneste grupul cand nu e aprins niciunul", async () => {
    cheamaDispozitiv.mockResolvedValue({ ok: true, reusite: 7, total: 7, esuate: [] });
    const g = await randeaza();
    await treciLaAutomatizari(g);
    cheamaDispozitiv.mockClear();

    const rand = randGrup(g, "lumini exterioare");
    await act(async () => { rand.querySelector(".dv-ctrl .btn").click(); });

    expect(cheamaDispozitiv).toHaveBeenCalledWith("on", { kind: "iluminat_exterior" });
  });

  it("nu raporteaza succes cand doar o parte au raspuns", async () => {
    /* O reusita partiala raportata drept „gata" ar lasa pe cineva sa plece
       convins ca toate boilerele sunt pornite. */
    cheamaDispozitiv.mockResolvedValue({
      ok: false, reusite: 5, total: 7,
      esuate: [{ camere: "1003, 1005", motiv: "offline" }],
      error: "2 din 7 n-au răspuns: 1003, 1005.",
    });
    const { toaster } = await import("./ui/primitive.jsx");
    const spion = vi.spyOn(toaster, "show");

    const g = await randeaza();
    await treciLaAutomatizari(g);
    const rand = randGrup(g, "boilere");
    await act(async () => { rand.querySelector(".dv-ctrl .btn").click(); });

    expect(spion).toHaveBeenCalledWith(expect.stringContaining("n-au răspuns"), { tone: "danger" });
    spion.mockRestore();
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
