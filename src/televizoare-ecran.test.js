/* Test de randare pentru ecranul „Televizoare”.
 *
 * Motivul punctual, si singurul care justifica un test de ecran aici: ce
 * scrie pe televizorul din camera e un text cu RANDURI, iar ecranul e locul
 * din care receptia verifica ce vede oaspetele. Un mesaj strans intr-o
 * singura linie, sau un buton „Trimite” activ pe o camera fara nimeni cazat,
 * ar trece de orice test unitar si ar fi gresit exact acolo unde conteaza.
 *
 * Reteaua e mocata in intregime (data/televizoare.js); logica pura ramane cea
 * reala — previzualizarea mesajului trebuie sa treaca prin lib/tv.js, nu
 * printr-o fixtura.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const cheamaTv = vi.fn(async () => ({ ok: true, trimise: 1, camera: "1003" }));
const mapeazaCamera = vi.fn(async () => {});
const comutaActiv = vi.fn(async () => {});
const stergeTelevizor = vi.fn(async () => {});
const salveazaSetariTv = vi.fn(async () => {});

/* Rescrise de testele care au nevoie de altceva — vezi beforeEach. */
let TELEVIZOARE = [];
let SETARI = {};

vi.mock("./data/televizoare.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    toateTelevizoarele: vi.fn(async () => TELEVIZOARE),
    setariTv: vi.fn(async () => SETARI),
    mesajeRecente: vi.fn(async () => []),
    mapeazaCamera, comutaActiv, stergeTelevizor, salveazaSetariTv, cheamaTv,
  };
});

const { audit } = await import("./lib/audit.js");
const { normalizeazaSetari } = await import("./lib/tv.js");
const { TelevizoareView } = await import("./features/televizoare.jsx");

const CORE = {
  rooms: [1001, 1003, 1005].map((n) => ({ id: `r${n}`, name: String(n), type: "tiny" })),
  guests: [{ id: "g1", firstName: "Ana", lastName: "Pop", country: "România" }],
};

const REZERVARI = [{
  id: "res-1", roomId: "r1003", guestId: "g1", status: "checkedin",
  checkin: "2026-09-18T14:00:00+03:00", checkout: "2026-09-21T11:00:00+03:00",
}];

const TV_1003 = {
  id: "tv-sim-tv-1003", idLynk: "sim-tv-1003", furnizor: "simulare", simulat: true,
  nume: "SIMULARE TV 1003", model: "SIMULARE", activ: true,
  cameraId: "r1003", camera: "1003", online: true, sugestieCamera: "1003",
  mesaj: "Bun venit, Ana Pop!\nCamera 1003", mesajLa: "2026-09-18T15:00:00Z",
  rezervareId: "res-1", vazutLa: "2026-09-18T15:00:00Z",
};

/* Un aparat adus de sincronizare, dar nelegat inca de nicio camera: starea in
   care se nasc toate. */
const TV_NEMAPAT = {
  ...TV_1003, id: "tv-sim-tv-1005", idLynk: "sim-tv-1005", nume: "SIMULARE TV 1005",
  cameraId: null, camera: null, mesaj: null, mesajLa: null, rezervareId: null,
};

const montate = [];

async function randeaza(rezervari = REZERVARI) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => {
    root.render(React.createElement(TelevizoareView, { core: CORE, reservations: rezervari }));
  });
  return host;
}

const tab = (host, text) =>
  [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes(text));

const apasa = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};

beforeEach(() => {
  audit.user = { name: "Test", role: "admin" };
  cheamaTv.mockClear();
  salveazaSetariTv.mockClear();
  TELEVIZOARE = [TV_1003, TV_NEMAPAT];
  SETARI = normalizeazaSetari({});
});

afterEach(async () => {
  await act(async () => { montate.forEach((m) => m.root.unmount()); });
  montate.forEach((m) => m.host.remove());
  montate.length = 0;
});

describe("TelevizoareView — camerele", () => {
  it("arata mesajul cu randurile lui, nu strans pe o linie", async () => {
    const g = await randeaza();
    const ecran = g.querySelector(".tv-ecran");
    expect(ecran.textContent).toContain("Bun venit, Ana Pop!");
    /* Randul al doilea trebuie sa ramana rand: `pre` + white-space:pre-wrap.
       Un `div` cu textul lipit ar fi ascuns un rand lipsa din mesaj. */
    expect(ecran.textContent).toContain("\nCamera 1003");
    expect(ecran.tagName).toBe("PRE");
  });

  it("arata doar camerele cu televizor mapat", async () => {
    const g = await randeaza();
    const titluri = [...g.querySelectorAll(".dv-row .dv-title")].map((t) => t.textContent);
    expect(titluri.some((t) => t.includes("1003"))).toBe(true);
    expect(titluri.some((t) => t.includes("1001"))).toBe(false);
    expect(titluri.some((t) => t.includes("1005"))).toBe(false);
  });

  it("„Trimite” merge cand camera e cazata si cere mesajul pentru rezervarea ei", async () => {
    const g = await randeaza();
    const buton = [...g.querySelectorAll(".dv-ctrl .btn")].find((b) => b.textContent.includes("Trimite"));
    expect(buton.disabled).toBe(false);
    await apasa(buton);
    expect(cheamaTv).toHaveBeenCalledWith("welcome", { reservationId: "res-1" });
  });

  it("„Trimite” e blocat cand nu e nimeni cazat in camera", async () => {
    // Fara cazare in curs, mesajul n-ar avea al cui nume sa poarte.
    const g = await randeaza([{ ...REZERVARI[0], status: "checkedout" }]);
    const buton = [...g.querySelectorAll(".dv-ctrl .btn")].find((b) => b.textContent.includes("Trimite"));
    expect(buton.disabled).toBe(true);
  });

  it("„Șterge” goleste ecranul camerei, pe camera, nu pe rezervare", async () => {
    const g = await randeaza();
    const buton = [...g.querySelectorAll(".dv-ctrl .btn")].find((b) => b.textContent.includes("Șterge"));
    await apasa(buton);
    expect(cheamaTv).toHaveBeenCalledWith("clear", { roomId: "r1003" });
  });

  it("fara niciun televizor mapat, spune ce e de facut", async () => {
    TELEVIZOARE = [TV_NEMAPAT];
    const g = await randeaza();
    expect(g.querySelector(".empty-state").textContent).toContain("Aparate");
  });
});

describe("TelevizoareView — avertismentul de simulare", () => {
  it("spune la vedere ca mesajele nu ajung pe televizoare reale", async () => {
    const g = await randeaza();
    expect(g.querySelector(".tv-avertisment").textContent).toContain("simulare");
  });

  it("dispare cand furnizorul e cel real", async () => {
    SETARI = normalizeazaSetari({ provider: "lynk" });
    TELEVIZOARE = [{ ...TV_1003, furnizor: "lynk", simulat: false }];
    const g = await randeaza();
    expect(g.querySelector(".tv-avertisment")).toBe(null);
  });

  it("spune cand raman aparate de la furnizorul vechi, dupa comutare", async () => {
    // Prima comutare simulare -> LYNK: randurile vechi raman in tabel, dar
    // functia edge nu le atinge. Fara avertisment, camera ar arata televizor
    // in lista si ar raspunde „n-are televizor mapat” la apasare.
    SETARI = normalizeazaSetari({ provider: "lynk" });
    const g = await randeaza();
    expect(g.querySelector(".tv-avertisment").textContent).toContain("alt furnizor");
  });

  it("integrarea oprita se vede si ea, oricare ar fi furnizorul", async () => {
    SETARI = normalizeazaSetari({ provider: "lynk", activ: false });
    TELEVIZOARE = [{ ...TV_1003, furnizor: "lynk", simulat: false }];
    const g = await randeaza();
    expect(g.querySelector(".tv-avertisment").textContent).toContain("oprită");
  });
});

describe("TelevizoareView — aparatele", () => {
  it("numara aparatele fara cameră, fiindca alea nu primesc nimic", async () => {
    const g = await randeaza();
    await apasa(tab(g, "Aparate"));
    expect(g.querySelector(".note").textContent).toContain("1 televizoare fără cameră");
  });

  it("sincronizarea cere lista din contul LYNK", async () => {
    const g = await randeaza();
    await apasa(tab(g, "Aparate"));
    const buton = [...g.querySelectorAll(".btn")].find((b) => b.textContent.includes("Sincronizează"));
    await apasa(buton);
    expect(cheamaTv).toHaveBeenCalledWith("sync-tvs", {});
  });
});

describe("TelevizoareView — mesajul", () => {
  it("previzualizeaza cu datele cazarii in curs, nu cu un exemplu inventat", async () => {
    const g = await randeaza();
    await apasa(tab(g, "Mesaj"));
    const previzualizari = [...g.querySelectorAll(".tv-ecran")].map((p) => p.textContent);
    expect(previzualizari[0]).toContain("Bun venit, Ana Pop!");
    expect(previzualizari[0]).toContain("Camera 1003");
    /* A doua previzualizare e cea in engleza — aceeasi cazare, alt sablon. */
    expect(previzualizari[1]).toContain("Welcome, Ana Pop!");
    expect(previzualizari[1]).toContain("Room 1003");
  });

  it("randul de Wi-Fi apare in previzualizare abia dupa ce reteaua e scrisa", async () => {
    const g = await randeaza();
    await apasa(tab(g, "Mesaj"));
    expect(g.querySelector(".tv-ecran").textContent).not.toContain("Wi-Fi");

    const camp = [...g.querySelectorAll("input")].find((i) => i.placeholder === "ex. LaLivada-Oaspeti");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(camp, "LaLivada-Oaspeti");
      camp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(g.querySelector(".tv-ecran").textContent).toContain("Wi-Fi: LaLivada-Oaspeti");
  });

  it("un receptioner nu poate schimba setarile", async () => {
    audit.user = { name: "Test", role: "receptionist" };
    const g = await randeaza();
    await apasa(tab(g, "Mesaj"));
    expect([...g.querySelectorAll(".btn")].some((b) => b.textContent.includes("Salvează"))).toBe(false);
    expect(g.querySelector("select").disabled).toBe(true);
  });
});
