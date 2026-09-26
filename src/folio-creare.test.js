/* Folio-ul unei rezervari se creeaza o singura data, si cand doua ecrane il
 * cer deodata (26 septembrie 2026).
 *
 * Pe 26.09, dupa un check-in, panoul folio s-a incarcat de doua ori la 150
 * ms distanta; ambele incarcari au vazut ca folio-ul lipseste si l-au creat,
 * iar a doua a primit 409 (cheie unica pe reservation_id). Recitirea de dupa
 * 23505 salva situatia, dar cererea respinsa ramanea in jurnal ca eroare.
 * Doua cereri din aceeasi fila pentru aceeasi rezervare impart acum aceeasi
 * creare; recitirea ramane pentru cursa intre dispozitive.
 *
 * Clientul Supabase e imitat doar cat folosesc cererile de aici, cu o pauza
 * la fiecare cerere, ca doua apeluri sa se intrepatrunda ca in retea.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let folios;            // reservation_id -> rand
let inserari;          // cate INSERT-uri au ajuns la „baza"
const asteapta = () => new Promise((r) => setTimeout(r, 0));

function cerereFolios() {
  let filtru = null;
  let deInserat = null;
  const q = {
    select: () => q,
    eq: (_col, val) => { filtru = val; return q; },
    insert: (rand) => { deInserat = rand; return q; },
    maybeSingle: async () => {
      await asteapta();
      if (deInserat) {
        inserari += 1;
        if (folios.has(deInserat.reservation_id)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        folios.set(deInserat.reservation_id, deInserat);
        return { data: deInserat, error: null };
      }
      return { data: folios.get(filtru) || null, error: null };
    },
  };
  return q;
}

vi.mock("./supabase.js", () => ({
  supabase: { from: (tabel) => { if (tabel !== "folios") throw new Error("tabel neasteptat " + tabel); return cerereFolios(); } },
}));

const { folioPentruRezervare } = await import("./data/folio.js");

beforeEach(() => {
  folios = new Map();
  inserari = 0;
});

describe("folio-ul unei rezervari", () => {
  it("doua cereri deodata pentru aceeasi rezervare fac o singura creare", async () => {
    const [a, b] = await Promise.all([folioPentruRezervare("0fipa0od"), folioPentruRezervare("0fipa0od")]);
    expect(inserari).toBe(1);
    expect(a.id).toBe(b.id);
    expect(folios.size).toBe(1);
  });

  it("rezervari diferite nu se asteapta una pe alta", async () => {
    const [a, b] = await Promise.all([folioPentruRezervare("r-a"), folioPentruRezervare("r-b")]);
    expect(inserari).toBe(2);
    expect(a.reservation_id).toBe("r-a");
    expect(b.reservation_id).toBe("r-b");
  });

  it("dupa ce s-a terminat, o cerere noua citeste din nou (nu tine minte un raspuns vechi)", async () => {
    const primul = await folioPentruRezervare("0fipa0od");
    folios.set("0fipa0od", { ...primul, note: "schimbat" });
    const alDoilea = await folioPentruRezervare("0fipa0od");
    expect(alDoilea.note).toBe("schimbat");
  });

  /* Cursa intre doua dispozitive nu trece prin aceeasi fila: acolo ramane
     recitirea de dupa 23505. */
  it("daca altcineva l-a creat intre citire si scriere, citeste randul lui", async () => {
    const creat = { id: "altul", reservation_id: "0fipa0od" };
    const originalSet = folios.set.bind(folios);
    let prima = true;
    folios.get = ((get) => (k) => {
      /* La prima citire folio-ul lipseste; pana la scriere il creeaza „alt
         dispozitiv". */
      if (prima) { prima = false; originalSet("0fipa0od", creat); return undefined; }
      return get(k);
    })(folios.get.bind(folios));
    const rez = await folioPentruRezervare("0fipa0od");
    expect(rez.id).toBe("altul");
  });
});
