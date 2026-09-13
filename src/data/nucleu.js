/* Acces la date pentru NUCLEUL aplicatiei: camerele, oaspetii, rezervarile,
 * grupurile, tarifele si nomenclatoarele.
 *
 * Ultimul domeniu migrat in `src/data/`, deliberat: e calea de pornire. O
 * greseala aici nu strica un ecran, ci lasa aplicatia moarta la boot — de-aia
 * a fost lasat la urma, dupa ce tiparul se verificase pe domenii izolate.
 *
 * Aceleasi reguli ca in restul stratului: doar cereri. Ce iese de aici are
 * deja forma folosita de aplicatie (camelCase), nu randuri brute — traducerea
 * o fac maparele din ./mapari.js.
 *
 * Din 13 septembrie 2026 (faza 1 din docs/audit-2026-09.md, masuratorile in
 * docs/faza1.md) rezervarile NU se mai incarca toate: vine o FEREASTRA de
 * timp, iar restul se cere cand calendarul ajunge acolo. Vezi `loadAll`,
 * `incarcaPerioada` si `pms_fereastra` din schema.sql.
 */
import { supabase } from "../supabase.js";
import {
  camelRes, camelOcupare, camelGuest, camelRoom, camelGroup,
  camelBillingCustomer, camelVatRate, camelProduct, camelPaymentMethod,
} from "./mapari.js";

/* Trimite doar diferentele: randuri noi/modificate, prin upsert.
 *
 * NU sterge nimic. Pana pe 13 septembrie 2026 deducea stergerile din
 * diferenta `before` − `after`, si cu toate randurile in browser era corect.
 * Cu o stare locala PARTIALA (fereastra de rezervari, cache-ul de oaspeti)
 * devine o arma: o pagina de calendar abia sosita, care lipseste din
 * `next`-ul construit de un ecran cu o inchidere veche, ar fi fost STEARSA
 * din baza. Stergerile sunt acum explicite — `stergeRanduri` — iar pentru
 * tabelele mici, incarcate intregi, exista `syncTableIntreg`. */
export async function syncTable(table, before, after, toRow) {
  const prevById = new Map((before || []).map((x) => [x.id, x]));
  const schimbate = (after || [])
    .map((x, idx) => [x, idx])
    .filter(([x]) => {
      const old = prevById.get(x.id);
      return !old || JSON.stringify(x) !== JSON.stringify(old);
    })
    .map(([x, idx]) => toRow(x, idx));
  if (!schimbate.length) return [];
  /* .select() ne intoarce randurile asa cum au ramas in baza, cu tot ce
     a completat serverul (de ex. updated_at pus de trigger) — apelantul
     le poate folosi ca sa-si actualizeze starea locala. */
  const { data, error } = await supabase.from(table).upsert(schimbate, { onConflict: "id" }).select();
  if (error) throw error;
  return data || [];
}

/* Pentru tabelele mici care stau INTREGI in browser (camere, tarife online,
   clienti de facturare, TVA, produse, metode de plata): acolo diferenta
   before/after e completa, deci un rand disparut chiar inseamna „sters". */
export async function syncTableIntreg(table, before, after, toRow) {
  const ramase = new Set((after || []).map((x) => x.id));
  const sterse = (before || []).filter((x) => !ramase.has(x.id)).map((x) => x.id);
  await stergeRanduri(table, sterse);
  return syncTable(table, before, after, toRow);
}

export async function stergeRanduri(table, ids) {
  if (!ids || !ids.length) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw error;
}

/* Uneste doua liste dupa id: randurile din `prioritare` castiga, restul din
   `existente` raman. Ordinea: intai cele existente (in ordinea lor), apoi
   cele noi. E operatia din spatele ferestrei glisante — o pagina de calendar
   sosita mai tarziu se ADAUGA la ce e deja in browser, nu il inlocuieste. */
export function uneste(existente, prioritare) {
  const noi = new Map((prioritare || []).map((x) => [x.id, x]));
  const rezultat = (existente || []).map((x) => (noi.has(x.id) ? noi.get(x.id) : x));
  const vazute = new Set((existente || []).map((x) => x.id));
  for (const x of prioritare || []) if (!vazute.has(x.id)) rezultat.push(x);
  return rezultat;
}

/* Adauga la `existente` doar randurile din `noi` cu id necunoscut; ce exista
   deja ramane neatins (poate avea stampile mai noi decat ce vine de la
   server, de la o salvare in curs). Perechea lui `uneste`, pentru bucatile de
   fereastra sosite mai tarziu. */
export function doarNoi(existente, noi) {
  const vazute = new Set((existente || []).map((x) => x.id));
  const adaugate = (noi || []).filter((x) => !vazute.has(x.id));
  return adaugate.length ? [...(existente || []), ...adaugate] : (existente || []);
}

/* rates/seasons au forma diferita de restul tabelelor (rates: o linie per
   tip de camera; seasons: cheie compusa id+room_type, o "linie logica" din
   JS devine 2 randuri, cate unul per tip) — nu se potrivesc cu syncTable,
   asa ca le sincronizam separat. Suplimentele sunt globale, nu per tip de
   camera, dar se scriu pe ambele randuri din rates ca sa ramana totul
   intr-un singur tabel. */
export async function saveRatesAndSeasons(beforeRates, afterRates) {
  const base = afterRates.base || {};
  const rateRows = ["tiny", "loft"].map((t) => ({
    room_type: t,
    base_price: Number(base[t]) || 0,
    single_price: base[t + "Single"] ? Number(base[t + "Single"]) : null,
    adult_supplement: Number(base.adultSupplement) || 0,
    child_supplement: Number(base.childSupplement) || 0,
  }));
  const { error: rateErr } = await supabase.from("rates").upsert(rateRows, { onConflict: "room_type" });
  if (rateErr) throw rateErr;

  const beforeIds = new Set((beforeRates.seasons || []).map((s) => s.id));
  const afterIds = new Set((afterRates.seasons || []).map((s) => s.id));
  const removedIds = [...beforeIds].filter((id) => !afterIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from("seasons").delete().in("id", removedIds);
    if (error) throw error;
  }
  const seasonRows = (afterRates.seasons || []).flatMap((s) => ["tiny", "loft"].map((t) => ({
    id: s.id, name: s.name, start_md: s.start, end_md: s.end,
    room_type: t, price: Number(s[t]) || 0, priority: 0,
  })));
  if (seasonRows.length) {
    const { error } = await supabase.from("seasons").upsert(seasonRows, { onConflict: "id,room_type" });
    if (error) throw error;
  }
}

/* ---------------------------------------------------------------
   FEREASTRA DE REZERVARI
----------------------------------------------------------------*/

/* Cat se incarca la pornire: o luna in urma (plecarile recente, pentru
   Azi si pentru rapoartele lunii curente) si un an si ceva inainte (tot ce
   arata calendarul fara sa deruleze cineva dincolo). Cifrele vin din
   docs/faza1.md: pe 16 camere, fereastra asta are ~2.800 de randuri
   indiferent cati ani de istoric s-au adunat, si tot ce face aplicatia pe
   ea sta sub 10 ms. */
export const FEREASTRA_ZILE_IN_URMA = 30;
export const FEREASTRA_ZILE_INAINTE = 400;

/* Cate zile in plus se cer cand calendarul iese din fereastra, ca o
   derulare lenta sa nu insemne o cerere la fiecare saptamana. */
export const PAS_LARGIRE_ZILE = 60;

const ZI_MS = 86400000;

/* Fereastra implicita, ca perechi ISO. `de`/`pana` sunt miezuri de noapte
   LOCALE, ca zilele calendarului — de aceea se calculeaza in JS, nu in SQL. */
export function fereastraImplicita(acum = new Date()) {
  const zi = new Date(acum); zi.setHours(0, 0, 0, 0);
  return {
    de: new Date(zi.getTime() - FEREASTRA_ZILE_IN_URMA * ZI_MS).toISOString(),
    pana: new Date(zi.getTime() + FEREASTRA_ZILE_INAINTE * ZI_MS).toISOString(),
  };
}

/* Ce trebuie cerut ca fereastra incarcata [fer.de, fer.pana] sa acopere si
   [de, pana]: zero, una sau doua bucati (in stanga si/sau in dreapta), fiecare
   largita cu PAS_LARGIRE_ZILE dincolo de ce s-a cerut. Intoarce si fereastra
   rezultata. Functie pura — testata in src/fereastra.test.js. */
export function bucatiLipsa(fer, de, pana, pas = PAS_LARGIRE_ZILE) {
  const bucati = [];
  let noua = { ...fer };
  if (de < fer.de) {
    const cereDe = new Date(new Date(de).getTime() - pas * ZI_MS).toISOString();
    bucati.push({ de: cereDe, pana: fer.de });
    noua.de = cereDe;
  }
  if (pana > fer.pana) {
    const cerePana = new Date(new Date(pana).getTime() + pas * ZI_MS).toISOString();
    bucati.push({ de: fer.pana, pana: cerePana });
    noua.pana = cerePana;
  }
  return { bucati, fereastra: noua };
}

/* Traduce raspunsul functiei `pms_fereastra` in obiectele aplicatiei.
   Blocajele (source = 'blocaj') sunt tot randuri din `reservations`, dar
   aplicatia le tine separat. */
function mapeazaFereastra(fer, doarOcupare) {
  const res = fer?.reservations || [];
  return {
    reservations: res.filter((r) => r.source !== "blocaj").map(doarOcupare ? camelOcupare : camelRes),
    blocks: res.filter((r) => r.source === "blocaj").map((b) => ({
      id: b.id, roomId: b.room_id, start: b.checkin, end: b.checkout, reason: b.notes || "",
    })),
    groups: (fer?.groups || []).map(camelGroup),
    guests: (fer?.guests || []).map(camelGuest),
  };
}

/* O singura cerere pentru rezervari + grupurile + oaspetii lor: pe 4G, fiecare
   dus-intors costa 100–200 ms, iar trei cereri inlantuite (rezervari, apoi
   grupurile lor, apoi oaspetii) ar fi insemnat o jumatate de secunda la
   fiecare largire a calendarului. Functia din baza (`pms_fereastra`) e
   SECURITY INVOKER: RLS se aplica inauntru, iar camerista primeste vederea
   de ocupare, fara nume si fara oaspeti. Raspunsul e un singur rand JSON,
   deci plafonul PostgREST de 1.000 de randuri nu-l atinge. */
async function cereFereastra(de, pana, cuRestante) {
  const { data, error } = await supabase.rpc("pms_fereastra", { p_de: de, p_pana: pana, p_cu_restante: cuRestante });
  if (error) throw error;
  return data;
}

/* Rezervarile dintr-un interval anume (orice status), cu grupurile si
   oaspetii lor — pentru calendar, cand iese din fereastra incarcata. */
export async function incarcaPerioada(rol, de, pana) {
  return mapeazaFereastra(await cereFereastra(de, pana, false), rol === "housekeeping");
}

/* `rol` decide DE UNDE se citesc rezervarile.
 *
 * Camerista nu mai citeste tabelul `reservations`, ci vederea
 * `rezervari_ocupare`. Pana pe 9 septembrie 2026 politica de citire era
 * `using (true)`, deci ii ajungeau in browser numele, telefonul, notele si
 * preturile fiecarei rezervari — plus `guest_code`, codul din linkul care
 * deschide usa. Cu el putea deschide orice camera ocupata, ocolind chiar
 * glisorul din ecranul ei, care e blocat tocmai pe camerele ocupate.
 * Interfata ascundea toate astea („doarCitire" in CalendarView), dar
 * ascunderea in interfata nu e o restrictie — DevTools o trece.
 *
 * `guests` si `res_groups` vin goale pentru cameristă (RLS, in functia din
 * baza). Nu e eroare si nu e tratat ca atare: calendarul ei nu deseneaza nume.
 *
 * `fereastra` = {de, pana} ISO. Pe langa rezervarile din interval vin si cele
 * „restante": deschise (pending/confirmed/protocol/checkedin) cu plecarea
 * inainte de fereastra — exact ce trebuie sa vada night audit-ul, oricat de
 * vechi ar fi. Rezervarile deschise cu sosirea DUPA fereastra nu vin la
 * pornire; le aduce calendarul cand ajunge acolo (incarcaPerioada). */
export async function loadAll(rol, fereastra = fereastraImplicita()) {
  const doarOcupare = rol === "housekeeping";
  const [rooms, fer, rates, seasons, onlineTiers, billingCustomers, vatRates, products, paymentMethods] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order"),
    cereFereastra(fereastra.de, fereastra.pana, true),
    supabase.from("rates").select("*").order("room_type"),
    supabase.from("seasons").select("*"),
    supabase.from("online_pricing_tiers").select("*").order("sort_order"),
    supabase.from("billing_customers").select("*"),
    supabase.from("vat_rates").select("*"),
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("payment_methods").select("*").order("sort_order"),
  ]);
  for (const r of [rooms, rates, seasons, onlineTiers, billingCustomers, vatRates, products, paymentMethods]) if (r.error) throw r.error;

  const base = {};
  rates.data.forEach((r) => {
    base[r.room_type] = Number(r.base_price);
    base[r.room_type + "Single"] = r.single_price != null ? Number(r.single_price) : 0;
    base.adultSupplement = Number(r.adult_supplement) || 0;
    base.childSupplement = Number(r.child_supplement) || 0;
  });
  const sez = {};
  seasons.data.forEach((s) => {
    sez[s.id] = sez[s.id] || { id: s.id, name: s.name, start: s.start_md, end: s.end_md };
    sez[s.id][s.room_type] = Number(s.price);
  });

  return {
    rooms: rooms.data.map(camelRoom),
    ...mapeazaFereastra(fer, doarOcupare),
    fereastra,
    rates: { base, seasons: Object.values(sez) },
    onlinePricing: onlineTiers.data.map((t) => ({
      id: t.id, min: t.min_occ, max: t.max_occ, adjustmentPct: Number(t.adjustment_pct),
    })),
    billingCustomers: billingCustomers.data.map(camelBillingCustomer),
    vatRates: vatRates.data.map(camelVatRate),
    products: products.data.map(camelProduct),
    paymentMethods: paymentMethods.data.map(camelPaymentMethod),
  };
}
