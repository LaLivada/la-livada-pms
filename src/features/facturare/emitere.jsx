/* FACTURARE / EMITEREA — cererea catre baza (emite_factura, atomica) si linia
 * de cazare care nu poate lipsi de pe un folio; folosite din folio si din factura.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import * as dateFacturare from "../../data/facturare.js";
import * as dateOblio from "../../data/oblio.js";
import * as dateFolio from "../../data/folio.js";
import * as dateFise from "../../data/fise.js";
import { mesajEroare } from "../../lib/errors.js";
import { calcAmounts, round2 } from "../../lib/money.js";
import { nightsBetween } from "../../lib/availability.js";
import { reservationTotal } from "../../lib/pricing.js";
import { fmtMoney } from "../../lib/format.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";

export async function emiteFactura(invoice) {
  /* Cu Oblio pornit (Financiar → Oblio), seria si numarul le da Oblio, prin
     functia edge; altfel drumul vechi: seria locala + emite_factura.
     Citirea e cea STRICTA: daca setarile nu se pot citi, nu stim pe unde
     trebuie sa iasa factura, iar varianta blanda ar raspunde „oprit" si ar
     aloca un numar local fara pereche in Oblio — un document fiscal gresit,
     tacut. Ne oprim si spunem de ce. */
  let setari;
  try {
    setari = await dateOblio.setariOblioStrict();
  } catch {
    toaster.show("Nu am putut citi setările Oblio — emiterea s-a oprit, ca să nu iasă un număr local greșit. Încearcă din nou.", { tone: "danger" });
    return null;
  }
  if (dateOblio.oblioActiv(setari)) return emiteFacturaOblio(invoice);

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

/* La esec draftul ramane, cu oblio_stare = 'eroare' si mesajul lui Oblio;
   apelantul reincarca factura ca sa-l arate (InvoicePrint.emite). */
async function emiteFacturaOblio(invoice) {
  const r = await dateOblio.cheamaOblio("emite", { invoiceId: invoice.id });
  if (!r.ok) {
    toaster.show(r.error || "Emiterea prin Oblio a eșuat", { tone: "danger" });
    return null;
  }
  const updated = r.factura;
  const numar = updated.oblio_numar || updated.number;
  await audit.push("Factură emisă (Oblio)", `${updated.series} ${numar} · ${fmtMoney(invoice.total_amount)}`);
  toaster.show(`Factura ${updated.series} ${numar} a fost emisă în Oblio`, { tone: "ok" });
  return updated;
}

/* Delegatul propus pentru o factură nouă.

   NUMELE vine de la apelant (`numeDelegat` din lib/nume.js): cel care stă în
   cameră — ocupantul, la o cameră de grup, altfel clientul pe care s-a făcut
   rezervarea. Nu se ia din fișa de cazare, deși fișa are și ea un nume:
   fișa e a titularului actului, iar pe factură trebuie să scrie cine a
   primit-o. ACTUL vine din fișă, singurul loc unde e.

   Numai buletinul: fișa ține și pașaport sau permis (`act_tip`), iar rubrica
   de pe factură scrie „CI seria … nr. …" — un număr de pașaport trecut acolo
   ar fi o afirmație falsă pe un document fiscal. Cu alt act rămâne doar
   numele, iar recepția completează pe draft.

   Un eșec de citire nu oprește facturarea: delegatul e o rubrică ce se poate
   completa oricând înainte de emitere, spre deosebire de linii sau client. */
export async function delegatPentruFactura(idRezervare, nume = "") {
  let fisa = null;
  try { fisa = await dateFise.fisaActiva(idRezervare); }
  catch (e) { console.error("Fișa de cazare nu s-a putut citi pentru delegat", e); }
  const buletin = fisa?.act_tip === "ci";
  return {
    nume: (nume || "").trim(),
    serie: buletin ? (fisa?.act_seria || "") : "",
    numar: buletin ? (fisa?.act_numarul || "") : "",
  };
}

/* Id-ul liniei de cazare a unui folio NOU e dat de folio, nu tras la
   intamplare: doua incarcari simultane care n-o gasesc inca (pe 26.09, dupa
   un check-in, panoul s-a incarcat de doua ori la 150 ms distanta) scriu
   acelasi rand — upsert pe id — in loc de doua linii de cate 300 lei.
   Liniile mai vechi isi pastreaza id-ul lor. */
export const idLinieCazare = (idFolio) => `cazare-${idFolio}`;

export async function ensureCazareLine(folio, items, reservation, core, { reincercare = true } = {}) {
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
    id: existing?.id || idLinieCazare(folio.id), folio_id: folio.id, product_id: cazareProduct?.id || null,
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
    /* 23505: baza are deja linia de cazare a folio-ului (indexul unic
       folio_items_o_cazare_pe_folio) — scrisa intre timp de alt dispozitiv,
       cu un id pe care lista noastra nu-l avea. Nu e o eroare pentru om: se
       reciteste si se lucreaza pe linia aceea, o singura data. */
    if (error?.code === "23505" && reincercare) {
      const proaspete = await dateFolio.pozitiiFolio(folio.id);
      return ensureCazareLine(folio, proaspete, reservation, core, { reincercare: false });
    }
    /* Inainte, esecul se pierdea intr-un console.error: folio-ul afisa o
       linie de cazare care nu ajunsese niciodata in baza, fara niciun
       semn pentru utilizator. Acum eroarea urca la apelant, care o arata. */
    console.error("Sincronizare linie cazare eșuată", error);
    throw error;
  }
  return data;
}
