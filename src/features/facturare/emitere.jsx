/* FACTURARE / EMITEREA — cererea catre baza (emite_factura, atomica) si linia
 * de cazare care nu poate lipsi de pe un folio; folosite din folio si din factura.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import * as dateFacturare from "../../data/facturare.js";
import * as dateFolio from "../../data/folio.js";
import { uid } from "../../lib/uid.js";
import { mesajEroare } from "../../lib/errors.js";
import { calcAmounts, round2 } from "../../lib/money.js";
import { nightsBetween } from "../../lib/availability.js";
import { reservationTotal } from "../../lib/pricing.js";
import { fmtMoney } from "../../lib/format.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";

export async function emiteFactura(invoice) {
  let serie;
  try {
    serie = await dateFacturare.serieActiva();
  } catch (e) {
    toaster.show(mesajEroare(e, "Nu am putut citi seria de facturare"), { tone: "danger" });
    return null;
  }
  if (!serie) {
    toaster.show("Nu există nicio serie de facturare activă. Configureaz-o în Financiar → Serii.", { tone: "danger" });
    return null;
  }

  /* Numarul si trecerea in „emisa" vin dintr-o singura tranzactie
     (emite_factura, data/facturare.js) — un esec nu mai lasa gol in serie. */
  let updated;
  try {
    updated = await dateFacturare.emiteFactura(invoice.id, serie);
  } catch (e) {
    toaster.show(mesajEroare(e, "Emiterea a eșuat"), { tone: "danger" });
    return null;
  }

  await audit.push("Factură emisă", `${updated.series} ${updated.number} · ${fmtMoney(invoice.total_amount)}`);
  toaster.show(`Factura ${updated.series} ${updated.number} a fost emisă`, { tone: "ok" });
  return updated;
}

export async function ensureCazareLine(folio, items, reservation, core) {
  const existing = items.find((i) => i.category === "cazare");
  if (existing && existing.invoiced_status === "invoiced") return existing;

  const cazareProduct = (core.products || []).find((p) => p.category === "cazare") || null;
  const vatRate = cazareProduct
    ? Number((core.vatRates || []).find((v) => v.id === cazareProduct.vatRateId)?.rate) || 0
    : 0;
  const nights = nightsBetween(reservation.checkin, reservation.checkout);
  const total = reservationTotal(reservation, core);
  /* Impartirea la nopti da frecvent zecimale periodice (500/3 =
     166.6666...). Rotunjim inainte de scriere, altfel in baza ajunge
     valoarea completa iar pe ecran se vede alta, rotunjita la afisare. */
  const unitPrice = round2(nights ? total / nights : total);
  const { totalAmount, netAmount, vatAmount } = calcAmounts(unitPrice, nights, vatRate);

  const row = {
    id: existing?.id || uid(), folio_id: folio.id, product_id: cazareProduct?.id || null,
    name: "Cazare", category: "cazare", quantity: nights, unit_price: unitPrice, vat_rate: vatRate,
    net_amount: netAmount, vat_amount: vatAmount, total_amount: totalAmount,
    occurred_at: reservation.checkin,
  };
  // Cand nu s-a schimbat nimic relevant, evitam un write inutil.
  if (existing && Math.abs(existing.total_amount - totalAmount) < 0.01 && existing.quantity === nights) {
    return existing;
  }
  let data;
  try { data = await dateFolio.salveazaLinieCazare(row); }
  catch (error) {
    /* Inainte, esecul se pierdea intr-un console.error: folio-ul afisa o
       linie de cazare care nu ajunsese niciodata in baza, fara niciun
       semn pentru utilizator. Acum eroarea urca la apelant, care o arata. */
    console.error("Sincronizare linie cazare eșuată", error);
    throw error;
  }
  return data;
}
