import fs from "fs";
const p = "src/pms-app.jsx";
let s = fs.readFileSync(p, "utf8");
const orig = s;

// ---- 1. Adauga stratul de acces la tabele, inainte de "const K = {"
const anchor = "const K = {";
const i = s.indexOf(anchor);
if (i === -1) { console.error("Nu am gasit K"); process.exit(1); }

const db = `/* ---------------------------------------------------------------
   STRAT DE DATE — tabele reale in Supabase
   Citirile aduc fiecare tabel separat; scrierile compara lista veche
   cu cea noua si trimit DOAR randurile schimbate, ca doua persoane
   care lucreaza simultan sa nu se suprascrie reciproc.
----------------------------------------------------------------*/
const camelRes = (r) => ({
  id: r.id, roomId: r.room_id, guestId: r.guest_id, groupId: r.group_id,
  checkin: r.checkin, checkout: r.checkout, status: r.status,
  adults: r.adults, children: r.children, priceOverride: r.price_override,
  source: r.source, tags: r.tags || [], notes: r.notes || "",
  occupantLastName: r.occupant_last_name || "", occupantFirstName: r.occupant_first_name || "",
  occupantPhone: r.occupant_phone || "", occupantName:
    [r.occupant_last_name, r.occupant_first_name].filter(Boolean).join(" "),
  messages: r.messages || [], seeded: r.seeded,
});
const snakeRes = (r) => ({
  id: r.id, room_id: r.roomId, guest_id: r.guestId || null, group_id: r.groupId || null,
  checkin: new Date(r.checkin).toISOString(), checkout: new Date(r.checkout).toISOString(),
  status: r.status, adults: r.adults ?? 2, children: r.children ?? 0,
  price_override: r.priceOverride ?? null, source: r.source || "direct",
  tags: r.tags || [], notes: r.notes || null,
  occupant_last_name: r.occupantLastName || null,
  occupant_first_name: r.occupantFirstName || null,
  occupant_phone: r.occupantPhone || null,
  messages: r.messages || [], seeded: !!r.seeded,
});
const camelGuest = (g) => ({
  id: g.id, lastName: g.last_name, firstName: g.first_name, name:
    [g.last_name, g.first_name].filter(Boolean).join(" "),
  phone: g.phone, email: g.email || "", address: g.address || "",
  city: g.city, county: g.county, country: g.country, notes: g.notes || "", seeded: g.seeded,
});
const snakeGuest = (g) => ({
  id: g.id, last_name: g.lastName || "-", first_name: g.firstName || "-",
  phone: g.phone || "-", email: g.email || null, address: g.address || null,
  city: g.city || "-", county: g.county || "-", country: g.country || "România",
  notes: g.notes || null, seeded: !!g.seeded,
});
const camelRoom = (r) => ({
  id: r.id, name: r.name, type: r.type, capacity: r.capacity,
  shellyId: r.shelly_id || "", sensiboId: r.sensibo_id || "",
  icalToken: r.ical_token, sortOrder: r.sort_order,
});
const snakeRoom = (r, idx) => ({
  id: r.id, name: r.name, type: r.type, capacity: r.capacity ?? 2,
  shelly_id: r.shellyId || null, sensibo_id: r.sensiboId || null,
  sort_order: r.sortOrder ?? idx,
});
const camelGroup = (g) => ({
  id: g.id, name: g.name, mainGuestId: g.main_guest_id,
  notes: g.notes || "", createdAt: g.created_at, seeded: g.seeded,
});
const snakeGroup = (g) => ({
  id: g.id, name: g.name, main_guest_id: g.mainGuestId || null,
  notes: g.notes || null, seeded: !!g.seeded,
});

/* Trimite doar diferentele: randuri noi/modificate prin upsert,
   randuri disparute prin delete. */
async function syncTable(table, before, after, toRow) {
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
    const { error } = await supabase.from(table).upsert(schimbate, { onConflict: "id" });
    if (error) throw error;
  }
}

async function loadAll() {
  const [rooms, guests, groups, res, rates, seasons] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order"),
    supabase.from("guests").select("*"),
    supabase.from("res_groups").select("*"),
    supabase.from("reservations").select("*"),
    supabase.from("rates").select("*"),
    supabase.from("seasons").select("*"),
  ]);
  for (const r of [rooms, guests, groups, res, rates, seasons]) if (r.error) throw r.error;

  const base = {};
  rates.data.forEach((r) => { base[r.room_type] = Number(r.base_price); });
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
  };
}

`;
s = s.slice(0, i) + db + s.slice(i);

fs.writeFileSync(p, s, "utf8");
console.log(s === orig ? "NIMIC schimbat" : "Etapa 1 gata.");
