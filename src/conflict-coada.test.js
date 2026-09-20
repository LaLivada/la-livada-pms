/* Doua salvari respinse aproape deodata (faza 3, C5): fiecare isi primeste
 * dialogul si raspunsul.
 *
 * Gasit pe 18 septembrie 2026, citind codul: dialogul C5 tinea UN singur
 * conflict (`useState(null)` in pms-app.jsx). Doua salvari plecate una dupa
 * alta — doua check-in-uri la rand — si respinse amandoua de baza (40001,
 * `stamp_reservation_updated_at`) ajungeau amandoua la `setConflict`. A doua
 * o inlocuia pe prima: dialogul isi schimba continutul sub ochii omului, iar
 * `alege` al primei nu mai putea fi chemat de nimeni. Promisiunea ei ramanea
 * neimplinita pentru totdeauna, si odata cu ea tot ce o astepta (`doCheckIn`,
 * `saveInner`) — fara nicio eroare pe ecran.
 *
 * Gazda de mai jos reface drumul din pms-app.jsx (`updateReservations` +
 * `rezolvaConflictul`) cu functiile ADEVARATE — `uneste`, `randuriSchimbate`,
 * `pregatesteConflict`, `aplicaAlegerea`, `ecranDupaAlegere` — peste o „baza"
 * care refuza stampila veche ca triggerul. Partea care avea bug-ul e cea
 * reala: coada (`useCoadaConflicte`), gazda ei si dialogul.
 *
 * Al doilea bug aparat aici (20 septembrie 2026): dupa alegere, ecranul se
 * refacea din instantaneul dinaintea salvarii si stergea ce se schimbase
 * intre timp. Regula e in lib/conflict.js (`ecranDupaAlegere`); gazda o
 * leaga la fel ca pms-app.jsx, deci cele doua trebuie schimbate impreuna.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
window.HTMLElement.prototype.scrollIntoView = () => {};

/* Dialogul e incarcat la cerere de ConflictHost; adus o data aici, ca
   testele sa nu astepte dupa transformarea modulului. */
await import("./features/conflict.jsx");
const { useCoadaConflicte, ConflictHost } = await import("./features/conflict-coada.jsx");
const { uneste, randuriSchimbate } = await import("./data/nucleu.js");
const { esteConflict, pregatesteConflict, aplicaAlegerea, ecranDupaAlegere } = await import("./lib/conflict.js");
const { aplicaSchimbareRezervare } = await import("./lib/schimbari-live.js");
const { snakeRes } = await import("./data/mapari.js");
const { PRAG_DUBLU_TAP } = await import("./lib/gest.js");

const SCRIERE_MS = 90;
const CITIRE_MS = 60;

const CORE = {
  rooms: [{ id: "c1", name: "1005" }, { id: "c2", name: "1006" }],
  guests: [
    { id: "g1", lastName: "Popescu", firstName: "Ana" },
    { id: "g2", lastName: "Ionescu", firstName: "Dan" },
  ],
  billingCustomers: [],
};
const S0 = "2026-09-18T10:00:00.000Z";
const S_LOR = "2026-09-18T10:05:00.000Z";
const rezervare = (id, roomId, guestId) => ({
  id, roomId, guestId, groupId: null, checkin: "2026-09-18T11:00:00.000Z",
  checkout: "2026-09-20T09:00:00.000Z", status: "confirmed", adults: 2, children: 0,
  priceOverride: null, bookedPrice: 600, source: "direct", tags: [], notes: "", occupantLastName: "",
  occupantFirstName: "", occupantPhone: "", occupantName: "", messages: [], billingCustomerId: "",
  updatedAt: S0,
});
const R1 = rezervare("r1", "c1", "g1");
const R2 = rezervare("r2", "c2", "g2");

/* „Baza": refuza o scriere pornita de la o stampila mai veche decat a ei.
   O scriere e atomica — un rand refuzat le opreste pe toate. */
let baza;
let ceas;
const pauza = (ms) => new Promise((gata) => setTimeout(gata, ms));
async function scrieInBaza(before, after) {
  await pauza(SCRIERE_MS);
  const schimbate = randuriSchimbate(before, after);
  for (const r of schimbate) {
    const s = baza.get(r.id);
    if (s && Date.parse(s.updatedAt) > Date.parse(r.updatedAt)) {
      throw Object.assign(new Error("Rezervarea a fost modificată de altcineva între timp."), { code: "40001" });
    }
  }
  ceas += 1;
  const stampila = new Date(Date.parse(S_LOR) + ceas * 60000).toISOString();
  return schimbate.map((r) => {
    baza.set(r.id, { ...r, updatedAt: stampila });
    return { id: r.id, updated_at: stampila };
  });
}
async function citesteDinBaza(ids) {
  await pauza(CITIRE_MS);
  return ids.map((id) => baza.get(id)).filter(Boolean);
}

let aplicatie; // ce scoate Gazda la iveala: salvarea si lista de pe ecran

function Gazda() {
  const [reservations, setReservations] = useState([R1, R2]);
  const resRef = useRef([R1, R2]);
  const [conflict, intreabaConflict] = useCoadaConflicte();

  const aplicaStampile = useCallback((scrise) => {
    const dinBaza = new Map(scrise.map((r) => [r.id, r]));
    const actualizate = resRef.current.map((r) => (dinBaza.has(r.id) ? { ...r, updatedAt: dinBaza.get(r.id).updated_at } : r));
    resRef.current = actualizate;
    setReservations(actualizate);
  }, []);

  const rezolvaConflictul = useCallback(async (eroare, before, combinat) => {
    const trimise = randuriSchimbate(before, combinat);
    const dePeServer = await citesteDinBaza(trimise.map((r) => r.id));
    const randuri = pregatesteConflict(before, trimise, dePeServer, new Map());
    if (!randuri) throw eroare;
    const alegere = await intreabaConflict(randuri);
    const ecran = ecranDupaAlegere(alegere, resRef.current, before, trimise, randuri);
    resRef.current = ecran; setReservations(ecran);
    const { scrie, final } = aplicaAlegerea(alegere, combinat, randuri);
    return scrie ? final : null;
  }, [intreabaConflict]);

  const updateReservations = useCallback(async (next) => {
    const before = resRef.current;
    const combinat = uneste(before, next);
    setReservations(combinat);
    resRef.current = combinat;
    try {
      aplicaStampile(await scrieInBaza(before, combinat));
      return true;
    } catch (e) {
      if (!esteConflict(e)) return false;
      try {
        const final = await rezolvaConflictul(e, before, combinat);
        if (!final) return null;
        aplicaStampile(await scrieInBaza(before, final));
        return true;
      } catch { return null; }
    }
  }, [rezolvaConflictul, aplicaStampile]);

  /* Un eveniment Realtime, aplicat ca in pms-app.jsx (`aplica`). */
  const primesteLive = useCallback((ev) => {
    const inainte = { reservations: resRef.current, blocks: [] };
    const dupa = aplicaSchimbareRezervare(inainte, ev);
    if (dupa === inainte) return;
    resRef.current = dupa.reservations; setReservations(dupa.reservations);
  }, []);

  useEffect(() => { aplicatie = { updateReservations, primesteLive, reservations }; });
  return React.createElement(ConflictHost, { conflict, core: CORE, groups: [] });
}

let root = null;
let host = null;

const trece = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const dialog = () => host.querySelector('[role="dialog"]');
const titlu = () => dialog()?.querySelector(".conflict-titlu")?.textContent || null;
const apasa = async (text) => {
  const buton = [...dialog().querySelectorAll("button")].find((b) => b.textContent === text);
  await act(async () => { buton.click(); });
};
/* Check-in din lista de pe ecran, ca `doCheckIn`; rezultatul salvarii se
   noteaza cand vine — o salvare agatata nu lasa nimic. */
const rezultate = {};
const cazeaza = (id) => {
  const next = aplicatie.reservations.map((r) => (r.id === id ? { ...r, status: "checkedin" } : r));
  aplicatie.updateReservations(next).then((v) => { rezultate[id] = v; });
};
const peEcran = (id) => aplicatie.reservations.find((r) => r.id === id);

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  ceas = 0;
  for (const k of Object.keys(rezultate)) delete rezultate[k];
  /* Un coleg a salvat intre timp amandoua rezervarile: o nota la prima, un
     copil in plus la a doua. */
  baza = new Map([
    ["r1", { ...R1, notes: "sosesc după 22", updatedAt: S_LOR }],
    ["r2", { ...R2, children: 1, updatedAt: S_LOR }],
  ]);
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

const POPESCU = "Popescu Ana · Camera 1005 · 18.09 → 20.09";
const IONESCU = "Ionescu Dan · Camera 1006 · 18.09 → 20.09";

/* Doua check-in-uri la rand, amandoua respinse; la intoarcere, amandoua
   si-au adus versiunea de pe server si asteapta alegerea — cu mult inainte
   ca omul sa apuce sa citeasca primul dialog. */
async function douaSalvariRespinse() {
  await act(async () => { cazeaza("r1"); });
  await trece(20);
  await act(async () => { cazeaza("r2"); });
  await trece(1000);
}
const inapoi = async () => { await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); }); };

describe("doua salvari respinse deodata ca modificare concurenta", () => {
  it("fiecare isi primeste dialogul si raspunsul; niciuna nu ramane agatata", async () => {
    await douaSalvariRespinse();

    /* Primul conflict ramane pe ecran pana i se raspunde — al doilea nu are
       voie sa-i ia locul sub ochii omului. */
    expect(titlu()).toBe(POPESCU);
    await apasa("Păstrează a mea");
    await trece(PRAG_DUBLU_TAP);

    expect(titlu()).toBe(IONESCU);
    await apasa("Ia pe a lor");
    await trece(1000);

    expect(rezultate).toEqual({ r1: true, r2: null });
    expect(dialog()).toBeNull();
    /* „Pastreaza a mea": check-in-ul meu peste nota lor. „Ia pe a lor":
       randul lor, neatins. */
    expect(baza.get("r1")).toMatchObject({ status: "checkedin", notes: "sosesc după 22" });
    expect(baza.get("r2")).toMatchObject({ status: "confirmed", children: 1, updatedAt: S_LOR });
  });

  /* Al doilea dialog apare exact in locul primului, cu aceleasi butoane. Fara
     garda, a doua jumatate a unui dublu-click pe „Pastreaza a mea" ar scrie
     peste ce a salvat colegul la a doua rezervare, fara ca dialogul ei sa fi
     fost macar vazut. */
  it("a doua jumatate a unui dublu-click nu raspunde si la dialogul urmator", async () => {
    await douaSalvariRespinse();
    await apasa("Păstrează a mea");
    await trece(150);
    expect(titlu()).toBe(IONESCU);
    await apasa("Păstrează a mea");
    await trece(1000);

    expect(titlu()).toBe(IONESCU);
    expect(rezultate).toEqual({ r1: true });
    expect(baza.get("r2")).toMatchObject({ status: "confirmed", updatedAt: S_LOR });

    /* Citit, si abia apoi ales: acum conteaza. */
    await apasa("Păstrează a mea");
    await trece(1000);
    expect(rezultate).toEqual({ r1: true, r2: true });
    expect(baza.get("r2")).toMatchObject({ status: "checkedin", children: 1 });
  });

  /* Fiecare conflict e o fereastra noua si pentru istoricul browserului
     (ui/istoric.jsx). Daca al doilea ar refolosi fereastra primului, intrarea
     ei din istoric ar fi deja consumata de primul „inapoi", iar al doilea
     „inapoi" ar iesi din PMS. Inchiderea nu trece prin garda de dublu-click:
     nu scrie nimic, iar browserul a consumat deja intrarea. */
  it("„inapoi” pe telefon inchide cate un dialog, fiecare cu intrarea lui din istoric", async () => {
    await douaSalvariRespinse();
    const intrareaPrimului = history.state?.pmsFereastra;
    expect(intrareaPrimului).toBeTruthy();

    await inapoi();
    expect(titlu()).toBe(IONESCU);
    expect(history.state?.pmsFereastra).toBeTruthy();
    expect(history.state.pmsFereastra).not.toBe(intrareaPrimului);

    await inapoi();
    await trece(1000);
    expect(dialog()).toBeNull();
    expect(rezultate).toEqual({ r1: null, r2: null });
    expect(baza.get("r1")).toMatchObject({ status: "confirmed", updatedAt: S_LOR });
    expect(baza.get("r2")).toMatchObject({ status: "confirmed", updatedAt: S_LOR });
  });

  /* Un raspuns isi scoate din coada doar intrarea LUI. Doua „inapoi" sosite
     inainte ca ecranul sa se redeseneze inchid de doua ori acelasi dialog;
     daca al doilea ar scoate „primul din coada", ar arunca fara raspuns
     conflictul urmator — alta salvare agatata. */
  it("acelasi dialog inchis de doua ori nu arunca din coada conflictul urmator", async () => {
    await douaSalvariRespinse();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    await trece(1000);

    expect(rezultate).toEqual({ r1: null });
    expect(titlu()).toBe(IONESCU);
    await apasa("Ia pe a lor");
    await trece(1000);
    expect(rezultate).toEqual({ r1: null, r2: null });
  });
});

/* Gasit pe 20 septembrie 2026: dupa alegere, ecranul se refacea dintr-un
   instantaneu luat INAINTE de salvare (`before` / `combinat`) si inlocuia
   lista INTREAGA — tot ce se schimbase intre timp pe celelalte randuri
   disparea de pe ecran. Baza ramanea corecta (scrierile sunt pe rand si
   pazite de stampila), dar ecranul mintea pana la urmatorul eveniment
   Realtime al randului, iar orice editare a lui era respinsa intre timp ca
   „modificata de altcineva" — de mine insumi. */
describe("dupa alegere, ecranul pastreaza ce s-a schimbat intre timp", () => {
  /* Al doilea conflict si-a luat instantaneul cand r1 era doar check-in-ul
     meu optimist, cu stampila veche; raspunsul lui nu are voie sa stearga de
     pe ecran nota colegului si stampila abia scrisa la r1. */
  it("un conflict rezolvat nu e dat inapoi de raspunsul la urmatorul", async () => {
    await douaSalvariRespinse();
    await apasa("Păstrează a mea");
    await trece(PRAG_DUBLU_TAP);
    await apasa("Ia pe a lor");
    await trece(1000);

    expect(baza.get("r1")).toMatchObject({ status: "checkedin", notes: "sosesc după 22", updatedAt: "2026-09-18T10:06:00.000Z" });
    expect(peEcran("r1")).toEqual(baza.get("r1"));
    expect(peEcran("r2")).toEqual(baza.get("r2"));
  });

  /* Dialogul poate sta deschis minute intregi. Salvarea colegului la r2
     ajunge prin Realtime abia cat omul citeste conflictul de la r1. */
  it.each(["Păstrează a mea", "Ia pe a lor"])("ce aduce Realtime cat dialogul e deschis ramane pe ecran dupa „%s”", async (raspuns) => {
    await act(async () => { cazeaza("r1"); });
    await trece(1000);
    expect(titlu()).toBe(POPESCU);

    await act(async () => { aplicatie.primesteLive({ tip: "UPDATE", nou: snakeRes(baza.get("r2")) }); });
    expect(peEcran("r2")).toMatchObject({ children: 1, updatedAt: S_LOR });

    await apasa(raspuns);
    await trece(1000);
    expect(dialog()).toBeNull();
    expect(peEcran("r2")).toMatchObject({ children: 1, updatedAt: S_LOR });
    expect(peEcran("r1")).toEqual(baza.get("r1"));
  });
});
