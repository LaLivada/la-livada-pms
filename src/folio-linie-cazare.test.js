/* Linia de cazare a unui folio e una singura, oricate incarcari ar veni
 * deodata (26 septembrie 2026).
 *
 * Ce s-a intamplat: dupa check-in-ul din 26.09, 17:58 (camera 1012),
 * panoul folio s-a incarcat de doua ori la 150 ms distanta — a doua oara
 * cand s-a reincarcat `core` dupa reconectarea Realtime. Ambele incarcari au
 * citit pozitiile inainte ca vreuna sa scrie, n-au gasit linia de cazare si
 * au scris-o fiecare, cu cate un id nou: 2 × 300 lei pe acelasi folio. La
 * fel pe 13 si 14 septembrie (1004, 1005). Panoul arata una singura, aleasa
 * la intamplare dintre ele, deci dupa facturarea uneia cealalta ramanea
 * „nefacturata" si cazarea se putea factura a doua oara. Tot atunci a doua
 * creare a folio-ului a luat 409 (tratat, dar zgomot in jurnal).
 *
 * Magazinul de mai jos imita tabelul: `upsert` pe id, deci doua scrieri cu
 * acelasi id raman un rand, iar cu id-uri diferite devin doua.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

let randuri;           // folio_items: id -> rand
let esecUrmator;       // eroarea pe care o da urmatoarea scriere, o data
const asteapta = () => new Promise((r) => setTimeout(r, 0));

vi.mock("./data/folio.js", () => ({
  folioPentruRezervare: vi.fn(),
  pozitiiFolio: vi.fn(async (idFolio) => {
    await asteapta();
    return [...randuri.values()].filter((r) => r.folio_id === idFolio);
  }),
  salveazaLinieCazare: vi.fn(async (rand) => {
    await asteapta();
    if (esecUrmator) { const e = esecUrmator; esecUrmator = null; throw e; }
    randuri.set(rand.id, { invoiced_status: "uninvoiced", ...randuri.get(rand.id), ...rand });
    return randuri.get(rand.id);
  }),
  adaugaPozitie: vi.fn(),
  stergePozitie: vi.fn(),
}));

const { ensureCazareLine } = await import("./features/facturare/emitere.jsx");
const dateFolio = await import("./data/folio.js");

const FOLIO = { id: "raqa9itg", reservation_id: "0fipa0od" };
const REZ = {
  id: "0fipa0od", roomId: "r1012", checkin: "2026-09-26T11:00:00.000Z", checkout: "2026-09-27T08:00:00.000Z",
  priceOverride: 300,
};
const CORE = {
  products: [{ id: "prod-cazare", category: "cazare", vatRateId: "v11", active: true }],
  vatRates: [{ id: "v11", rate: 11 }],
  rooms: [], rates: [], seasons: [],
};
const liniiCazare = () => [...randuri.values()].filter((r) => r.category === "cazare");

beforeEach(() => {
  randuri = new Map();
  esecUrmator = null;
  vi.clearAllMocks();
});

describe("linia de cazare a folio-ului", () => {
  it("doua incarcari simultane, fara linie inca, lasa o singura linie de cazare", async () => {
    /* Amandoua au citit pozitiile inainte ca vreuna sa scrie: lista goala. */
    await Promise.all([
      ensureCazareLine(FOLIO, [], REZ, CORE),
      ensureCazareLine(FOLIO, [], REZ, CORE),
    ]);
    expect(liniiCazare()).toHaveLength(1);
    expect(liniiCazare()[0]).toMatchObject({ folio_id: "raqa9itg", quantity: 1, total_amount: 300 });
  });

  it("linia existenta se actualizeaza pe loc, nu se adauga alta", async () => {
    randuri.set("veche123", {
      id: "veche123", folio_id: "raqa9itg", category: "cazare", quantity: 1, unit_price: 250,
      total_amount: 250, invoiced_status: "uninvoiced",
    });
    const rezultat = await ensureCazareLine(FOLIO, [...randuri.values()], REZ, CORE);
    expect(rezultat.id).toBe("veche123");
    expect(liniiCazare()).toHaveLength(1);
    expect(liniiCazare()[0].total_amount).toBe(300);
  });

  /* Baza tine si ea regula (indexul unic pe folio_id pentru categoria
     cazare): o scriere care vine a doua, de pe alt dispozitiv, cu o linie
     veche pe care lista ei n-o avea, primeste 23505. Nu e o eroare pentru
     om — linia exista; se reciteste si se lucreaza pe ea. */
  it("la 23505 (linia a scris-o altcineva intre timp) o reciteste si o foloseste", async () => {
    randuri.set("altcineva", {
      id: "altcineva", folio_id: "raqa9itg", category: "cazare", quantity: 1, unit_price: 300,
      total_amount: 300, invoiced_status: "uninvoiced",
    });
    esecUrmator = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    const rezultat = await ensureCazareLine(FOLIO, [], REZ, CORE);
    expect(rezultat.id).toBe("altcineva");
    expect(liniiCazare()).toHaveLength(1);
  });

  it("alta eroare de scriere urca la panou, ca sa fie aratata", async () => {
    esecUrmator = Object.assign(new Error("permission denied"), { code: "42501" });
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ensureCazareLine(FOLIO, [], REZ, CORE)).rejects.toThrow("permission denied");
    consola.mockRestore();
    expect(dateFolio.pozitiiFolio).not.toHaveBeenCalled();
  });
});
