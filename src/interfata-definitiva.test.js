/* Interfata noua e definitiva (Ovidiu, 26 septembrie 2026): comutatorul
 * „Interfața: Nouă / Actuală" din Contul meu a disparut, si odata cu el tot
 * ce tinea doar de forma veche.
 *
 * Ce s-ar strica tacut: un telefon ramas cu „Actuală" in localStorage sa
 * primeasca in continuare forma veche pe bucati (fara „inapoi", fara bara
 * de jos, culorile vechi in Azi); o regula din pms.css sa ramana legata de
 * o clasa pe care n-o mai pune nimeni — adica sa nu se mai aplice deloc.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const { CalendarView } = await import("./features/rezervari/calendar.jsx");

/* Toate sursele PMS-ului, fara aplicatia oaspetelui (src/guest are propria
   ei „interfata", textele traduse) si fara teste. */
function surse(dir = "src") {
  return readdirSync(dir).flatMap((nume) => {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) return cale.split(sep).includes("guest") ? [] : surse(cale);
    return /\.(jsx?|css)$/.test(nume) && !/\.test\.jsx?$/.test(nume) ? [cale] : [];
  });
}

describe("interfata noua e singura", () => {
  it("nicio sursa nu mai citeste alegerea de interfata si nu mai pune clasa ei", () => {
    const urme = ["pms:interfata", "useInterfata", "seteazaInterfata", "RadacinaPms", "CHEIE_INTERFATA", "ui-noua"];
    const gasite = surse().flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return urme.filter((u) => text.includes(u)).map((u) => `${relative(".", f)}: ${u}`);
    });
    expect(gasite).toEqual([]);
  });

  it("bara de actiuni a ferestrelor e lipita jos pe orice dispozitiv", () => {
    const css = readFileSync("src/styles/pms.css", "utf8");
    expect(css).toMatch(/\.pms \.modal \.modal-actions\{[^}]*position:sticky/);
  });
});

/* Butonul „Rezervare nouă" din bara de sub calendar se vedea doar pe
   telefon, in forma veche: in cea noua ii tine locul „+" din bara de jos,
   iar pe tableta si desktop e in antet. Ramas, ar fi fost un buton ascuns
   pentru totdeauna. */
describe("calendarul", () => {
  const montate = [];
  afterEach(async () => {
    await act(async () => { montate.forEach(({ root }) => root.unmount()); });
    montate.forEach(({ host }) => host.remove());
    montate.length = 0;
  });

  it("bara de sub calendar nu mai are butonul de rezervare", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    montate.push({ root, host });
    const fn = () => vi.fn();
    await act(async () => {
      root.render(React.createElement(CalendarView, {
        core: { rooms: [{ id: "t1", name: "1001", type: "tiny" }], guests: [] },
        updateCore: fn(), reservations: [], updateReservations: fn(),
        groups: [], updateGroups: fn(), housekeeping: [], updateHousekeeping: fn(),
        blocks: [], updateBlocks: fn(), stergeRezervari: fn(), stergeGrupuri: fn(), stergeBlocaje: fn(),
        adaugaOaspetiInCache: fn(), salveazaOaspete: fn(), asiguraPerioada: fn(),
        intent: null, clearIntent: fn(), noutati: null,
      }));
    });
    const bara = host.querySelector(".cal-toolbar");
    expect(bara).not.toBeNull();
    expect(bara.textContent).not.toMatch(/Rezervare/);
  });
});
