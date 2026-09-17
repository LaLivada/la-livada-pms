// @ts-check
/* Liniile unei facturi de grup, din pozițiile de folio ale camerelor.
 *
 * Logică pură, fără rețea și fără React: aici se decide CE scrie pe factură
 * când plătește un singur client pentru mai multe camere. Fereastra care o
 * folosește e `features/facturare/grup.jsx`.
 */
import { calcAmounts, round2 } from "./money.js";
import { unitateProdus, UM_TOTAL_GRUP } from "./unitate.js";

/**
 * @typedef {{ id: string, name: string, category: string, product_id?: string|null,
 *   quantity: number|string, unit_price: number|string, vat_rate: number|string,
 *   net_amount: number|string, vat_amount: number|string, total_amount: number|string }} PozitieFolio
 * @typedef {{ camera: { name?: string }|null, pozitii: PozitieFolio[] }} CameraDeFacturat
 */

/**
 * @param {CameraDeFacturat[]} camere
 * @param {"camere"|"total"} mod
 * @param {string} numeGrup
 * @param {{ id: string, unit?: string|null }[]} [produse] nomenclatorul, pentru unitatea de măsură
 */
export function liniiDinCamere(camere, mod, numeGrup, produse = []) {
  const alese = camere.filter((c) => c.pozitii.length);

  /* „Detaliat pe camere": fiecare poziție rămâne o linie, cu numărul camerei
     lângă ea. Sumele și cota se copiază neatinse, deci factura arată exact ce
     s-a consumat, cameră cu cameră. */
  if (mod === "camere") {
    return alese.flatMap((c) => c.pozitii.map((p) => ({
      name: `${p.name} · camera ${c.camera?.name || "?"}`,
      category: p.category,
      productId: p.product_id || null,
      unit: unitateProdus(produse, p.product_id),
      quantity: Number(p.quantity),
      unitPrice: Number(p.unit_price),
      vatRate: Number(p.vat_rate),
      netAmount: Number(p.net_amount),
      vatAmount: Number(p.vat_amount),
      totalAmount: Number(p.total_amount),
      sourceIds: [p.id],
    })));
  }

  /* „Doar totalul": se adună tot. O linie poartă o singură cotă de TVA, deci
     un total pe cote amestecate ar fi o factură greșită — de aceea iese câte
     o linie PE COTĂ. La pensiune, unde grupul e numai cazare, asta înseamnă
     o singură linie, adică exact ce se cere. */
  const peCota = new Map();
  for (const c of alese) {
    for (const p of c.pozitii) {
      const cota = Number(p.vat_rate);
      if (!peCota.has(cota)) {
        peCota.set(cota, { total: 0, sourceIds: [], productId: p.product_id || null, category: p.category });
      }
      const g = peCota.get(cota);
      g.total = round2(g.total + Number(p.total_amount));
      g.sourceIds.push(p.id);
    }
  }
  const maiMulteCote = peCota.size > 1;
  return [...peCota.entries()].map(([cota, g]) => {
    const { totalAmount, netAmount, vatAmount } = calcAmounts(g.total, 1, cota);
    return {
      name: `Servicii de cazare · grupul ${numeGrup}${maiMulteCote ? ` · TVA ${cota}%` : ""}`,
      category: g.category,
      productId: g.productId,
      /* Nu unitatea produsului: linia adună nopți din mai multe camere într-o
         singură poziție, iar „1 noapte" pentru tot sejurul ar fi fals. */
      unit: UM_TOTAL_GRUP,
      quantity: 1,
      unitPrice: g.total,
      vatRate: cota,
      netAmount,
      vatAmount,
      totalAmount,
      sourceIds: g.sourceIds,
    };
  });
}
