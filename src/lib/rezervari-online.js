/* Ce a intrat de pe site-ul propriu — logica pura.
 *
 * Cardul de pe „Azi" e primul lucru de pe primul ecran, deci e si singurul
 * loc unde o rezervare venita singura, noaptea, peste ecranul nimanui, se
 * vede fara sa fie cautata. Pana acum se vedea doar daca cineva derula
 * calendarul pana la data ei.
 *
 * Sursa e `source = 'site'` — asa le scrie `public_booking_*` in
 * `reservations` (schema.sql). NU se citeste din `public_bookings`: tabelul
 * are RLS pornit fara nicio politica, deci e inaccesibil prin API, si asta
 * deliberat.
 */

/* Cheia din SOURCES (lib/constante.js) pentru „Site propriu (online)". */
export const SURSA_SITE = "site";

export const REZERVARI_PE_CARD = 5;

/* ORDINEA E DUPA `createdAt`, NU DUPA `checkin`. „Ultimele intrate" inseamna
 * cand a apasat omul butonul, nu cand vine el la poarta: o rezervare facuta
 * azi pentru la vara e cea mai noua stire, desi are cel mai indepartat
 * check-in.
 *
 * Randurile fara `createdAt` (vederea `rezervari_ocupare`, care nu-l are, si
 * orice rand vechi) cad la coada in loc sa se aseze la intamplare in fata.
 * `id` rupe egalitatea, ca lista sa nu-si schimbe ordinea la fiecare
 * re-randare.
 */
const candAIntrat = (r) => {
  const t = new Date(r?.createdAt ?? NaN).getTime();
  return Number.isNaN(t) ? -Infinity : t;
};

export function ultimeleOnline(rezervari, limita = REZERVARI_PE_CARD) {
  return (rezervari || [])
    .filter((r) => r?.source === SURSA_SITE)
    .slice()
    .sort((a, b) => candAIntrat(b) - candAIntrat(a)
      || String(b.id).localeCompare(String(a.id)))
    .slice(0, limita);
}

/* „acum 20 DE minute", nu „acum 20 minute". Sub 60 regula romaneasca e
   simpla: de la 20 in sus se pune „de". */
const cuDe = (n, cuvant) => (n >= 20 ? `${n} de ${cuvant}` : `${n} ${cuvant}`);

const MINUT = 60000, ORA = 3600000;

/* Cat de proaspata e stirea, in cuvintele in care ar spune-o receptia.
 *
 * Peste doua zile se trece pe data intreaga: „acum 9 zile" se citeste mai
 * greu decat „01.09, 14:20" cand oricum nu mai e o noutate.
 *
 * Viitorul (ceasul calculatorului in urma fata de server) nu iese „acum -3
 * minute", ci „chiar acum" — un minus acolo ar arata ca o defectiune, si nu e.
 */
export function candAVenit(iso, acum = new Date(), fmtDataOra) {
  const t = new Date(iso ?? NaN).getTime();
  if (Number.isNaN(t)) return "";
  const delta = acum.getTime() - t;
  if (delta < MINUT) return "chiar acum";
  if (delta < ORA) return `acum ${cuDe(Math.floor(delta / MINUT), "minute")}`;

  const zi = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const zileIntre = Math.round((zi(acum) - zi(t)) / 86400000);
  if (zileIntre === 0) {
    const ore = Math.floor(delta / ORA);
    return ore === 1 ? "acum o oră" : `acum ${cuDe(ore, "ore")}`;
  }
  if (zileIntre === 1) return "ieri";
  if (zileIntre === 2) return "alaltăieri";
  return fmtDataOra ? fmtDataOra(new Date(t)) : "";
}
