/* Tastarea ocupantului în editorul de grup nu are voie să piardă litere.
 *
 * Raportat pe 18 septembrie 2026: „la un moment dat browserul șterge din
 * litere". Nu browserul — aplicația. Câmpurile de ocupant scriau în bază la
 * FIECARE tastă și își luau valoarea înapoi din starea globală, aceeași pe
 * care o rescrie Realtime. Cursa, pas cu pas:
 *
 *   t=0    tastezi „P"   → salvarea 1 pleacă
 *   t=90   răspunsul ei  → rândul local primește ștampila S1
 *   t=150  tastezi „o"   → local „Po", tot cu S1; salvarea 2 pleacă
 *   t=200  ECOUL Realtime al salvării 1: „P", ștampila S1
 *
 * `aplicaSchimbareRezervare` sare doar peste evenimentele STRICT mai vechi
 * decât rândul local. Ecoul are aceeași ștampilă, deci se aplică — și
 * înlocuiește „Po" cu „P". Litera dispare de sub deget. Dacă apuci să mai
 * tastezi una înainte să vină ecoul salvării 2, pierderea rămâne definitivă.
 * Depinde de cât întârzie Realtime față de degetele tale, de aceea apărea
 * „la un moment dat", mai des pe telefon.
 *
 * Gazda de mai jos reface drumul datelor din pms-app.jsx cu funcțiile
 * ADEVĂRATE (`uneste`, `snakeRes`, `aplicaSchimbareRezervare`), pe un ceas
 * fals: răspunsul vine la 90ms, ecoul la 200ms, tastele la 150ms una de alta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
vi.mock("./features/acces.jsx", () => ({
  reconciliazaAcces: vi.fn().mockResolvedValue(undefined),
  SectiuneAcces: () => null,
  cheamaAcces: vi.fn(),
}));
vi.mock("./lib/audit.js", () => ({
  audit: { push: vi.fn(async () => {}), user: { id: "u1", name: "Test", role: "admin" } },
  isAdmin: () => true,
}));

const { GroupEditor } = await import("./features/grupuri.jsx");
const { uneste } = await import("./data/nucleu.js");
const { snakeRes } = await import("./data/mapari.js");
const { aplicaSchimbareRezervare } = await import("./lib/schimbari-live.js");

const RASPUNS_MS = 90;
const ECOU_MS = 200;
const INTRE_TASTE_MS = 150;

const CORE = {
  rooms: [{ id: "r1002", name: "1002", type: "tiny", capacity: 4 }],
  guests: [{ id: "g1", lastName: "Floristeanu", firstName: "Dragos" }],
  rates: { base: { tiny: 300, adultSupplement: 80, childSupplement: 30 }, seasons: [] },
  onlinePricing: [],
};
const GROUP = { id: "gr1", name: "Nunta Magnifique 19.09", mainGuestId: "g1", createdAt: "2026-08-01T00:00:00Z" };
const S0 = "2026-09-18T06:00:00.000Z";
const REZ = {
  id: "rez1", roomId: "r1002", guestId: "g1", groupId: "gr1", status: "confirmed",
  checkin: "2026-09-19T11:00:00Z", checkout: "2026-09-20T08:00:00Z",
  adults: 2, children: 0, source: "direct", tags: [], messages: [],
  occupantLastName: "", occupantFirstName: "", occupantPhone: "", occupantName: "",
  updatedAt: S0,
};

/* „Baza": ce a ajuns efectiv scris, în ordinea scrierilor. */
let scrieri;
let ceas;

function Gazda() {
  const [reservations, setReservations] = useState([REZ]);
  const resRef = useRef([REZ]);

  const updateReservations = useCallback(async (next) => {
    const before = resRef.current;
    const combinat = uneste(before, next);
    setReservations(combinat);
    resRef.current = combinat;

    const schimbate = combinat.filter((r) => JSON.stringify(r) !== JSON.stringify(before.find((b) => b.id === r.id)));
    if (!schimbate.length) return true;
    ceas += 1;
    const stampila = new Date(Date.parse(S0) + ceas * 1000).toISOString();
    const randuri = schimbate.map((r) => ({ ...snakeRes(r), updated_at: stampila }));
    scrieri.push(...randuri);

    /* Ecoul Realtime: vine separat de răspuns, de obicei după el. */
    setTimeout(() => {
      for (const nou of randuri) {
        const dupa = aplicaSchimbareRezervare({ reservations: resRef.current, blocks: [] }, { tip: "UPDATE", nou });
        resRef.current = dupa.reservations;
        setReservations(dupa.reservations);
      }
    }, ECOU_MS);

    /* Răspunsul salvării: doar ștampila, ca `aplicaStampile`. */
    await new Promise((gata) => setTimeout(gata, RASPUNS_MS));
    const dinBaza = new Map(randuri.map((r) => [r.id, r]));
    const actualizate = resRef.current.map((r) => (dinBaza.has(r.id) ? { ...r, updatedAt: dinBaza.get(r.id).updated_at } : r));
    resRef.current = actualizate;
    setReservations(actualizate);
    return true;
  }, []);

  return React.createElement(GroupEditor, {
    group: GROUP, core: CORE, groups: [GROUP], updateGroups: async () => true,
    reservations, updateReservations, blocks: [],
    onClose: () => {}, onPrint: () => {},
  });
}

let root = null;
let host = null;

const camp = (eticheta) => host.querySelector(`input[aria-label="${eticheta}"]`);

/* O tastă: valoarea de până acum plus litera nouă, exact cum o vede un om —
   citită DIN CÂMP. Dacă aplicația a șters între timp ceva din el, litera
   nouă se așază peste ce a rămas, iar pierderea devine definitivă. */
async function tasteaza(eticheta, litera) {
  const el = camp(eticheta);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, el.value + litera);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const trece = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

/* `spre`: câmpul care primește focusul (Tab între câmpurile aceluiași ocupant);
   fără el, focusul a plecat de tot din rândul ocupantului. */
const iesiDinCamp = async (eticheta, spre = null) => {
  await act(async () => {
    camp(eticheta).dispatchEvent(new FocusEvent("focusout", {
      bubbles: true, relatedTarget: spre ? camp(spre) : null,
    }));
  });
};

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  scrieri = [];
  ceas = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(React.createElement(Gazda)); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.useRealTimers();
});

describe("ocupantul din editorul de grup, tastat mai repede decât ecoul Realtime", () => {
  it("câmpul arată mereu ce ai tastat, nu ce s-a salvat mai devreme", async () => {
    const text = "Popescu";
    let asteptat = "";
    for (const litera of text) {
      await tasteaza("Numele ocupantului", litera);
      asteptat += litera;
      expect(camp("Numele ocupantului").value, `după tasta „${litera}"`).toBe(asteptat);
      /* Între taste sosesc răspunsuri și ecouri ale salvărilor de dinainte. */
      await trece(INTRE_TASTE_MS / 3);
      expect(camp("Numele ocupantului").value, `la ${INTRE_TASTE_MS / 3}ms după „${litera}"`).toBe(asteptat);
      await trece(INTRE_TASTE_MS / 3);
      expect(camp("Numele ocupantului").value, `la ${(2 * INTRE_TASTE_MS) / 3}ms după „${litera}"`).toBe(asteptat);
      await trece(INTRE_TASTE_MS / 3);
      expect(camp("Numele ocupantului").value, `la ${INTRE_TASTE_MS}ms după „${litera}"`).toBe(asteptat);
    }
  });

  it("ce ajunge în bază e numele întreg, o singură dată", async () => {
    for (const litera of "Popescu") {
      await tasteaza("Numele ocupantului", litera);
      await trece(INTRE_TASTE_MS);
    }
    await iesiDinCamp("Numele ocupantului");
    await trece(1000);

    expect(scrieri.length, "numele se scrie la ieșirea din câmp, nu la fiecare tastă").toBe(1);
    expect(scrieri[0].occupant_last_name).toBe("Popescu");
    /* Și după ce s-au așezat toate ecourile, câmpul arată tot numele întreg. */
    expect(camp("Numele ocupantului").value).toBe("Popescu");
  });

  it("o ieșire din câmp fără nicio schimbare nu scrie nimic", async () => {
    await iesiDinCamp("Numele ocupantului");
    await trece(500);
    expect(scrieri.length).toBe(0);
  });

  /* Salvarea e pe RÂND, nu pe câmp. Trei salvări una după alta ale aceleiași
     rezervări ar pleca toate cu ștampila de dinaintea primeia, iar baza le-ar
     refuza pe a doua și a treia drept „modificată de altcineva" — de tine. */
  it("Tab între nume, prenume și telefon nu scrie nimic; ieșirea din rând scrie o dată, tot", async () => {
    const pasi = [
      ["Numele ocupantului", "Popescu", "Prenumele ocupantului"],
      ["Prenumele ocupantului", "Ion", "Telefonul ocupantului"],
      ["Telefonul ocupantului", "0722333444", null],
    ];
    for (const [eticheta, text, spre] of pasi) {
      for (const litera of text) { await tasteaza(eticheta, litera); await trece(40); }
      if (spre) {
        await iesiDinCamp(eticheta, spre);
        expect(scrieri.length, `după Tab din „${eticheta}"`).toBe(0);
      } else {
        await iesiDinCamp(eticheta);
      }
    }
    await trece(1000);

    expect(scrieri.length).toBe(1);
    expect(scrieri[0].occupant_last_name).toBe("Popescu");
    expect(scrieri[0].occupant_first_name).toBe("Ion");
    expect(scrieri[0].occupant_phone).toBe("0722333444");
    expect(camp("Numele ocupantului").value).toBe("Popescu");
    expect(camp("Prenumele ocupantului").value).toBe("Ion");
    expect(camp("Telefonul ocupantului").value).toBe("0722333444");
  });

  /* Escape închide fereastra fără niciun `blur`: React nu-l trimite la
     demontare. Fără scrierea de la demontare, numele tastat s-ar pierde în
     tăcere — mai rău decât bug-ul reparat aici, care măcar se vedea. */
  it("fereastra închisă cu numele încă în câmp îl scrie totuși", async () => {
    for (const litera of "Popescu") { await tasteaza("Numele ocupantului", litera); await trece(40); }
    expect(scrieri.length).toBe(0);
    await act(async () => { root.render(null); });
    await trece(500);
    expect(scrieri.length).toBe(1);
    expect(scrieri[0].occupant_last_name).toBe("Popescu");
  });
});
