// Clientul Oblio (https://www.oblio.eu/api) — singurul loc din proiect care
// știe cum arată API-ul lor. Fără `Deno.*` la nivel de modul: tot ce ține de
// mediu (fetch, credențiale, data de azi) vine ca parametru, ca modulul să
// se testeze din vitest cu un fetch fals — exact ca providers/shelly.ts.
//
// ENDPOINT-URI FOLOSITE (din documentația oficială, 16 septembrie 2026):
//   POST /api/authorize/token              token; client_id = emailul contului,
//                                          client_secret = tokenul din Setări cont
//   GET  /api/nomenclature/companies       firmele contului (verificarea CIF-ului)
//   GET  /api/nomenclature/series?cif=     seriile firmei (verificarea seriei)
//   GET  /api/nomenclature/vat_rates?cif=  cotele de TVA ale firmei
//   POST /api/docs/invoice                 emitere (și stornare, cu referenceDocument)
//   PUT  /api/docs/invoice/cancel          anulare
//   POST /api/docs/einvoice                trimitere în SPV (e-Factura)
//
// Numerotarea e a lui Oblio: nu trimitem `number`/`disableAutoSeries`, ci
// citim seria și numărul din răspuns (raspunsEmitere). Cheia de idempotență
// e fixă per factură (pms-<id>): o reîncercare după un eșec de rețea nu
// emite de două ori. Limite Oblio: 30 de documente / 100 s, alte cereri
// 30 / 10 s — la volumul pensiunii, irelevant.

export const BAZA = "https://www.oblio.eu/api";
export type Fetch = typeof fetch;

export class EroareOblio extends Error {
  constructor(mesaj: string, public status?: number) {
    super(mesaj);
    this.name = "EroareOblio";
  }
}

export interface SetariOblio { cif: string; serie: string; punctLucru?: string; trimiteEFactura?: boolean }
export interface CotaTva { name: string; percentage: number; default?: boolean }
export interface Token { valoare: string; expiraLa: number }

/* Acțiune → permisiunea de facturare cerută (has_billing_permission din
   schema.sql; adminul le are pe toate). `admin` = doar adminul. */
export const PERMISIUNI: Record<string, string> = {
  verifica: "admin",
  emite: "issue_invoice",
  storneaza: "create_credit_note",
  anuleaza: "cancel_invoice",
  "efactura-trimite": "issue_invoice",
};

/* `.trim()` pe credențiale: un spațiu lipit la copiere e cea mai frecventă
   cauză de „invalid client", și e o problemă pe care o putem rezolva. */
export async function obtineToken(f: Fetch, clientId: string, clientSecret: string, acum = Date.now()): Promise<Token> {
  const r = await f(`${BAZA}/authorize/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId.trim(), client_secret: clientSecret.trim() }).toString(),
  });
  const corp: any = await r.json().catch(() => ({}));
  if (!r.ok || !corp?.access_token) {
    throw new EroareOblio(corp?.statusMessage || corp?.error_description || `Oblio a refuzat autentificarea (HTTP ${r.status}).`, r.status);
  }
  // Un minut mai devreme decât spun ei, ca să nu prindem expirarea în zbor.
  return { valoare: String(corp.access_token), expiraLa: acum + (Number(corp.expires_in) || 3600) * 1000 - 60_000 };
}

export function tokenValabil(t: Token | null, acum = Date.now()): boolean {
  return !!t && t.expiraLa > acum;
}

/* Oblio pune codul și în corp (`status: 400`, `statusMessage`), uneori cu
   HTTP 200 — de aceea se citesc amândouă. Întoarce `data`. */
export async function cereOblio(
  f: Fetch, token: string, metoda: "GET" | "POST" | "PUT" | "DELETE", cale: string, corp?: unknown,
): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (corp !== undefined) headers["Content-Type"] = "application/json";
  const r = await f(`${BAZA}${cale}`, { method: metoda, headers, body: corp !== undefined ? JSON.stringify(corp) : undefined });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const statusIntern = Number(json?.status) || 0;
  if (!r.ok || (statusIntern && statusIntern !== 200)) {
    const mesaj = json?.statusMessage || json?.message || text.slice(0, 200) || `Oblio a răspuns cu HTTP ${r.status}.`;
    throw new EroareOblio(String(mesaj), statusIntern || r.status);
  }
  return json?.data ?? json;
}

/* Nomenclatorul de cote al lor scrie procentul în `percent`. `percentage`
   apare la produse, și de acolo a fost luat din greșeală la prima scriere:
   `Number(undefined)` dă NaN, iar NaN nu e egal cu nimic, deci `alegeCota`
   n-ar mai fi găsit nicio cotă și nicio factură n-ar mai fi plecat. S-a
   văzut pe 17 septembrie 2026, la „Verifică legătura": ecranul arăta cotele
   fără procent. Citim amândouă numele, ca o redenumire la ei să nu ne mai
   coste o zi. O intrare fără procent citibil se aruncă: nepotrivindu-se
   niciodată, ar fi doar o cotă fantomă în listă. */
export function normalizeazaCote(date: unknown): CotaTva[] {
  return (Array.isArray(date) ? date : [])
    .map((c: any) => ({
      name: String(c?.name ?? ""),
      percentage: Number(c?.percent ?? c?.percentage),
      default: !!c?.default,
    }))
    .filter((c) => c.name !== "" && Number.isFinite(c.percentage));
}

/* Cota PMS (21 / 11 / 0) → intrarea din nomenclatorul Oblio cu același
   procent; la egalitate, cea marcată implicită. Lipsă = oprim emiterea. */
export function alegeCota(cote: CotaTva[], procent: number): CotaTva {
  const potrivite = cote.filter((c) => Number(c.percentage) === Number(procent));
  const aleasa = potrivite.find((c) => c.default) || potrivite[0];
  if (!aleasa) {
    throw new EroareOblio(`Cota de TVA ${procent}% nu există în contul Oblio — adaug-o în Oblio (Setări → Cote TVA) sau schimbă cota produsului.`);
  }
  return aleasa;
}

/* Data facturii e ziua de la pensiune, nu UTC: la 00:30 la Vaslui e încă
   „ieri" în UTC. `en-CA` dă direct YYYY-MM-DD. */
export function aziBucuresti(acum = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(acum);
}
export function ziRo(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export interface ClientPms {
  kind: string; last_name?: string | null; first_name?: string | null; cnp?: string | null;
  company_name?: string | null; cui?: string | null; reg_com?: string | null; contact_name?: string | null;
  address?: string | null; city?: string | null; county?: string | null; country?: string | null;
  email?: string | null; phone?: string | null;
}
export interface LiniePms {
  name: string; quantity: number | string; unit_price: number | string; vat_rate: number | string;
  unit?: string | null; category?: string | null;
}
/* Unitatea și categoria liniei: din produsul liniei; dacă lipsește, din
   poziția de folio legată (invoice_item_links → folio_items → products);
   altfel „buc" și categorie goală. Contează pentru că `liniiOblio` alege din
   ele `measuringUnit` și `productType`: o linie fără produs pleca la Oblio
   drept „Marfa" / „buc", inclusiv cazarea.

   Unitatea scrisă PE LINIE (`invoice_items.unit`, din 17 septembrie 2026)
   trece înaintea tuturor: e instantaneul de la crearea facturii și e ce vede
   omul pe coala din PMS, în coloana „UM". Documentul din Oblio trebuie să
   spună același lucru — aceeași regulă stă în `src/lib/unitate.js`, iar
   `src/unitate-paritate.test.js` le ține laolaltă. */
export function formeazaLinie(l: any) {
  const prod = l?.products;
  const legaturi = Array.isArray(l?.invoice_item_links) ? l.invoice_item_links : [];
  const dinFolio = legaturi.map((x: any) => x?.folio_items).find(Boolean);
  const prodFolio = dinFolio?.products;
  return { ...l, unit: l?.unit || prod?.unit || prodFolio?.unit || "buc", category: prod?.category || dinFolio?.category || "" };
}

export interface FacturaPms {
  id: string; series?: string | null; number?: number | null; oblio_numar?: string | null;
  oblio_cheie?: string | null; notes?: string | null;
  service_date_start?: string | null; service_date_end?: string | null;
  delegat_nume?: string | null; delegat_ci_serie?: string | null; delegat_ci_numar?: string | null;
}

/* Delegatul, ca rand de mentiuni: Oblio n-are camp propriu pentru el, dar
   `mentions` se tipareste pe document. Asa documentul lor spune acelasi lucru
   ca rubrica din subsolul colii din PMS. Fara delegat completat, rand gol —
   nu scriem „Delegat: " degeaba. */
export function delegatMentiune(f: FacturaPms): string {
  const act = [
    f.delegat_ci_serie ? `seria ${f.delegat_ci_serie}` : "",
    f.delegat_ci_numar ? `nr. ${f.delegat_ci_numar}` : "",
  ].filter(Boolean).join(" ");
  const parti = [f.delegat_nume || "", act ? `CI ${act}` : ""].filter(Boolean);
  return parti.length ? `Delegat: ${parti.join(", ")}` : "";
}

/* Clientul vine din billing_customers, nu din nomenclatorul lor (save: 0).
   Firmă cu CUI cu „RO" = plătitoare de TVA; persoană: CNP-ul, dacă e. */
export function clientOblio(c: ClientPms) {
  const firma = c.kind === "company";
  const nume = firma ? (c.company_name || "") : [c.last_name, c.first_name].filter(Boolean).join(" ");
  const cui = (c.cui || "").trim();
  return {
    cif: firma ? cui : (c.cnp || "").trim(),
    name: nume.trim(),
    rc: firma ? (c.reg_com || "") : "",
    address: c.address || "",
    city: c.city || "",
    state: c.county || "",
    country: c.country || "România",
    email: c.email || "",
    phone: c.phone || "",
    contact: firma ? (c.contact_name || "") : "",
    vatPayer: firma && /^ro/i.test(cui),
    save: 0,
  };
}

/* Prețul unitar e cu TVA inclus (lib/money.js), deci vatIncluded: 1 și
   Oblio recalculează exact ce a calculat PMS-ul. `semn` = -1 la stornare. */
export function liniiOblio(linii: LiniePms[], cote: CotaTva[], semn: 1 | -1 = 1) {
  return linii.map((l) => {
    const cota = alegeCota(cote, Number(l.vat_rate));
    return {
      name: l.name,
      price: Number(l.unit_price),
      quantity: semn * Number(l.quantity),
      measuringUnit: l.unit || "buc",
      currency: "RON",
      vatName: cota.name,
      vatPercentage: Number(cota.percentage),
      vatIncluded: 1,
      productType: l.category === "cazare" ? "Serviciu" : "Marfa",
      save: 0,
    };
  });
}

function antet(setari: SetariOblio, azi: string) {
  return {
    cif: setari.cif.trim(), seriesName: setari.serie.trim(), issueDate: azi,
    language: "RO", currency: "RON", precision: 2,
    workStation: (setari.punctLucru || "Sediu").trim(),
    sendEmail: 0, useStock: 0,
  };
}

export function facturaOblio(factura: FacturaPms, client: ClientPms, linii: LiniePms[], setari: SetariOblio, cote: CotaTva[], azi: string) {
  const perioada = factura.service_date_start && factura.service_date_end
    ? `Servicii de cazare în perioada ${ziRo(factura.service_date_start)} – ${ziRo(factura.service_date_end)}`
    : "";
  return {
    ...antet(setari, azi),
    mentions: [perioada, delegatMentiune(factura), factura.notes || ""].filter(Boolean).join("\n"),
    idempotencyKey: factura.oblio_cheie || `pms-${factura.id}`,
    client: clientOblio(client),
    products: liniiOblio(linii, cote),
  };
}

/* Stornarea e tot un POST /docs/invoice: liniile originalului cu cantități
   negate și documentul de referință cu refund: 1. Oblio dă numărul. */
export function stornoOblio(factura: FacturaPms, client: ClientPms, linii: LiniePms[], setari: SetariOblio, cote: CotaTva[], azi: string) {
  const numar = factura.oblio_numar || String(factura.number ?? "");
  return {
    ...antet(setari, azi),
    mentions: `Stornare factură ${factura.series} ${numar}`,
    idempotencyKey: `pms-storno-${factura.id}`,
    client: clientOblio(client),
    products: liniiOblio(linii, cote, -1),
    referenceDocument: { type: "Factura", seriesName: factura.series || "", number: numar, refund: 1 },
  };
}

export function anulareOblio(factura: FacturaPms, setari: SetariOblio) {
  return { cif: setari.cif.trim(), seriesName: factura.series || "", number: factura.oblio_numar || String(factura.number ?? "") };
}

export function raspunsEmitere(data: any): { serie: string; numar: string; link: string } {
  const serie = String(data?.seriesName || "");
  const numar = data?.number == null ? "" : String(data.number);
  const link = String(data?.link || "");
  if (!serie || !numar) throw new EroareOblio("Oblio a răspuns fără serie sau număr.");
  return { serie, numar, link };
}
