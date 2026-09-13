/* Caseta de cautare globala (faza 3, C1), randata cu componenta reala.
 *
 * Nu pot deschide aplicatia ca s-o vad — cere autentificare — deci aici
 * se apara ce s-ar strica tacut: cererea sa plece o singura data, dupa
 * pauza, cu textul curatat; sub 3 caractere sa nu plece deloc; sagetile si
 * Enter sa aleaga randul potrivit; o eroare de pe server sa se vada, nu sa
 * lase lista goala fara motiv. „Serverul" e un mock al data/cautare.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
/* jsdom n-are derulare; Dialog aduce campul focalizat in vizor. */
window.HTMLElement.prototype.scrollIntoView = () => {};

const cautaRezervari = vi.fn();
vi.mock("./data/cautare.js", () => ({ cautaRezervari: (...a) => cautaRezervari(...a) }));

const { CautareGlobala } = await import("./features/cautare.jsx");

const rezultat = (id, nume, extra = {}) => ({
  rezervare: {
    id, roomId: "c1005", checkin: "2026-10-17T11:00:00Z", checkout: "2026-10-19T09:00:00Z",
    status: "confirmed", occupantName: "", occupantPhone: "", guestCode: "ABC12345", ...extra,
  },
  camera: "1005",
  oaspete: { lastName: nume, firstName: "Ana", phone: "+40 722 111 222" },
  grup: "", potrivire: "nume",
});
const ANA = rezultat("r1", "Popescu");
const ION = rezultat("r2", "Popovici", { status: "checkedin" });

const montate = [];
const asteapta = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function deschide(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  const onAlege = vi.fn(), onClose = vi.fn();
  await act(async () => {
    root.render(React.createElement(CautareGlobala, { onAlege, onClose, ...props }));
  });
  return { host, onAlege, onClose, camp: host.querySelector("input") };
}

function scrie(input, valoare) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, valoare);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const apasa = (el, key) => act(async () => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
});
const randuri = (host) => [...host.querySelectorAll('[role="option"]')];
const titluri = (host) => randuri(host).map((b) => b.querySelector(".gname").textContent);
const mesaj = (host) => host.querySelector(".cautare-gol")?.textContent || "";

beforeEach(() => {
  cautaRezervari.mockReset();
  cautaRezervari.mockResolvedValue([ANA, ION]);
});
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
});

describe("CautareGlobala", () => {
  it("se deschide cu focus in camp si cu indrumarea, fara nicio cerere", async () => {
    const { host, camp } = await deschide();
    expect(document.activeElement).toBe(camp);
    expect(mesaj(host)).toMatch(/nume, un telefon, o cameră sau un cod/);
    expect(cautaRezervari).not.toHaveBeenCalled();
  });

  it("sub 3 caractere nu intreaba serverul si spune de ce", async () => {
    const { host, camp } = await deschide();
    await act(async () => scrie(camp, "Po"));
    await asteapta(300);
    expect(cautaRezervari).not.toHaveBeenCalled();
    expect(mesaj(host)).toBe("Cel puțin 3 caractere.");
  });

  /* Testul care conteaza: o singura cerere dupa pauza, nu una pe tasta, cu
     textul curatat de spatii. */
  it("dupa pauza cere o singura data, cu textul curatat, si arata rezultatele", async () => {
    const { host, camp } = await deschide();
    await act(async () => scrie(camp, "  Po"));
    await act(async () => scrie(camp, "  Pop "));
    await asteapta(300);
    expect(cautaRezervari).toHaveBeenCalledTimes(1);
    expect(cautaRezervari).toHaveBeenCalledWith("Pop");
    expect(titluri(host)).toEqual(["Popescu Ana", "Popovici Ana"]);
    expect(randuri(host)[0].getAttribute("aria-selected")).toBe("true");
    expect(randuri(host)[0].textContent).toMatch(/Camera 1005 · 17\.10 → 19\.10\.2026/);
    expect(randuri(host)[0].textContent).toMatch(/Confirmată/);
    expect(randuri(host)[1].textContent).toMatch(/Checked-in/);
  });

  it("sagetile plimba selectia (cu intoarcere la capete) si Enter alege", async () => {
    const { host, camp, onAlege } = await deschide();
    await act(async () => scrie(camp, "Pop"));
    await asteapta(300);
    await apasa(camp, "ArrowDown");
    expect(randuri(host)[1].getAttribute("aria-selected")).toBe("true");
    expect(camp.getAttribute("aria-activedescendant")).toBe("cautare-rez-1");
    await apasa(camp, "ArrowDown");
    expect(randuri(host)[0].getAttribute("aria-selected")).toBe("true");
    await apasa(camp, "ArrowUp");
    expect(randuri(host)[1].getAttribute("aria-selected")).toBe("true");
    await apasa(camp, "Enter");
    expect(onAlege).toHaveBeenCalledTimes(1);
    expect(onAlege.mock.calls[0][0].rezervare.id).toBe("r2");
  });

  it("Enter fara rezultate nu alege nimic", async () => {
    const { camp, onAlege } = await deschide();
    await apasa(camp, "Enter");
    expect(onAlege).not.toHaveBeenCalled();
  });

  it("clicul pe un rand alege randul acela", async () => {
    const { host, camp, onAlege } = await deschide();
    await act(async () => scrie(camp, "Pop"));
    await asteapta(300);
    await act(async () => { randuri(host)[0].click(); });
    expect(onAlege.mock.calls[0][0].rezervare.id).toBe("r1");
  });

  it("Escape inchide caseta", async () => {
    const { camp, onClose } = await deschide();
    await apasa(camp, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("nimic gasit spune pentru ce", async () => {
    cautaRezervari.mockResolvedValue([]);
    const { host, camp } = await deschide();
    await act(async () => scrie(camp, "Zzz"));
    await asteapta(300);
    expect(mesaj(host)).toBe("Nimic pentru „Zzz”.");
    expect(randuri(host)).toHaveLength(0);
  });

  it("eroarea de pe server se vede, nu o lista goala tacuta", async () => {
    cautaRezervari.mockRejectedValue({ message: "fetch failed" });
    const { host, camp } = await deschide();
    await act(async () => scrie(camp, "Pop"));
    await asteapta(300);
    expect(mesaj(host)).toMatch(/^Căutarea a eșuat/);
  });

  /* Un raspuns intarziat pentru un text vechi nu trebuie sa acopere
     rezultatele textului nou. */
  it("raspunsul unei cautari vechi nu suprascrie una noua", async () => {
    let elibereaza;
    cautaRezervari.mockImplementationOnce(() => new Promise((r) => { elibereaza = r; }));
    const { host, camp } = await deschide();
    await act(async () => scrie(camp, "Pop"));
    await asteapta(300);
    expect(mesaj(host)).toBe("Caut…");
    await act(async () => scrie(camp, "Ion"));
    await asteapta(300);
    expect(titluri(host)).toEqual(["Popescu Ana", "Popovici Ana"]);
    await act(async () => { elibereaza([rezultat("r9", "Vechi")]); });
    await asteapta();
    expect(titluri(host)).toEqual(["Popescu Ana", "Popovici Ana"]);
    expect(cautaRezervari).toHaveBeenCalledTimes(2);
  });
});
