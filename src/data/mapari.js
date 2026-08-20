/* Traducerea intre randurile din Postgres (snake_case) si obiectele folosite
 * in aplicatie (camelCase).
 *
 * Stau aici, langa stratul de acces la date, nu in pms-app.jsx: sunt parte din
 * granita cu baza, nu din interfata. Un modul din `src/data/` care intoarce
 * randuri brute ar muta traducerea inapoi in componente si ar face granita
 * permeabila — ce iese din `data/` are deja forma pe care o foloseste restul
 * aplicatiei.
 */

export const camelRes = (r) => ({
  id: r.id, roomId: r.room_id, guestId: r.guest_id, groupId: r.group_id,
  checkin: r.checkin, checkout: r.checkout, status: r.status,
  adults: r.adults, children: r.children, priceOverride: r.price_override,
  bookedPrice: r.booked_price,
  source: r.source, tags: r.tags || [], notes: r.notes || "",
  occupantLastName: r.occupant_last_name || "", occupantFirstName: r.occupant_first_name || "",
  occupantPhone: r.occupant_phone || "", occupantName:
    [r.occupant_last_name, r.occupant_first_name].filter(Boolean).join(" "),
  messages: r.messages || [], seeded: r.seeded,
  billingCustomerId: r.billing_customer_id || "",
  updatedAt: r.updated_at || null,
});
export const snakeRes = (r) => ({
  id: r.id, room_id: r.roomId, guest_id: r.guestId || null, group_id: r.groupId || null,
  checkin: new Date(r.checkin).toISOString(), checkout: new Date(r.checkout).toISOString(),
  status: r.status, adults: r.adults ?? 2, children: r.children ?? 0,
  price_override: r.priceOverride ?? null, booked_price: r.bookedPrice ?? null,
  source: r.source || "direct",
  tags: r.tags || [], notes: r.notes || null,
  occupant_last_name: r.occupantLastName || null,
  occupant_first_name: r.occupantFirstName || null,
  occupant_phone: r.occupantPhone || null,
  messages: r.messages || [], seeded: !!r.seeded,
  billing_customer_id: r.billingCustomerId || null,
  /* Stampila citita la incarcare, trimisa inapoi neschimbata. Baza o
     compara cu a ei si refuza scrierea daca randul s-a schimbat intre
     timp (vezi triggerul reservations_stamp_updated_at din schema.sql).
     Pentru randuri noi e null — triggerul o completeaza la inserare. */
  updated_at: r.updatedAt || null,
});
export const camelGuest = (g) => ({
  id: g.id, lastName: g.last_name, firstName: g.first_name, name:
    [g.last_name, g.first_name].filter(Boolean).join(" "),
  phone: g.phone, email: g.email || "", address: g.address || "",
  city: g.city, county: g.county, country: g.country, notes: g.notes || "",
  salutation: g.salutation || "", seeded: g.seeded,
});
export const snakeGuest = (g) => ({
  id: g.id, last_name: g.lastName || "-", first_name: g.firstName || "-",
  phone: g.phone || "-", email: g.email || null, address: g.address || null,
  city: g.city || "-", county: g.county || "-", country: g.country || "România",
  notes: g.notes || null, salutation: g.salutation || null, seeded: !!g.seeded,
});
export const camelRoom = (r) => ({
  id: r.id, name: r.name, type: r.type, capacity: r.capacity,
  boilerId: r.shelly_id || "", ventId: r.vent_id || "", sensiboId: r.sensibo_id || "",
  icalToken: r.ical_token, sortOrder: r.sort_order,
  /* Yala electronica a camerei. Trebuie sa treaca prin AMBELE mappere:
     un camp prezent doar in formular, dar absent din snakeRoom, s-ar
     pierde tacut la salvare — exact ce s-a intamplat cu tarifele. */
  accessProvider: r.access_provider || "",
  accessLockId: r.access_lock_id || "",
  accessLockName: r.access_lock_name || "",
});
export const snakeRoom = (r, idx) => ({
  id: r.id, name: r.name, type: r.type, capacity: r.capacity ?? 2,
  shelly_id: r.boilerId || null, vent_id: r.ventId || null, sensibo_id: r.sensiboId || null,
  sort_order: r.sortOrder ?? idx,
  access_provider: r.accessLockId ? (r.accessProvider || "ttlock") : null,
  access_lock_id: r.accessLockId || null,
  access_lock_name: r.accessLockName || null,
});
export const camelGroup = (g) => ({
  id: g.id, name: g.name, mainGuestId: g.main_guest_id,
  notes: g.notes || "", createdAt: g.created_at, seeded: g.seeded,
});
export const snakeGroup = (g) => ({
  id: g.id, name: g.name, main_guest_id: g.mainGuestId || null,
  notes: g.notes || null, seeded: !!g.seeded,
});
export const snakeTier = (t, idx) => ({
  id: t.id, min_occ: Math.max(0, Math.min(100, Number(t.min) || 0)),
  max_occ: Math.max(0, Math.min(100, Number(t.max) || 0)),
  adjustment_pct: Number(t.adjustmentPct) || 0, sort_order: idx,
});

/* --- FACTURARE: client de facturare, TVA, produse ----------------
   camelBillingCustomer/snakeBillingCustomer s-au mutat in src/data/mapari.js,
   langa stratul de acces la date — sunt traducere de randuri, nu interfata.
   Se importa mai sus, impreuna cu restul. */

export const camelVatRate = (v) => ({ id: v.id, label: v.label, rate: Number(v.rate), active: v.active });
export const snakeVatRate = (v) => ({ id: v.id, label: v.label, rate: Number(v.rate) || 0, active: !!v.active });

export const camelPaymentMethod = (m) => ({ id: m.id, label: m.label, active: m.active, sortOrder: m.sort_order || 0 });
export const snakePaymentMethod = (m) => ({ id: m.id, label: m.label, active: !!m.active, sort_order: m.sortOrder || 0 });

export const camelProduct = (p) => ({
  id: p.id, name: p.name, internalCode: p.internal_code || "", accountingCode: p.accounting_code || "",
  category: p.category, unit: p.unit, vatRateId: p.vat_rate_id,
  defaultPrice: Number(p.default_price) || 0, active: p.active,
  billingMode: p.billing_mode, sortOrder: p.sort_order,
});
export const snakeProduct = (p, idx) => ({
  id: p.id, name: p.name, internal_code: p.internalCode || null, accounting_code: p.accountingCode || null,
  category: p.category, unit: p.unit || "buc", vat_rate_id: p.vatRateId,
  default_price: Number(p.defaultPrice) || 0, active: !!p.active,
  billing_mode: p.billingMode || "separate", sort_order: p.sortOrder ?? idx,
});

export const camelBillingCustomer = (c) => ({
  id: c.id, kind: c.kind,
  lastName: c.last_name || "", firstName: c.first_name || "", cnp: c.cnp || "",
  companyName: c.company_name || "", cui: c.cui || "", regCom: c.reg_com || "",
  contactName: c.contact_name || "",
  address: c.address || "", city: c.city || "", county: c.county || "",
  postalCode: c.postal_code || "", country: c.country || "România",
  email: c.email || "", phone: c.phone || "", guestId: c.guest_id || "",
  createdAt: c.created_at,
});

export const snakeBillingCustomer = (c) => ({
  id: c.id, kind: c.kind,
  last_name: c.kind === "person" ? (c.lastName || null) : null,
  first_name: c.kind === "person" ? (c.firstName || null) : null,
  cnp: c.kind === "person" ? (c.cnp || null) : null,
  company_name: c.kind === "company" ? (c.companyName || null) : null,
  cui: c.kind === "company" ? (c.cui || null) : null,
  reg_com: c.kind === "company" ? (c.regCom || null) : null,
  contact_name: c.kind === "company" ? (c.contactName || null) : null,
  address: c.address || "", city: c.city || "", county: c.county || "",
  postal_code: c.postalCode || null, country: c.country || "România",
  email: c.email || null, phone: c.phone || null, guest_id: c.guestId || null,
});
