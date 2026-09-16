/* Clientul Oblio (supabase/functions/oblio-facturare/oblio.ts), pur, cu un
 * fetch fals: tokenul, cererile si erorile lor, potrivirea cotelor de TVA
 * dupa procent, clientul (firma / persoana), liniile cu TVA inclus, factura,
 * stornarea (cantitati negate + referenceDocument), anularea. Ce s-ar strica
 * tacut: o factura cu alta cota, alt client sau alt total decat in PMS. */
import { describe, it, expect } from "vitest";
import {
  obtineToken, tokenValabil, cereOblio, alegeCota, aziBucuresti, ziRo, clientOblio, liniiOblio,
  facturaOblio, stornoOblio, anulareOblio, raspunsEmitere, EroareOblio, PERMISIUNI,
} from "../supabase/functions/oblio-facturare/oblio.ts";

const raspuns = (corp, status = 200) => ({ ok: status < 400, status, json: async () => corp, text: async () => JSON.stringify(corp) });
const fetchFals = (corp, status) => {
  const apeluri = [];
  const f = async (url, init) => { apeluri.push({ url, init }); return raspuns(corp, status); };
  f.apeluri = apeluri;
  return f;
};
const COTE = [{ name: "Normala", percentage: 21, default: true }, { name: "Redusa", percentage: 11 }, { name: "SFDD", percentage: 0 }];
const SETARI = { cif: "RO12345678", serie: "LL", punctLucru: "Sediu" };
const FIRMA = { kind: "company", company_name: "Exemplu SRL", cui: "RO987654", reg_com: "J37/1/2020", contact_name: "Ana", address: "Str. X 1", city: "Vaslui", county: "Vaslui", country: "România", email: "a@x.ro", phone: "07" };
const PERSOANA = { kind: "person", last_name: "Popescu", first_name: "Ion", cnp: "", address: "Str. Y 2", city: "Iași", county: "Iași", country: "România" };
const LINII = [
  { name: "Cazare", quantity: 2, unit_price: 350, vat_rate: 11, unit: "noapte", category: "cazare" },
  { name: "Minibar", quantity: 1, unit_price: 25.5, vat_rate: 21, unit: "buc", category: "minibar" },
];
const FACTURA = { id: "inv-1", oblio_cheie: "pms-inv-1", notes: "", service_date_start: "2026-09-14T11:00:00Z", service_date_end: "2026-09-16T08:00:00Z" };

describe("token", () => {
  it("trimite client_id/client_secret ca form (fara spatii), tine tokenul un minut mai putin decat expires_in", async () => {
    const f = fetchFals({ access_token: "tok", expires_in: 3600 });
    const t = await obtineToken(f, " mail@x.ro ", "secret\n", 1_000_000);
    expect(t).toEqual({ valoare: "tok", expiraLa: 1_000_000 + 3600_000 - 60_000 });
    expect(f.apeluri[0].url).toBe("https://www.oblio.eu/api/authorize/token");
    expect(f.apeluri[0].init.method).toBe("POST");
    expect(f.apeluri[0].init.body).toBe("client_id=mail%40x.ro&client_secret=secret");
    expect(tokenValabil(t, 1_000_000)).toBe(true);
    expect(tokenValabil(t, 1_000_000 + 3600_000)).toBe(false);
    expect(tokenValabil(null)).toBe(false);
  });
  it("refuzul devine EroareOblio cu mesajul lor", async () => {
    await expect(obtineToken(fetchFals({ status: 401, statusMessage: "Invalid client" }, 401), "a", "b")).rejects.toThrow("Invalid client");
  });
});

describe("cereOblio", () => {
  it("Bearer, JSON, intoarce `data`", async () => {
    const f = fetchFals({ status: 200, statusMessage: "Success", data: { seriesName: "LL", number: "0007" } });
    const d = await cereOblio(f, "tok", "POST", "/docs/invoice", { cif: "x" });
    expect(d).toEqual({ seriesName: "LL", number: "0007" });
    expect(f.apeluri[0].url).toBe("https://www.oblio.eu/api/docs/invoice");
    expect(f.apeluri[0].init.headers.Authorization).toBe("Bearer tok");
    expect(f.apeluri[0].init.headers["Content-Type"]).toBe("application/json");
    expect(f.apeluri[0].init.body).toBe('{"cif":"x"}');
  });
  it("GET fara corp, fara Content-Type", async () => {
    const f = fetchFals({ status: 200, data: [] });
    await cereOblio(f, "tok", "GET", "/nomenclature/companies");
    expect(f.apeluri[0].init.body).toBeUndefined();
    expect(f.apeluri[0].init.headers["Content-Type"]).toBeUndefined();
  });
  it("status 400 in corp = eroare, chiar cu HTTP 200", async () => {
    await expect(cereOblio(fetchFals({ status: 400, statusMessage: "Seria nu exista" }), "tok", "GET", "/x")).rejects.toThrow("Seria nu exista");
  });
  it("HTTP 500 fara JSON = EroareOblio cu statusul HTTP", async () => {
    const f = async () => ({ ok: false, status: 500, text: async () => "<html>" });
    const e = await cereOblio(f, "tok", "GET", "/x").catch((x) => x);
    expect(e).toBeInstanceOf(EroareOblio);
    expect(e.status).toBe(500);
  });
});

describe("cote si date", () => {
  it("alege cota dupa procent, preferand-o pe cea implicita", () => {
    expect(alegeCota(COTE, 11).name).toBe("Redusa");
    expect(alegeCota([{ name: "A", percentage: 21 }, { name: "B", percentage: 21, default: true }], 21).name).toBe("B");
    expect(() => alegeCota(COTE, 5)).toThrow("5%");
  });
  it("azi la Vaslui, nu UTC; zilele in format romanesc", () => {
    expect(aziBucuresti(new Date("2026-09-16T21:30:00Z"))).toBe("2026-09-17");
    expect(ziRo("2026-09-16T21:30:00Z")).toBe("17.09.2026");
    expect(ziRo(null)).toBe("");
  });
});

describe("clientul", () => {
  it("firma: CUI, RC, contact, platitor de TVA dupa prefixul RO, fara salvare in nomenclatorul lor", () => {
    expect(clientOblio(FIRMA)).toEqual({
      cif: "RO987654", name: "Exemplu SRL", rc: "J37/1/2020", address: "Str. X 1", city: "Vaslui", state: "Vaslui",
      country: "România", email: "a@x.ro", phone: "07", contact: "Ana", vatPayer: true, save: 0,
    });
    expect(clientOblio({ ...FIRMA, cui: "987654" }).vatPayer).toBe(false);
  });
  it("persoana: nume + prenume, CNP-ul (optional) in cif, fara RC", () => {
    const c = clientOblio(PERSOANA);
    expect(c.name).toBe("Popescu Ion");
    expect(c.cif).toBe("");
    expect(c.rc).toBe("");
    expect(c.contact).toBe("");
    expect(c.vatPayer).toBe(false);
    expect(clientOblio({ ...PERSOANA, cnp: "1800101123456" }).cif).toBe("1800101123456");
  });
});

describe("factura", () => {
  it("liniile: pret cu TVA inclus, unitatea produsului, serviciu pentru cazare", () => {
    expect(liniiOblio(LINII, COTE)).toEqual([
      { name: "Cazare", price: 350, quantity: 2, measuringUnit: "noapte", currency: "RON", vatName: "Redusa", vatPercentage: 11, vatIncluded: 1, productType: "Serviciu", save: 0 },
      { name: "Minibar", price: 25.5, quantity: 1, measuringUnit: "buc", currency: "RON", vatName: "Normala", vatPercentage: 21, vatIncluded: 1, productType: "Marfa", save: 0 },
    ]);
    expect(liniiOblio(LINII, COTE, -1).map((l) => l.quantity)).toEqual([-2, -1]);
  });
  it("antetul, cheia de idempotenta si perioada sejurului in mentiuni", () => {
    const p = facturaOblio(FACTURA, PERSOANA, LINII, SETARI, COTE, "2026-09-16");
    expect(p).toMatchObject({
      cif: "RO12345678", seriesName: "LL", issueDate: "2026-09-16", language: "RO", currency: "RON", precision: 2,
      workStation: "Sediu", sendEmail: 0, useStock: 0, idempotencyKey: "pms-inv-1",
    });
    expect(p.mentions).toBe("Servicii de cazare în perioada 14.09.2026 – 16.09.2026");
    expect(p.client.name).toBe("Popescu Ion");
    expect(p.products).toHaveLength(2);
    expect(p.referenceDocument).toBeUndefined();
  });
  it("fara cheie salvata, cheia e derivata din id — aceeasi la fiecare reincercare", () => {
    expect(facturaOblio({ ...FACTURA, oblio_cheie: null }, PERSOANA, LINII, SETARI, COTE, "2026-09-16").idempotencyKey).toBe("pms-inv-1");
  });
  it("notele facturii ajung in mentiuni, dupa perioada", () => {
    const p = facturaOblio({ ...FACTURA, notes: "Plata la receptie" }, PERSOANA, LINII, SETARI, COTE, "2026-09-16");
    expect(p.mentions).toBe("Servicii de cazare în perioada 14.09.2026 – 16.09.2026\nPlata la receptie");
  });
  it("stornarea: cantitati negate, documentul de referinta cu refund, cheie proprie", () => {
    const p = stornoOblio({ ...FACTURA, series: "LL", number: 7, oblio_numar: "0007" }, PERSOANA, LINII, SETARI, COTE, "2026-09-20");
    expect(p.referenceDocument).toEqual({ type: "Factura", seriesName: "LL", number: "0007", refund: 1 });
    expect(p.products.map((l) => l.quantity)).toEqual([-2, -1]);
    expect(p.idempotencyKey).toBe("pms-storno-inv-1");
    expect(p.mentions).toBe("Stornare factură LL 0007");
    expect(p.issueDate).toBe("2026-09-20");
  });
  it("anularea cere doar cif, serie si numarul exact al lui Oblio", () => {
    expect(anulareOblio({ id: "i", series: "LL", number: 7, oblio_numar: "0007" }, SETARI)).toEqual({ cif: "RO12345678", seriesName: "LL", number: "0007" });
    expect(anulareOblio({ id: "i", series: "LL", number: 7 }, SETARI).number).toBe("7");
  });
  it("raspunsul la emitere: serie, numar, link — sau eroare", () => {
    expect(raspunsEmitere({ seriesName: "LL", number: "0007", link: "https://www.oblio.eu/x" })).toEqual({ serie: "LL", numar: "0007", link: "https://www.oblio.eu/x" });
    expect(raspunsEmitere({ seriesName: "LL", number: 7 }).numar).toBe("7");
    expect(() => raspunsEmitere({ link: "x" })).toThrow(EroareOblio);
  });
  it("fiecare actiune are o permisiune de facturare", () => {
    expect(PERMISIUNI).toEqual({
      verifica: "admin", emite: "issue_invoice", storneaza: "create_credit_note",
      anuleaza: "cancel_invoice", "efactura-trimite": "issue_invoice",
    });
  });
});
