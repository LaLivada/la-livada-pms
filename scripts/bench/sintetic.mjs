/* Rezervări și oaspeți sintetici, deterministi (același seed → aceleași
 * rânduri), în forma brută pe care o întoarce PostgREST (snake_case) — ca
 * benchmark-ul să plătească și traducerea în camelCase, exact ca aplicația.
 *
 * Nu are pretenția de realism comercial: 100.000 de rezervări pe 16 camere
 * înseamnă ~43 de ani de istoric la ocupare 100%. Scopul e numărul de
 * rânduri, nu plauzibilitatea — ce contează pentru browser e cât are de
 * ținut în memorie și de parcurs, nu dacă pensiunea chiar a existat în 1990.
 *
 * Sejururile sunt consecutive pe fiecare cameră (1–3 nopți, pauză 0–1 zile),
 * deci cele „vii" nu se suprapun — ca în baza reală, unde constrângerea
 * fara_suprapunere le-ar fi refuzat. ~20% sunt anulate/no-show. */

export const CAMERE = [
  ...Array.from({ length: 14 }, (_, i) => ({ id: `r10${String(i + 1).padStart(2, "0")}`, name: `10${String(i + 1).padStart(2, "0")}`, type: "tiny", capacity: i < 6 ? 3 : 2 })),
  { id: "r1101", name: "1101", type: "loft", capacity: 2 },
  { id: "r1102", name: "1102", type: "loft", capacity: 2 },
];

export const CORE = {
  rooms: CAMERE,
  rates: {
    base: { tiny: 350, loft: 450, tinySingle: 300, loftSingle: 400, adultSupplement: 50, childSupplement: 30 },
    seasons: [{ id: "vara", name: "Vară", start: "06-15", end: "09-15", tiny: 400, loft: 520 }],
  },
  onlinePricing: [
    { id: "t1", min: 0, max: 50, adjustmentPct: 0 },
    { id: "t2", min: 50, max: 80, adjustmentPct: 10 },
    { id: "t3", min: 80, max: 100, adjustmentPct: 20 },
  ],
};

/* mulberry32 — mic, determinist, destul de bun pentru date de test. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUME = ["Popescu", "Ionescu", "Pop", "Radu", "Dumitru", "Stan", "Stoica", "Gheorghe", "Matei", "Constantin", "Marin", "Tudor", "Munteanu", "Lazăr", "Rusu", "Florea", "Moldovan", "Șerban", "Dinu", "Nistor"];
const PRENUME = ["Ana", "Ion", "Maria", "Andrei", "Elena", "Mihai", "Ioana", "Alexandru", "Cristina", "George", "Diana", "Vlad", "Raluca", "Bogdan", "Simona", "Radu", "Irina", "Ștefan", "Oana", "Cătălin"];
const SURSE = ["direct", "direct", "direct", "site", "booking", "phone"];
const ZI_MS = 86400000;

export function genereazaOaspeti(n, seed = 1) {
  const r = prng(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `bg${i + 1}`,
    last_name: NUME[Math.floor(r() * NUME.length)],
    first_name: PRENUME[Math.floor(r() * PRENUME.length)],
    phone: `+407${String(Math.floor(r() * 1e8)).padStart(8, "0")}`,
    email: `oaspete${i + 1}@exemplu.ro`, address: null,
    city: "Iași", county: "Iași", country: "România", notes: null, seeded: true,
    created_at: new Date(2026, 0, 1).toISOString(), salutation: null,
  }));
}

/* `acum` fixează „azi" ca statusurile (checkedout / checkedin / confirmed) să
   fie deterministe indiferent de ziua în care rulează benchmark-ul. Istoricul
   începe destul de devreme cât ~85% din rânduri să fie în trecut. */
export function genereazaRezervari(n, { seed = 7, oaspeti = 40000, acum = new Date(2026, 8, 13, 12) } = {}) {
  const r = prng(seed);
  const perCamera = Math.ceil(n / CAMERE.length);
  const zileTotal = perCamera * 2.5;
  const origine = acum.getTime() - zileTotal * 0.86 * ZI_MS;
  const randuri = [];
  for (const camera of CAMERE) {
    let cursor = new Date(origine); cursor.setHours(14, 0, 0, 0);
    for (let k = 0; k < perCamera && randuri.length < n; k++) {
      const nopti = 1 + Math.floor(r() * 3);
      const pauza = Math.floor(r() * 2);
      const checkin = new Date(cursor);
      const checkout = new Date(checkin.getTime() + nopti * ZI_MS); checkout.setHours(12, 0, 0, 0);
      const mort = r() < 0.2;
      const status = mort ? (r() < 0.6 ? "cancelled" : "noshow")
        : checkout <= acum ? "checkedout"
        : checkin <= acum ? "checkedin"
        : r() < 0.1 ? "pending" : "confirmed";
      const sursa = SURSE[Math.floor(r() * SURSE.length)];
      /* 70% dintre sejururi vin de la „clienții fideli" (primii 5.000), ca
         istoricul unui oaspete să aibă ce arăta. */
      const guest = r() < 0.7 ? 1 + Math.floor(r() * 5000) : 1 + Math.floor(r() * oaspeti);
      const creat = new Date(checkin.getTime() - (1 + Math.floor(r() * 60)) * ZI_MS);
      randuri.push({
        id: `br${camera.id}-${k}`, room_id: camera.id, guest_id: `bg${guest}`, group_id: null,
        checkin: checkin.toISOString(), checkout: checkout.toISOString(), status,
        adults: 2, children: k % 3 === 0 ? 1 : 0, price_override: null,
        booked_price: 300 + Math.floor(r() * 600), source: sursa, tags: [],
        notes: k % 7 === 0 ? "Observație de test" : null,
        occupant_last_name: null, occupant_first_name: null, occupant_phone: null,
        messages: [], seeded: true, billing_customer_id: null,
        guest_code: null, created_at: creat.toISOString(), updated_at: creat.toISOString(),
      });
      cursor = new Date(checkout.getTime() + pauza * ZI_MS); cursor.setHours(14, 0, 0, 0);
    }
  }
  return randuri;
}
