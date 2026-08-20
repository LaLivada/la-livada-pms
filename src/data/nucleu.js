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
 */
import { supabase } from "../supabase.js";
import {
  camelRes, camelGuest, camelRoom, camelGroup,
  camelBillingCustomer, camelVatRate, camelProduct, camelPaymentMethod,
} from "./mapari.js";

/* Trimite doar diferentele: randuri noi/modificate prin upsert,
   randuri disparute prin delete. */
export async function syncTable(table, before, after, toRow) {
  const prevById = new Map((before || []).map((x) => [x.id, x]));
  const nextById = new Map((after || []).map((x) => [x.id, x]));
  const schimbate = (after || [])
    .map((x, idx) => [x, idx])
    .filter(([x]) => {
      const old = prevById.get(x.id);
      return !old || JSON.stringify(x) !== JSON.stringify(old);
    })
    .map(([x, idx]) => toRow(x, idx));
  const sterse = (before || []).filter((x) => !nextById.has(x.id)).map((x) => x.id);

  if (sterse.length) {
    const { error } = await supabase.from(table).delete().in("id", sterse);
    if (error) throw error;
  }
  if (schimbate.length) {
    /* .select() ne intoarce randurile asa cum au ramas in baza, cu tot ce
       a completat serverul (de ex. updated_at pus de trigger) — apelantul
       le poate folosi ca sa-si actualizeze starea locala. */
    const { data, error } = await supabase.from(table).upsert(schimbate, { onConflict: "id" }).select();
    if (error) throw error;
    return data || [];
  }
  return [];
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

export async function loadAll() {
  const [rooms, guests, groups, res, rates, seasons, onlineTiers, billingCustomers, vatRates, products, paymentMethods] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order"),
    supabase.from("guests").select("*"),
    supabase.from("res_groups").select("*"),
    supabase.from("reservations").select("*"),
    supabase.from("rates").select("*").order("room_type"),
    supabase.from("seasons").select("*"),
    supabase.from("online_pricing_tiers").select("*").order("sort_order"),
    supabase.from("billing_customers").select("*"),
    supabase.from("vat_rates").select("*"),
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("payment_methods").select("*").order("sort_order"),
  ]);
  for (const r of [rooms, guests, groups, res, rates, seasons, onlineTiers, billingCustomers, vatRates, products, paymentMethods]) if (r.error) throw r.error;

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
    guests: guests.data.map(camelGuest),
    groups: groups.data.map(camelGroup),
    reservations: res.data.filter((r) => r.source !== "blocaj").map(camelRes),
    blocks: res.data.filter((r) => r.source === "blocaj").map((b) => ({
      id: b.id, roomId: b.room_id, start: b.checkin, end: b.checkout, reason: b.notes || "",
    })),
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

