/* FACTURARE — folio, facturi, incasari, produse, TVA, export contabil.
 *
 * Cel mai mare domeniu al aplicatiei si singurul care atinge bani, deci si
 * cel care merita cel mai mult sa fie citibil intr-un loc.
 *
 * Ce NU e aici: cererile catre baza de date (src/data/facturare.js,
 * plati.js, folio.js, contabilitate.js) si regulile de calcul (lib/money.js,
 * lib/pricing.js). Aici ramane doar interfata.
 *
 * canBilling verifica ce ARATA interfata. Autoritatea reala e in Postgres
 * (has_billing_permission + RLS), care nu se uita la ce crede browserul.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus, X, Search, Check, Trash2, Pencil, Receipt, Banknote, CreditCard,
  FileDown, Printer, ShieldCheck, UserCheck, AlertTriangle, ArrowRight, Info,
  Eye, Package, Undo2, XCircle,
} from "lucide-react";
import { supabase } from "../supabase.js";
import * as dateFacturare from "../data/facturare.js";
import * as datePlati from "../data/plati.js";
import * as dateFolio from "../data/folio.js";
import * as dateContabilitate from "../data/contabilitate.js";
import * as datePersonal from "../data/personal.js";
import { camelBillingCustomer, snakeBillingCustomer, camelVatRate, camelProduct, camelPaymentMethod } from "../data/mapari.js";
import { uid } from "../lib/uid.js";
import { mesajEroare } from "../lib/errors.js";
import { calcAmounts, round2, splitEvenly } from "../lib/money.js";
import { nightsBetween } from "../lib/availability.js";
import { validateCUIFormat, validatePhone, validateEmail } from "../lib/validation.js";
import { fmtMoney, fmtDate, fmtDateFull, fmtDateTime, toDateInput, initials } from "../lib/format.js";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS, PAYMENT_METHOD_LABEL, BILLING_PERMISSION_LABEL, BILLING_PERMISSION_KEYS, JUDETE, TARI, ROLE_LABEL } from "../lib/constante.js";
import { Dialog, toaster, usePaginare, Paginare, useModalLock } from "../ui/primitive.jsx";
import { audit } from "../lib/audit.js";
import { guestFullName } from "../lib/nume.js";

const emptyBillingCustomer = () => ({
  kind: "person", lastName: "", firstName: "", cnp: "",
  companyName: "", cui: "", regCom: "", contactName: "",
  address: "", city: "", county: "Cluj", country: "România",
  email: "", phone: "", guestId: "",
});

// Cauta un client de facturare dupa nume/CUI/CNP/oras (acelasi tipar ca
// selectorul de oaspete din ReservationModal) si cere confirmare pe un
// pop-up cu datele complete inainte de a-l retine — pot exista mai multi
// clienti cu acelasi nume, iar o factura emisa pe cine nu trebuie e greu
// de reparat (doar prin stornare), deci merita acest pas in plus.

const normCui = (v) => String(v || "").toUpperCase().replace(/^RO/, "").trim();

const emptyInvoiceIssuer = () => ({
  name: "", cui: "", regCom: "", address: "", city: "", county: "",
  country: "România", iban: "", bank: "", email: "", phone: "",
});

export const billingPerms = { role: null, set: new Set() };

export function canBilling(perm) {
  if (billingPerms.role === "admin") return true;
  return billingPerms.set.has(perm);
}

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

  let serieNoua, numar;
  try {
    ({ serie: serieNoua, numar } = await dateFacturare.alocaNumarFactura(serie));
  } catch (e) {
    toaster.show(mesajEroare(e, "Nu am putut aloca numărul de factură"), { tone: "danger" });
    return null;
  }

  let updated;
  try {
    updated = await dateFacturare.marcheazaEmisa(invoice.id, {
      serie: serieNoua, numar, emisDe: audit.user?.id || null,
    });
  } catch (e) {
    toaster.show(mesajEroare(e, "Emiterea a eșuat"), { tone: "danger" });
    return null;
  }

  await audit.push("Factură emisă", `${serieNoua} ${numar} · ${fmtMoney(invoice.total_amount)}`);
  toaster.show(`Factura ${serieNoua} ${numar} a fost emisă`, { tone: "ok" });
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

export function FolioPanel({ reservation, core, updateCore, billingCustomerId, setBillingCustomerId, onNewBillingCustomer }) {
  const [folio, setFolio] = useState(null);
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [printInvoiceId, setPrintInvoiceId] = useState(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      let { data: f, error: fErr } = await supabase
        .from("folios").select("*").eq("reservation_id", reservation.id).maybeSingle();
      if (fErr) throw fErr;
      if (!f) {
        const { data: created, error: cErr } = await supabase
          .from("folios").insert({ id: uid(), reservation_id: reservation.id }).select().maybeSingle();
        if (cErr) {
          // Cursa la montarea panoului (ex. dublu-efect în dev) poate face ca alt
          // apel să fi creat deja folio-ul chiar acum — recuperăm în loc să eșuăm.
          if (cErr.code !== "23505") throw cErr;
          const { data: existing, error: reErr } = await supabase
            .from("folios").select("*").eq("reservation_id", reservation.id).maybeSingle();
          if (reErr) throw reErr;
          f = existing;
        } else {
          f = created;
        }
      }
      const { data: fi, error: iErr } = await supabase
        .from("folio_items").select("*").eq("folio_id", f.id).order("occurred_at");
      if (iErr) throw iErr;
      const cazare = await ensureCazareLine(f, fi || [], reservation, core);
      const rest = (fi || []).filter((i) => i.category !== "cazare");
      setFolio(f);
      setItems(cazare ? [cazare, ...rest] : rest);

      const { data: inv, error: invErr } = await supabase
        .from("invoices").select("*").eq("folio_id", f.id).order("created_at", { ascending: false });
      if (invErr) throw invErr;
      setInvoices(inv || []);
    } catch (e) {
      setLoadError(mesajEroare(e, "Nu am putut încărca folio-ul"));
    } finally {
      setLoading(false);
    }
    // Doar campurile care afecteaza pretul de cazare — nu tot obiectul
    // reservation, ca sa nu reincarcam folio-ul la orice editare minora
    // (ex. o nota) facuta in acelasi modal. La fel pentru core: doar
    // vatRates/products (folosite de ensureCazareLine), nu tot obiectul —
    // altfel orice schimbare nelegata (o camera, o eticheta) din core
    // reincarca inutil folio-ul cat timp modalul e deschis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation.id, reservation.checkin, reservation.checkout, reservation.priceOverride, reservation.bookedPrice, core.vatRates, core.products]);

  useEffect(() => { load(); }, [load]);

  const total = items.reduce((s, i) => s + Number(i.total_amount), 0);
  const uninvoicedItems = items.filter((i) => i.invoiced_status !== "invoiced");
  const uninvoicedTotal = uninvoicedItems.reduce((s, i) => s + Number(i.total_amount), 0);

  const addExtra = async (product, quantity, price, dateStr) => {
    const vatRate = Number((core.vatRates || []).find((v) => v.id === product.vatRateId)?.rate) || 0;
    const { totalAmount, netAmount, vatAmount } = calcAmounts(price, quantity, vatRate);
    const row = {
      id: uid(), folio_id: folio.id, product_id: product.id, name: product.name, category: product.category,
      quantity, unit_price: price, vat_rate: vatRate, net_amount: netAmount, vat_amount: vatAmount,
      total_amount: totalAmount, occurred_at: new Date(dateStr).toISOString(),
      created_by: audit.user?.id || null,
    };
    let data;
    try { data = await dateFolio.adaugaPozitie(row); }
    catch (e) { toaster.show(mesajEroare(e, "Nu am putut adăuga serviciul"), { tone: "danger" }); return; }
    setItems((prev) => [...prev, data]);
    await audit.push("Poziție folio adăugată", `${product.name} × ${quantity} · ${fmtMoney(totalAmount)}`);
    setAdding(false);
  };

  const removeExtra = async (item) => {
    if (item.invoiced_status === "invoiced") {
      toaster.show("Poziția e deja facturată — nu poate fi ștearsă.", { tone: "danger" });
      return;
    }
    try { await dateFolio.stergePozitie(item.id); }
    catch (e) { toaster.show(mesajEroare(e, "Ștergerea a eșuat"), { tone: "danger" }); return; }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await audit.push("Poziție folio ștearsă", `${item.name} · ${fmtMoney(item.total_amount)}`);
  };

  const issueInvoice = async (invoice) => {
    const updated = await emiteFactura(invoice);
    if (updated) setInvoices((prev) => prev.map((x) => (x.id === invoice.id ? updated : x)));
  };

  const activeProducts = (core.products || []).filter((p) => p.active && p.category !== "cazare");

  return (
    <div className="field folio-panel">
      <span className="fl">Folio</span>
      {loading ? (
        <div className="note">Se încarcă…</div>
      ) : loadError ? (
        <div className="note" style={{ color: "var(--danger)" }}>{loadError}</div>
      ) : (
        <div className="panel">
          {items.map((i) => (
            <div className="list-row" key={i.id}>
              <div>
                <div className="primary">
                  {i.name}
                  {i.invoiced_status === "invoiced" && (
                    <span className="role-tag role-admin" style={{ marginLeft: 8 }}>facturat</span>
                  )}
                </div>
                <div className="secondary">
                  {i.quantity} {i.category === "cazare" ? "nopți" : "buc"} × {fmtMoney(i.unit_price)} · TVA {i.vat_rate}% · {fmtDate(i.occurred_at)}
                </div>
              </div>
              <div className="row-actions" style={{ gap: 10 }}>
                <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(i.total_amount)}</span>
                {i.category !== "cazare" && i.invoiced_status !== "invoiced" && (
                  <button className="icon-btn" onClick={() => removeExtra(i)} aria-label={`Șterge ${i.name}`}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="list-row" style={{ background: "var(--surface-2)" }}>
            <div className="primary">Total folio</div>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontWeight: 700 }}>{fmtMoney(total)}</div>
              {uninvoicedTotal !== total && (
                <div className="secondary">{fmtMoney(uninvoicedTotal)} nefacturat</div>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        adding ? (
          <AddExtraForm products={activeProducts} onSave={addExtra} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
            onClick={() => setAdding(true)} disabled={!activeProducts.length}>
            <Plus size={15} /> Adaugă serviciu
          </button>
        )
      )}
      {!loading && !activeProducts.length && (
        <div className="note" style={{ marginTop: 8 }}>
          Niciun produs/serviciu activ — adaugă din Setări → Financiar → Produse & TVA.
        </div>
      )}

      {!loading && (
        <div className="field" style={{ marginTop: 18 }}>
          <span className="fl">Facturare către</span>
          <BillingCustomerPicker
            value={billingCustomerId}
            customers={core.billingCustomers || []}
            defaultLabel="Oaspetele rezervării"
            onChange={setBillingCustomerId}
            onNewBillingCustomer={onNewBillingCustomer}
          />
          <div className="note" style={{ marginTop: 6 }}>
            Dacă nu alegi nimic, factura se emite pe datele oaspetelui de mai sus.
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div className="toolbar" style={{ marginTop: 18 }}>
            <span className="fl" style={{ margin: 0 }}>Facturi</span>
            <div className="grow" />
            {canBilling("create_invoice") && (
              <button type="button" className="btn btn-primary" style={{ width: "auto" }}
                onClick={() => setBuilderOpen(true)} disabled={!uninvoicedItems.length}>
                <Receipt size={15} /> Generează factură
              </button>
            )}
          </div>
          {invoices.length === 0 ? (
            <div className="note">Nicio factură generată încă pentru această rezervare.</div>
          ) : (
            <div className="panel">
              {invoices.map((inv) => (
                <div className="list-row" key={inv.id}>
                  <div>
                    <div className="primary">
                      {inv.series ? `${inv.series} ${inv.number}` : "Draft"}
                      <span className={"role-tag " + INVOICE_STATUS_CLASS[inv.status]} style={{ marginLeft: 8 }}>
                        {INVOICE_STATUS_LABEL[inv.status]}
                      </span>
                    </div>
                    <div className="secondary">
                      {fmtMoney(inv.total_amount)}{inv.paid_amount > 0 ? ` · încasat ${fmtMoney(inv.paid_amount)}` : ""}
                    </div>
                  </div>
                  <div className="row-actions">
                    {inv.status === "draft" && canBilling("issue_invoice") && (
                      <button className="btn btn-ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={() => issueInvoice(inv)}>
                        Emite
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => setPrintInvoiceId(inv.id)} aria-label="Vezi factura">
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {builderOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <InvoiceBuilderModal
            reservation={reservation} folio={folio} items={uninvoicedItems} core={core} updateCore={updateCore}
            onCreated={(inv) => { setInvoices((prev) => [inv, ...prev]); setBuilderOpen(false); load(); }}
            onClose={() => setBuilderOpen(false)}
          />
        </div>
      )}
      {printInvoiceId && (
        <div onClick={(e) => e.stopPropagation()}>
          <InvoicePrint invoiceId={printInvoiceId} core={core} onClose={() => setPrintInvoiceId(null)}
            onChanged={(updated) => setInvoices((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))} />
        </div>
      )}
    </div>
  );
}

export function AddExtraForm({ products, onSave, onCancel }) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const product = products.find((p) => p.id === productId);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(product?.defaultPrice ?? 0);
  const [date, setDate] = useState(toDateInput(new Date()));

  return (
    <div className="subform" style={{ marginTop: 10 }}>
      <div className="field-row field-row-2col">
        <label className="field">
          <span className="fl">Produs</span>
          <select value={productId} onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            setProductId(e.target.value);
            setPrice(p?.defaultPrice ?? 0);
          }}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span className="fl">Cantitate</span>
          <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Preț (cu TVA)</span>
          <input type="number" min="0" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="field"><span className="fl">Dată</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="modal-actions" style={{ marginTop: 0 }}>
        <div className="grow" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Renunță</button>
        <button type="button" className="btn btn-primary" style={{ width: "auto" }}
          disabled={!product} onClick={() => product && onSave(product, quantity, price, date)}>
          <Check size={15} /> Salvează
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   GENERARE FACTURA — selecteaza pozitii din folio, separat/agregat,
   client de facturare, salveaza ca draft (fara numar alocat inca).
----------------------------------------------------------------*/

export function InvoiceBuilderModal({ reservation, folio, items, core, updateCore, onCreated, onClose }) {
  useModalLock();
  const cazareItem = items.find((i) => i.category === "cazare");
  const extraItems = items.filter((i) => i.category !== "cazare");

  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.id)));
  const [aggregate, setAggregate] = useState({}); // folio_item_id -> boolean
  const [billingCustomerId, setBillingCustomerId] = useState(reservation.billingCustomerId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedItems = items.filter((i) => selected.has(i.id));
  const previewTotal = selectedItems.reduce((s, i) => s + Number(i.total_amount), 0);

  const guest = core.guests.find((g) => g.id === reservation.guestId) || null;

  const submit = async () => {
    if (!selectedItems.length) { setError("Selectează cel puțin o poziție."); return; }
    setSaving(true);
    setError("");
    try {
      let custId = billingCustomerId;
      if (!custId) {
        // Fara client de facturare explicit — facturam pe oaspete,
        // creand transparent o fisa billing_customers din datele lui.
        if (!guest) { setError("Rezervarea nu are un oaspete asociat — alege un client de facturare."); setSaving(false); return; }
        const newCust = {
          id: uid(), kind: "person", lastName: guest.lastName, firstName: guest.firstName,
          address: guest.address || "—", city: guest.city || "—", county: guest.county || "—",
          country: guest.country || "România", email: guest.email || "", phone: guest.phone || "",
          guestId: guest.id,
        };
        const { data: createdCust, error: custErr } = await supabase
          .from("billing_customers").insert(snakeBillingCustomer(newCust)).select().maybeSingle();
        if (custErr) throw custErr;
        custId = createdCust.id;
        await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), camelBillingCustomer(createdCust)] });
      }

      // Construim liniile facturii: cazarea (daca selectata) primeste si
      // valoarea extra-urilor agregate in ea; restul extra-urilor
      // neagregate devin linii proprii. invoice_item_links tine minte,
      // pentru fiecare linie, din ce pozitii de folio provine — inclusiv
      // cand sunt mai multe (agregare) — ca sa nu poata fi refacturate.
      const lines = []; // { name, category, quantity, unit_price, vat_rate, sourceIds: [] }
      let cazareLine = null;
      if (cazareItem && selected.has(cazareItem.id)) {
        cazareLine = {
          name: cazareItem.name, category: "cazare", quantity: cazareItem.quantity,
          unitPrice: Number(cazareItem.unit_price), vatRate: Number(cazareItem.vat_rate),
          netAmount: Number(cazareItem.net_amount), vatAmount: Number(cazareItem.vat_amount),
          totalAmount: Number(cazareItem.total_amount), sourceIds: [cazareItem.id],
        };
        lines.push(cazareLine);
      }
      for (const item of extraItems) {
        if (!selected.has(item.id)) continue;
        if (aggregate[item.id] && cazareLine) {
          // Agregat: se aduna in linia de cazare, TVA recalculat la cota
          // cazarii peste totalul combinat (tratament standard pentru
          // "inclus in pretul camerei").
          cazareLine.totalAmount = round2(cazareLine.totalAmount + Number(item.total_amount));
          const recalced = calcAmounts(cazareLine.totalAmount, 1, cazareLine.vatRate);
          cazareLine.netAmount = recalced.netAmount;
          cazareLine.vatAmount = recalced.vatAmount;
          cazareLine.unitPrice = round2(cazareLine.totalAmount / (cazareLine.quantity || 1));
          cazareLine.sourceIds.push(item.id);
        } else {
          lines.push({
            name: item.name, category: item.category, quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price), vatRate: Number(item.vat_rate),
            netAmount: Number(item.net_amount), vatAmount: Number(item.vat_amount),
            totalAmount: Number(item.total_amount), sourceIds: [item.id],
          });
        }
      }

      const { factura: finalInvoice, total, nrLinii } = await dateFacturare.creeazaFacturaDinFolio({
        idFolio: folio.id, idClient: custId,
        deLa: reservation.checkin, panaLa: reservation.checkout,
        linii: lines, creatDe: audit.user?.id || null,
      });

      await audit.push("Factură creată (draft)", `${fmtMoney(total)} · ${nrLinii} poziții`);
      onCreated(finalInvoice);
    } catch (e) {
      setError(mesajEroare(e, "Salvarea facturii a eșuat"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} title="Generează factură">
      <div className="field">
        <span className="fl">Facturare către</span>
        <BillingCustomerPicker
          value={billingCustomerId}
          customers={core.billingCustomers || []}
          defaultLabel={guestFullName(guest) || "Oaspetele rezervării"}
          onChange={setBillingCustomerId}
        />
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        {items.map((i) => (
          <div className="list-row" key={i.id}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="primary">{i.name}</div>
                <div className="secondary">{i.quantity} × {fmtMoney(i.unit_price)} · TVA {i.vat_rate}%</div>
              </div>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {i.category !== "cazare" && cazareItem && selected.has(cazareItem.id) && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                  <input type="checkbox" checked={!!aggregate[i.id]}
                    onChange={(e) => setAggregate({ ...aggregate, [i.id]: e.target.checked })} />
                  agregă în cazare
                </label>
              )}
              <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(i.total_amount)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="price-box">
        <div className="pb-info">
          <div className="price-label">Total factură</div>
          <div className="price-value">{fmtMoney(previewTotal)}</div>
        </div>
      </div>

      {error && <div className="error-text" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează draft"}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   FACTURA — vizualizare + varianta printabila (pattern GroupPrint).
----------------------------------------------------------------*/
/* ---------------------------------------------------------------
   PLATA, ANULARE, STORNARE
----------------------------------------------------------------*/

export function RecordPaymentInline({ invoice, core, onChanged }) {
  const [open, setOpen] = useState(false);
  const sold = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));
  const [amount, setAmount] = useState(sold);
  const methods = (core?.paymentMethods || []).filter((m) => m.active);
  const [method, setMethod] = useState(methods[0]?.id || "cash");
  const [reference, setReference] = useState("");
  const [cardReceiptNumber, setCardReceiptNumber] = useState("");
  const [cardReceiptDate, setCardReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [receiptSeries, setReceiptSeries] = useState(null);

  const isCash = method === "cash";
  const isCard = method === "card";

  useEffect(() => {
    if (!isCash) return;
    datePlati.serieChitante()
      .then(setReceiptSeries)
      .catch((e) => { console.error("serie chitante", e); setReceiptSeries(null); });
  }, [isCash]);

  const submit = async () => {
    if (!(Number(amount) > 0)) return;
    setSaving(true);
    let receiptSeriesVal = null, receiptNumberVal = null;
    if (isCash) {
      try {
        const r = await datePlati.alocaNumarChitanta(receiptSeries?.series || "CH");
        receiptSeriesVal = r.serie; receiptNumberVal = r.numar;
      } catch (e) {
        toaster.show(mesajEroare(e, "Nu am putut aloca numărul de chitanță"), { tone: "danger" });
        setSaving(false); return;
      }
    }
    let updated;
    try {
      /* Intoarce factura reincarcata: soldul si statusul sunt recalculate
         de un trigger server-side dupa inserarea platii. */
      updated = await datePlati.inregistreazaPlata({
        idFactura: invoice.id, suma: amount, metoda: method,
        referinta: reference.trim(), creatDe: audit.user?.id || null,
        serieChitanta: receiptSeriesVal, numarChitanta: receiptNumberVal,
        numarBonCard: isCard ? (cardReceiptNumber.trim() || null) : null,
        dataBonCard: isCard ? (cardReceiptDate || null) : null,
      });
    } catch (e) {
      toaster.show(mesajEroare(e, "Plata a eșuat"), { tone: "danger" });
      setSaving(false); return;
    }
    const methodLabel = methods.find((m) => m.id === method)?.label || method;
    const receiptNote = receiptSeriesVal ? ` · chitanță ${receiptSeriesVal} ${receiptNumberVal}` : "";
    await audit.push("Plată înregistrată", `${fmtMoney(amount)} · ${methodLabel}${receiptNote}`);
    if (updated) onChanged(updated);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="panel no-print" style={{ padding: 16, marginTop: 16 }}>
      {open ? (
        <>
          <div className="field-row field-row-2col">
            <label className="field"><span className="fl">Sumă</span>
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <label className="field"><span className="fl">Metodă</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {methods.length === 0 && <option value="cash">Numerar</option>}
                {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
          {isCash && (
            <div className="note" style={{ marginBottom: 10 }}>
              Se alocă automat numărul următor din seria de chitanțe {receiptSeries?.series || "CH"}
              {receiptSeries ? ` (${receiptSeries.series} ${receiptSeries.next_number})` : ""}.
            </div>
          )}
          {isCard && (
            <div className="field-row field-row-2col">
              <label className="field"><span className="fl">Număr bon</span>
                <input value={cardReceiptNumber} onChange={(e) => setCardReceiptNumber(e.target.value)} />
              </label>
              <label className="field"><span className="fl">Data bonului</span>
                <input type="date" value={cardReceiptDate} onChange={(e) => setCardReceiptDate(e.target.value)} />
              </label>
            </div>
          )}
          <label className="field"><span className="fl">Referință (opțional)</span><input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Renunță</button>
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={saving}>
              <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setOpen(true)}>
          <CreditCard size={15} /> Adaugă plată{sold > 0 ? ` (${fmtMoney(sold)} rest)` : ""}
        </button>
      )}
    </div>
  );
}

/* Anulare: doar pe facturi fara nicio plata inregistrata — status trece
   direct la 'cancelled', numarul alocat NU se reemite (ramane "ars").
   Stornare: emite o factura NOUA, cu acelasi client si linii, dar sume
   negative si credit_note_of catre originala — originala trece la
   'credited', dar ramane in DB neschimbata (istoric intact). */

export function InvoiceCancelCreditActions({ invoice, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const cancelInvoice = async () => {
    setBusy(true);
    try {
      const data = await dateFacturare.anuleazaFactura(invoice.id);
      await audit.push("Factură anulată", `${invoice.series || "draft"} ${invoice.number || ""}`.trim());
      onChanged(data);
      setConfirm(null);
    } catch (e) {
      toaster.show(mesajEroare(e, "Anularea a eșuat"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const creditInvoice = async () => {
    setBusy(true);
    try {
      /* Stornarea foloseste ACEEASI serie activa ca facturile obisnuite.
         Pana pe 21 august 2026 aici era scris "LIV", o serie care nu exista
         in baza — next_invoice_number arunca "Serie de facturare inexistenta
         sau inactiva", deci stornarea esua de fiecare data. Nu s-a observat
         fiindca nu se stornase nimic vreodata.
         Alternativa (serie proprie pentru stornari) e permisa legal, dar ar
         cere o serie configurata explicit in Financiar → Serii; alegerea a
         fost numerotarea continua. */
      const serieStorno = await dateFacturare.serieActiva();
      if (!serieStorno) {
        toaster.show("Nu există nicio serie de facturare activă. Configureaz-o în Financiar → Serii.", { tone: "danger" });
        return;
      }
      const { original, serie, numar } = await dateFacturare.storneazaFactura(invoice, {
        serie: serieStorno, creatDe: audit.user?.id || null,
      });
      await audit.push("Factură stornată",
        `${serie} ${numar} stornează ${invoice.series || ""} ${invoice.number || ""}`.trim());
      toaster.show(`Stornare emisă: ${serie} ${numar}`, { tone: "ok" });
      onChanged(original);
    } catch (e) {
      toaster.show(mesajEroare(e, "Stornarea a eșuat"), { tone: "danger" });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="no-print" style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
      {confirm === "cancel" ? (
        <>
          <span style={{ fontSize: 13 }}>Sigur anulezi factura?</span>
          <button className="btn btn-danger" style={{ width: "auto" }} disabled={busy} onClick={cancelInvoice}>Confirmă</button>
          <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setConfirm(null)}>Renunță</button>
        </>
      ) : confirm === "credit" ? (
        <>
          <span style={{ fontSize: 13 }}>Sigur storne­zi? Se emite o factură nouă, cu sume negative.</span>
          <button className="btn btn-danger" style={{ width: "auto" }} disabled={busy} onClick={creditInvoice}>Confirmă</button>
          <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setConfirm(null)}>Renunță</button>
        </>
      ) : (
        <>
          {Number(invoice.paid_amount) === 0 && canBilling("cancel_invoice") && (
            <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setConfirm("cancel")}>
              <XCircle size={15} /> Anulează factura
            </button>
          )}
          {canBilling("create_credit_note") && (
            <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setConfirm("credit")}>
              <Undo2 size={15} /> Stornează
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Rand editabil pentru o linie de factura draft — stare locala pana la
// blur, ca sa nu trimitem un update la fiecare tasta apasata.

export function InvoiceLineEditRow({ line, index, onSave }) {
  const [name, setName] = useState(line.name);
  const [quantity, setQuantity] = useState(line.quantity);
  const [unitPrice, setUnitPrice] = useState(line.unit_price);

  useEffect(() => {
    setName(line.name); setQuantity(line.quantity); setUnitPrice(line.unit_price);
  }, [line.id, line.name, line.quantity, line.unit_price]);

  const commit = () => {
    const q = Number(quantity) || 0, p = Number(unitPrice) || 0;
    if (name === line.name && q === Number(line.quantity) && p === Number(line.unit_price)) return;
    onSave(line, { name: name.trim() || line.name, quantity: q, unit_price: p });
  };

  return (
    <tr>
      <td className="r c-no">{index + 1}</td>
      <td><input className="inv-edit-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} /></td>
      <td className="r"><input className="inv-edit-input r" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} onBlur={commit} /></td>
      <td className="r"><input className="inv-edit-input r" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} onBlur={commit} /></td>
      <td className="r">{line.vat_rate}%</td>
      <td className="r">{fmtMoney(Number(quantity) * Number(unitPrice) || 0)}</td>
    </tr>
  );
}

export function InvoicePrint({ invoiceId, core, onClose, onChanged }) {
  useModalLock();
  const [invoice, setInvoice] = useState(null);
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const fisaRef = useRef(null);
  const [emitere, setEmitere] = useState(false);

  const emite = async () => {
    if (emitere) return;
    setEmitere(true);
    try {
      const actualizata = await emiteFactura(invoice);
      if (actualizata) {
        setInvoice(actualizata);
        onChanged?.(actualizata);
      }
    } finally {
      setEmitere(false);
    }
  };

  // Coala e fixata la 794px (latimea A4); pe ecran trebuie sa incapa in
  // modal/telefon, deci o scalam vizual cu transform pe un wrapper din
  // JURUL .fisa. La print, regulile din STYLES (.inv-scaler, .inv-sheet-wrap,
  // .inv-sheet) reseteaza scalarea si lasa coala sa curga la marimea A4.
  const scaleWrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [sheetH, setSheetH] = useState(1123);
  useEffect(() => {
    const wrap = scaleWrapRef.current;
    const sheet = fisaRef.current;
    if (!wrap || !sheet) return;
    const update = () => {
      const w = wrap.clientWidth;
      setScale(w > 0 ? Math.min(1, w / 794) : 1);
      setSheetH(sheet.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [invoice, lines]);

  const load = useCallback(async () => {
    /* Inainte, orice esec de citire era inghitit tacit (se destructura doar
       `data`): factura aparea goala, fara nicio explicatie. Acum se vede. */
    let det = null;
    try { det = await dateFacturare.detaliiFactura(invoiceId); }
    catch (e) { toaster.show(mesajEroare(e, "Nu am putut încărca factura"), { tone: "danger" }); }
    setInvoice(det?.factura ?? null);
    setLines(det?.linii ?? []);
    setCustomer(det?.client ?? null);
    setPayments(det?.plati ?? []);
    setLoading(false);
    return det?.factura ?? null;
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  // Recalculeaza net/TVA/total pentru o linie dupa editare, salveaza-o,
  // apoi reface totalurile facturii din toate liniile — doar draft-urile
  // se pot edita (facturile emise sunt blocate prin regula de business
  // existenta: orice corectie dupa emitere trece prin stornare).
  const saveLine = async (line, patch) => {
    const next = { ...line, ...patch };
    const { totalAmount, netAmount, vatAmount } = calcAmounts(Number(next.unit_price), Number(next.quantity), Number(next.vat_rate));
    const row = { name: next.name, quantity: Number(next.quantity), unit_price: Number(next.unit_price), net_amount: netAmount, vat_amount: vatAmount, total_amount: totalAmount };
    try { await dateFacturare.salveazaLinieFactura(line.id, row); }
    catch (e) { toaster.show(mesajEroare(e, "Nu am putut salva linia"), { tone: "danger" }); return; }
    const freshLines = lines.map((l) => (l.id === line.id ? { ...l, ...row } : l));
    let updatedInvoice;
    try {
      updatedInvoice = await dateFacturare.actualizeazaTotaluri(invoice.id, {
        net: freshLines.reduce((s, l) => s + Number(l.net_amount), 0),
        tva: freshLines.reduce((s, l) => s + Number(l.vat_amount), 0),
        total: freshLines.reduce((s, l) => s + Number(l.total_amount), 0),
      });
    } catch (e) { toaster.show(mesajEroare(e, "Nu am putut recalcula factura"), { tone: "danger" }); return; }
    setLines(freshLines);
    setInvoice(updatedInvoice);
    onChanged?.(updatedInvoice);
    await audit.push("Linie factură modificată", `${next.name} · ${fmtMoney(totalAmount)}`);
  };

  const changeBillingCustomer = async (customerId) => {
    let updatedInvoice;
    try { updatedInvoice = await dateFacturare.schimbaClientFactura(invoice.id, customerId); }
    catch (e) { toaster.show(mesajEroare(e, "Nu am putut schimba clientul"), { tone: "danger" }); return; }
    const cust = (core.billingCustomers || []).find((c) => c.id === customerId) || null;
    setInvoice(updatedInvoice);
    setCustomer(cust);
    onChanged?.(updatedInvoice);
    await audit.push("Client de facturare schimbat", cust ? billingCustomerLabel(cust) : "—");
  };

  const issuer = core.invoiceIssuer || {};
  const vatGroups = {};
  lines.forEach((l) => {
    const k = Number(l.vat_rate);
    vatGroups[k] = vatGroups[k] || { rate: k, net: 0, vat: 0 };
    vatGroups[k].net += Number(l.net_amount);
    vatGroups[k].vat += Number(l.vat_amount);
  });

  // Randat prin portal in document.body, nu inline (spre deosebire de
  // restul dialogurilor din fisier) — InvoicePrint se deschide de obicei
  // din interiorul ReservationModal, deja el insusi un Dialog; regula CSS
  // de print ascunde tot in .content cu exceptia .arrival-overlay, dar
  // display:none pe un stramos (overlay-ul ReservationModal) ascunde si
  // descendentii indiferent de clasa lor — portalul scoate factura din
  // acel arbore, ca sa nu mai fie afectata.
  if (loading) return createPortal(<Dialog onClose={onClose} title="Factură"><div className="note">Se încarcă…</div></Dialog>, document.body);
  if (!invoice) return createPortal(<Dialog onClose={onClose} title="Factură"><div className="note">Factura nu a fost găsită.</div></Dialog>, document.body);

  return createPortal(
    <Dialog onClose={onClose} title={invoice.series ? `Factură ${invoice.series} ${invoice.number}` : "Factură (draft)"} className="arrival-modal invoice-modal" overlayClassName="arrival-overlay">
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span className={"role-tag " + INVOICE_STATUS_CLASS[invoice.status]}>{INVOICE_STATUS_LABEL[invoice.status]}</span>
        <div className="grow" />
        {/* Emiterea sta aici, in fereastra draftului: se vede intai ce
            contine factura si abia apoi se aloca numarul — spre deosebire
            de un buton in lista, unde se apasa fara sa vezi documentul. */}
        {invoice.status === "draft" && canBilling("issue_invoice") && (
          <button className="btn btn-primary" style={{ width: "auto" }}
            onClick={emite} disabled={emitere}>
            <Receipt size={15} /> {emitere ? "Se emite…" : "Emite factura"}
          </button>
        )}
        <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => window.print()}>
          <Printer size={15} /> Printează
        </button>
      </div>
      {invoice.status === "draft" && canBilling("issue_invoice") && (
        <div className="note no-print" style={{ marginTop: -6, marginBottom: 14 }}>
          La emitere se alocă serie și număr, iar factura nu mai poate fi modificată —
          orice corecție ulterioară se face doar prin stornare.
        </div>
      )}

      <div className="inv-sheet-wrap" ref={scaleWrapRef} style={{ height: sheetH * scale }}>
      <div className="inv-scaler" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div className="fisa inv-sheet" ref={fisaRef}>
        {/* Filigran. Primul copil, ca elementele de continut (pozitionate
            prin regula din STYLES) sa se picteze peste el. Daca fisierul
            lipseste, se ascunde singur — o factura fara filigran e mult mai
            buna decat una cu o iconita de imagine rupta in mijloc. */}
        <img src="/background.png" alt="" aria-hidden="true" className="inv-watermark"
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        {invoice.status === "cancelled" && <div className="inv-cancelled-stamp">ANULATĂ</div>}
        <div className="inv-top">
          <div>
            <img src="/logo.png" alt="La Livadă" className="fisa-logo-img" />
          </div>
          <div className="inv-top-issuer">
            <strong>{issuer.name || "—"}</strong>
            {issuer.cui && <div>CUI: {issuer.cui}{issuer.regCom ? ` · ${issuer.regCom}` : ""}</div>}
            {issuer.address && <div>{issuer.address}{issuer.city ? `, ${issuer.city}` : ""}{issuer.county ? `, ${issuer.county}` : ""}</div>}
          </div>
        </div>

        <div className="inv-banner">
          <span className="inv-banner-bar" />
          <span className="inv-banner-title">FACTURĂ</span>
          <span className="inv-banner-bar short" />
        </div>

        <div className="inv-meta-row">
          <div>
            <div className="inv-to-lab">Client</div>
            {customer ? (
              <>
                <div className="inv-party-name">{billingCustomerLabel(customer)}</div>
                {customer.kind === "company" && customer.cui && <div className="inv-party-line">CUI {customer.cui}{customer.regCom ? ` · ${customer.regCom}` : ""}</div>}
                {customer.kind === "person" && customer.cnp && <div className="inv-party-line">CNP {customer.cnp}</div>}
                <div className="inv-party-line">{customer.address}, {customer.city}, {customer.county}, {customer.country}</div>
              </>
            ) : <div className="inv-party-line">—</div>}
            {invoice.status === "draft" && canBilling("create_invoice") && (
              <select className="inv-client-select no-print" value={invoice.billing_customer_id || ""} onChange={(e) => changeBillingCustomer(e.target.value)}>
                <option value="" disabled>Schimbă clientul…</option>
                {(core.billingCustomers || []).map((c) => (
                  <option key={c.id} value={c.id}>{billingCustomerLabel(c)}{c.kind === "company" ? " · firmă" : ""}</option>
                ))}
              </select>
            )}
          </div>
          <div className="inv-nums">
            <div className="inv-nums-row"><span className="k">Factură nr.</span><span className="v">{invoice.series ? `${invoice.series} ${invoice.number}` : "Draft"}</span></div>
            {invoice.issue_date && <div className="inv-nums-row"><span className="k">Data</span><span className="v">{fmtDateFull(invoice.issue_date)}</span></div>}
            {invoice.service_date_start && (
              <div className="inv-nums-row"><span className="k">Perioadă</span><span className="v">{fmtDateFull(invoice.service_date_start)} → {fmtDateFull(invoice.service_date_end)}</span></div>
            )}
          </div>
        </div>

        <div className="inv-body">
          <table className="inv-table">
            <thead>
              <tr>
                <th className="r c-no">Nr.</th>
                <th>Denumire</th>
                <th className="r">Cant.</th>
                <th className="r">Preț unitar</th>
                <th className="r">TVA</th>
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                invoice.status === "draft" && canBilling("create_invoice")
                  ? <InvoiceLineEditRow key={l.id} line={l} index={i} onSave={saveLine} />
                  : (
                    <tr key={l.id}>
                      <td className="r c-no">{i + 1}</td>
                      <td>{l.name}</td>
                      <td className="r">{l.quantity}</td>
                      <td className="r">{fmtMoney(l.unit_price)}</td>
                      <td className="r">{l.vat_rate}%</td>
                      <td className="r">{fmtMoney(l.total_amount)}</td>
                    </tr>
                  )
              ))}
            </tbody>
          </table>
          {invoice.status === "draft" && canBilling("create_invoice") && (
            <div className="note no-print" style={{ marginTop: 6 }}>
              Editează denumirea, cantitatea sau prețul direct în tabel — totalul facturii se recalculează automat. O factură emisă nu se mai poate edita (doar stornare).
            </div>
          )}

          <div className="inv-table-filler" />

          <div className="inv-totals">
            <div className="inv-totals-box">
              {Object.values(vatGroups).map((g) => (
                <div className="inv-totals-row" key={g.rate}>
                  <span>Bază {g.rate}%</span><span>{fmtMoney(g.net)}</span>
                </div>
              ))}
              {Object.values(vatGroups).map((g) => (
                <div className="inv-totals-row" key={"vat" + g.rate}>
                  <span>TVA {g.rate}%</span><span>{fmtMoney(g.vat)}</span>
                </div>
              ))}
              <div className="inv-totals-row total">
                <span>Total</span><span>{fmtMoney(invoice.total_amount)}</span>
              </div>
              {payments.length > 0 && (
                <div className="inv-totals-row paid">
                  <span>Achitat</span><span>{fmtMoney(invoice.paid_amount)}</span>
                </div>
              )}
            </div>
          </div>

          {payments.length > 0 && (
            <div className="inv-payments">
              <span className="inv-payments-lab">Plăți</span>
              {payments.map((p) => {
                const receipt = p.receipt_series
                  ? `Chitanță ${p.receipt_series} ${p.receipt_number}`
                  : p.card_receipt_number
                    ? `Bon ${p.card_receipt_number}${p.card_receipt_date ? ` · ${fmtDateFull(p.card_receipt_date)}` : ""}`
                    : "";
                return (
                  <div className="inv-payment-row" key={p.id}>
                    <span>
                      {fmtDateFull(p.paid_at)} · {(core.paymentMethods || []).find((m) => m.id === p.method)?.label || PAYMENT_METHOD_LABEL[p.method] || p.method}
                      {p.reference ? ` · ${p.reference}` : ""}{receipt ? ` · ${receipt}` : ""}
                    </span>
                    <span>{fmtMoney(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {invoice.notes && (
            <div className="inv-notes">
              <strong>Observații</strong>
              <div>{invoice.notes}</div>
            </div>
          )}
        </div>

        <div className="inv-foot">
          <div className="inv-foot-bar" />
          <div className="inv-foot-inner">
            <div>
              <div className="inv-foot-lab">Date de plată</div>
              <div className="inv-foot-line">
                {issuer.bank && <div>Bancă: {issuer.bank}</div>}
                {issuer.iban && <div>IBAN: {issuer.iban}</div>}
                {!issuer.bank && !issuer.iban && <div>—</div>}
              </div>
            </div>
            <div>
              <div className="inv-foot-lab">Contact</div>
              <div className="inv-foot-line">
                {issuer.phone && <div>{issuer.phone}</div>}
                {issuer.email && <div>{issuer.email}</div>}
                {!issuer.phone && !issuer.email && <div>—</div>}
              </div>
            </div>
            <div className="inv-sign">
              <div className="inv-sign-line" />
              <div className="inv-sign-lab">Semnătură client</div>
            </div>
          </div>
        </div>
      </div>
      </div>
      </div>

      {invoice.status === "issued" && canBilling("record_payment") && (
        <RecordPaymentInline invoice={invoice} core={core} onChanged={(updated) => { setInvoice(updated); onChanged?.(updated); }} />
      )}
      {(invoice.status === "issued" || invoice.status === "partially_paid") && (
        <InvoiceCancelCreditActions invoice={invoice} onChanged={(updated) => { setInvoice(updated); onChanged?.(updated); }} />
      )}
    </Dialog>,
    document.body
  );
}

/* ACCES LA CAMERĂ — codul yalei electronice.
 *
 * Citește direct din access_codes: RLS lasă adminul și recepția să vadă
 * codurile, dar NU să le scrie. Orice generare trece prin funcția edge, ca
 * un cod să nu poată exista în PMS fără să existe și pe yală.
 *
 * Codul se generează la check-in. Butonul de aici acoperă cazurile în care
 * asta n-a mers: yala n-a răspuns atunci, rezervarea era deja făcută
 * check-in înainte de integrare, sau perioada s-a schimbat între timp. */

export function billingCustomerLabel(c) {
  if (!c) return "";
  if (c.kind === "company") return c.companyName || "";
  return [c.lastName, c.firstName].filter(Boolean).join(" ").trim();
}

/* href pentru apel direct — tel: vrea doar cifre si "+", fara spatii. */

export function BillingCustomerPicker({ value, customers, defaultLabel, onChange, onNewBillingCustomer }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(null);
  /* Ca la cautarea de oaspete: cu tastatura deschisa, rezultatele cadeau
     sub marginea de jos a modalului. */
  const refRezultate = useAduInVizor(Boolean(query.trim()));
  const selected = customers.find((c) => c.id === value) || null;

  const matches = (() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    const tDigits = t.replace(/\s/g, "");
    return customers.filter((c) =>
      billingCustomerLabel(c).toLowerCase().includes(t) ||
      (c.contactName || "").toLowerCase().includes(t) ||
      (c.cui || "").toLowerCase().includes(t) ||
      (c.cnp || "").includes(tDigits) ||
      (c.phone || "").replace(/\s/g, "").includes(tDigits) ||
      (c.city || "").toLowerCase().includes(t)
    );
  })();

  const custMeta = (c) => [
    c.kind === "company" ? (c.cui && `CUI ${c.cui}`) : (c.cnp && `CNP ${c.cnp}`),
    c.city,
  ].filter(Boolean).join(" · ") || "Fără date suplimentare";

  return (
    <div className="guest-search">
      {selected ? (
        <div className="guest-chip">
          <div className="guest-chip-av">{initials(billingCustomerLabel(selected))}</div>
          <div className="guest-chip-body">
            <div className="gname">{billingCustomerLabel(selected)}{selected.kind === "company" ? " · firmă" : ""}</div>
            <div className="gmeta">{custMeta(selected)}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => { onChange(""); setQuery(""); }} aria-label="Schimbă clientul de facturare">
            <X size={15} />
          </button>
        </div>
      ) : (
        <>
          <div className="search-box" style={{ maxWidth: "none", width: "100%" }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Caută după nume, CUI, CNP sau oraș…"
            />
          </div>
          {query.trim() ? (
            matches.length > 0 ? (
              <div className="guest-results" ref={refRezultate}>
                {matches.slice(0, 8).map((c) => (
                  <button type="button" key={c.id} className="guest-result" onClick={() => setPending(c)}>
                    <div className="guest-chip-av">{initials(billingCustomerLabel(c))}</div>
                    <div>
                      <div className="gname">{billingCustomerLabel(c)}{c.kind === "company" ? " · firmă" : ""}</div>
                      <div className="gmeta">{custMeta(c)}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="guest-none" ref={refRezultate}>
                <div>Niciun client cu „{query.trim()}”.</div>
                {onNewBillingCustomer && (
                  <button type="button" className="btn btn-primary" style={{ width: "auto", marginTop: 10 }} onClick={onNewBillingCustomer}>
                    <Plus size={15} /> Adaugă client nou
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="note" style={{ margin: 0 }}>Implicit: {defaultLabel}</div>
          )}
        </>
      )}

      {pending && (
        <Dialog onClose={() => setPending(null)} title="Confirmă clientul de facturare">
          <div className="guest-chip" style={{ marginBottom: 14 }}>
            <div className="guest-chip-av">{initials(billingCustomerLabel(pending))}</div>
            <div className="guest-chip-body">
              <div className="gname">{billingCustomerLabel(pending)}</div>
              <div className="gmeta">{pending.kind === "company" ? "Firmă" : "Persoană fizică"}</div>
            </div>
          </div>
          <div className="guest-contact-info">
            {pending.kind === "company" ? (
              <>
                {pending.cui && <div>CUI: {pending.cui}</div>}
                {pending.regCom && <div>Reg. Com.: {pending.regCom}</div>}
                {pending.contactName && <div>Persoană de contact: {pending.contactName}</div>}
              </>
            ) : (
              pending.cnp && <div>CNP: {pending.cnp}</div>
            )}
            <div>{[pending.address, pending.city, pending.county, pending.country].filter(Boolean).join(", ") || "Fără adresă"}</div>
            {pending.phone && <div>Telefon: {pending.phone}</div>}
            {pending.email && <div>Email: {pending.email}</div>}
          </div>
          <div className="note">
            Pot exista mai mulți clienți cu nume asemănător — verifică datele de mai sus înainte să confirmi.
          </div>
          <div className="modal-actions">
            <div className="grow" />
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Renunță</button>
            <button type="button" className="btn btn-primary" style={{ width: "auto" }}
              onClick={() => { onChange(pending.id); setPending(null); setQuery(""); }}>
              <Check size={15} /> Da, facturează pe acest client
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function BillingCustomerModal({ customer, seedFromGuest, existingCustomers, onSave, onClose }) {
  useModalLock();
  const [c, setC] = useState(() => ({
    ...emptyBillingCustomer(),
    ...(seedFromGuest ? {
      kind: "person", lastName: seedFromGuest.lastName || "", firstName: seedFromGuest.firstName || "",
      address: seedFromGuest.address || "", city: seedFromGuest.city || "", county: seedFromGuest.county || "Cluj",
      country: seedFromGuest.country || "România", email: seedFromGuest.email || "", phone: seedFromGuest.phone || "",
      guestId: seedFromGuest.id || "",
    } : {}),
    ...(customer || {}),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // La primul submit cu un nume care se potriveste cu un client existent
  // (dar CUI/CNP diferit sau lipsa), cerem confirmare explicita in loc sa
  // salvam direct — abia la al doilea click, cu acelasi nume neschimbat,
  // se salveaza efectiv. Orice modificare a formularului reseteaza asta.
  const [nameWarning, setNameWarning] = useState(null);
  // Generat o singura data — nu la fiecare submit, ca un dublu-tap pe
  // "Salveaza" (cat timp raspunsul serverului intarzie) sa nu produca doi
  // clienti locali cu id-uri diferite inainte ca salvarea sa se termine.
  const idRef = useRef(customer?.id || uid());
  const set = (k) => (e) => { setC({ ...c, [k]: e.target.value }); setError(""); setNameWarning(null); };

  const cuiCheck = c.kind === "company" ? validateCUIFormat(c.cui) : { ok: true, warn: false };
  // Fara selector de prefix aici (spre deosebire de fisa de client) — un
  // "0" la inceput e un numar local romanesc normal, nu o greseala.
  const phoneCheck = validatePhone(c.phone);
  const emailCheck = validateEmail(c.email);

  const submit = async () => {
    if (saving) return;
    const REQUIRED = c.kind === "person"
      ? [["lastName", "nume"], ["firstName", "prenume"]]
      : [["companyName", "denumire firmă"], ["cui", "CUI"]];
    const missingCommon = [["address", "adresă"], ["city", "oraș"], ["county", "județ"], ["country", "țară"]]
      .filter(([k]) => !String(c[k] ?? "").trim());
    const missing = REQUIRED.filter(([k]) => !String(c[k] ?? "").trim()).concat(missingCommon);
    if (missing.length) {
      setError(`Completează: ${missing.map(([, label]) => label).join(", ")}.`);
      return;
    }
    if (c.kind === "company" && !cuiCheck.ok) {
      setError(cuiCheck.message);
      return;
    }
    if (!phoneCheck.ok) {
      setError(phoneCheck.message);
      return;
    }
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }

    // Verificarile de duplicat conteaza doar la crearea unui client nou —
    // editarea unuia existent isi pastreaza propriul id, nu poate "coliza"
    // cu sine insusi.
    if (!customer?.id) {
      const others = (existingCustomers || []).filter((e) => e.id !== idRef.current);

      if (c.kind === "company") {
        // La firma, CUI-ul identic e suficient — e un identificator legal
        // unic, nu mai e nevoie sa comparam alte campuri.
        if (c.cui.trim()) {
          const dupCui = others.find((e) => e.kind === "company" && normCui(e.cui) === normCui(c.cui));
          if (dupCui) {
            setError(`Există deja o firmă cu acest CUI: ${billingCustomerLabel(dupCui)}${dupCui.city ? ` (${dupCui.city})` : ""}. Caut-o în listă în loc să creezi una nouă.`);
            return;
          }
        }
        const nameKey = c.companyName.trim().toLowerCase();
        const dupName = others.find((e) => e.kind === "company" && (e.companyName || "").trim().toLowerCase() === nameKey);
        if (dupName && !nameWarning) {
          setNameWarning(dupName);
          setError(`Există deja o firmă cu acest nume: ${billingCustomerLabel(dupName)}${dupName.city ? ` (${dupName.city})` : ""}. Dacă e alta firmă, apasă din nou „Salvează” ca să continui.`);
          return;
        }
      } else {
        // La persoana fizica, CNP-ul e optional — nu ne putem baza doar pe
        // el. Comparam nume+prenume impreuna cu telefon si adresa, ca sa nu
        // tratam drept "sigur acelasi om" doua persoane care doar au acelasi
        // nume, dar nici sa nu ratam un duplicat cand CNP-ul lipseste.
        const normVal = (v) => String(v || "").trim().toLowerCase();
        const normPhone = (v) => String(v || "").replace(/\s/g, "");
        const nameKey = `${normVal(c.lastName)} ${normVal(c.firstName)}`.trim();
        const phoneKey = normPhone(c.phone);
        const addrKey = c.address.trim() ? `${normVal(c.address)}|${normVal(c.city)}` : "";
        const cnpKey = c.cnp.trim();

        const persons = others.filter((e) => e.kind === "person");
        if (cnpKey) {
          const dupCnp = persons.find((e) => (e.cnp || "").trim() === cnpKey);
          if (dupCnp) {
            setError(`Există deja o persoană cu acest CNP: ${billingCustomerLabel(dupCnp)}${dupCnp.city ? ` (${dupCnp.city})` : ""}. Caut-o în listă în loc să creezi una nouă.`);
            return;
          }
        }
        const sameName = persons.filter((e) => `${normVal(e.lastName)} ${normVal(e.firstName)}`.trim() === nameKey);
        const corroborated = sameName.find((e) =>
          (phoneKey && normPhone(e.phone) === phoneKey) ||
          (addrKey && e.address.trim() && `${normVal(e.address)}|${normVal(e.city)}` === addrKey)
        );
        const dup = corroborated || sameName[0];
        if (dup && !nameWarning) {
          setNameWarning(dup);
          const reason = corroborated ? "acest nume și aceleași date de contact" : "acest nume";
          setError(`Există deja o persoană cu ${reason}: ${billingCustomerLabel(dup)}${dup.city ? ` (${dup.city})` : ""}. Dacă e altcineva, apasă din nou „Salvează” ca să continui.`);
          return;
        }
      }
    }

    setError("");
    setSaving(true);
    try {
      await onSave({ ...c, id: idRef.current });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={customer?.id ? "Editează client de facturare" : "Client de facturare nou"}>
      <div className="mode-switch" style={{ marginBottom: 14 }}>
        <button className={c.kind === "person" ? "on" : ""} onClick={() => { setC({ ...c, kind: "person" }); setError(""); setNameWarning(null); }}>
          <UserCheck size={14} /> Persoană fizică
        </button>
        <button className={c.kind === "company" ? "on" : ""} onClick={() => { setC({ ...c, kind: "company" }); setError(""); setNameWarning(null); }}>
          <Banknote size={14} /> Firmă
        </button>
      </div>

      {c.kind === "person" ? (
        <>
          <div className="field-row field-row-2col">
            <label className="field"><span className="fl">Nume *</span><input value={c.lastName} onChange={set("lastName")} placeholder="Popescu" /></label>
            <label className="field"><span className="fl">Prenume *</span><input value={c.firstName} onChange={set("firstName")} placeholder="Andrei" /></label>
          </div>
          <label className="field"><span className="fl">CNP (opțional)</span><input value={c.cnp} onChange={set("cnp")} placeholder="1234567890123" /></label>
        </>
      ) : (
        <>
          <label className="field"><span className="fl">Denumire firmă *</span><input value={c.companyName} onChange={set("companyName")} placeholder="ABC Impex SRL" /></label>
          <div className="field-row field-row-2col">
            <label className="field">
              <span className="fl">CUI/CIF *</span>
              <input className={!cuiCheck.ok ? "input-error" : ""} value={c.cui} onChange={set("cui")} placeholder="RO12345678" />
            </label>
            <label className="field"><span className="fl">Nr. Reg. Comerțului</span><input value={c.regCom} onChange={set("regCom")} placeholder="J12/345/2020" /></label>
          </div>
          {c.kind === "company" && c.cui && cuiCheck.warn && (
            <div className="note" style={{ marginTop: -6, marginBottom: 14 }}>{cuiCheck.message}</div>
          )}
          <label className="field"><span className="fl">Persoană de contact</span><input value={c.contactName} onChange={set("contactName")} placeholder="Nume persoană contact" /></label>
        </>
      )}

      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Adresă *</span><input value={c.address} onChange={set("address")} placeholder="Str. Exemplu nr. 10" /></label>
        <label className="field"><span className="fl">Oraș *</span><input value={c.city} onChange={set("city")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <div className="field">
          <label>Județ *</label>
          {c.country === "România" ? (
            <select value={c.county} onChange={set("county")}>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          ) : (
            <input value={c.county} onChange={set("county")} placeholder="Regiune" />
          )}
        </div>
        <label className="field">
          <span className="fl">Țară *</span>
          <select value={c.country} onChange={set("country")}>
            {TARI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span className="fl">Cod poștal</span><input value={c.postalCode || ""} onChange={set("postalCode")} /></label>
      <div className="field-row field-row-2col">
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" className={c.email && !emailCheck.ok ? "input-error" : ""} value={c.email} onChange={set("email")} />
        </label>
        <label className="field">
          <span className="fl">Telefon</span>
          <input className={c.phone && !phoneCheck.ok ? "input-error" : ""} value={c.phone} onChange={set("phone")} />
        </label>
      </div>

      {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
      </div>
    </Dialog>
  );
}

export function ProductModal({ product, vatRates, onSave, onClose }) {
  useModalLock();
  const [p, setP] = useState(() => ({
    name: "", internalCode: "", accountingCode: "", category: "",
    unit: "buc", vatRateId: vatRates[0]?.id || "", defaultPrice: 0,
    active: true, billingMode: "separate",
    ...(product || {}),
  }));
  const [error, setError] = useState("");
  const set = (k) => (e) => { setP({ ...p, [k]: e.target.value }); setError(""); };

  const submit = () => {
    if (!p.name.trim()) { setError("Denumirea este obligatorie."); return; }
    if (!p.category.trim()) { setError("Categoria este obligatorie."); return; }
    if (!p.vatRateId) { setError("Alege o cotă de TVA."); return; }
    onSave({
      ...p, id: product?.id || uid(), name: p.name.trim(), category: p.category.trim(),
      internalCode: p.internalCode?.trim() || "", accountingCode: p.accountingCode?.trim() || "",
      defaultPrice: Math.max(0, Number(p.defaultPrice) || 0),
    });
  };

  return (
    <Dialog onClose={onClose} title={product?.id ? "Editează produs/serviciu" : "Produs/serviciu nou"}>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Denumire *</span><input value={p.name} onChange={set("name")} placeholder="Mic dejun" /></label>
        <label className="field"><span className="fl">Categorie *</span><input value={p.category} onChange={set("category")} placeholder="mic_dejun" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Cod intern</span><input value={p.internalCode} onChange={set("internalCode")} placeholder="MIC_DEJUN" /></label>
        <label className="field"><span className="fl">Cont contabil</span><input value={p.accountingCode} onChange={set("accountingCode")} placeholder="707" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Unitate</span><input value={p.unit} onChange={set("unit")} placeholder="buc" /></label>
        <label className="field">
          <span className="fl">Cotă TVA *</span>
          <select value={p.vatRateId} onChange={set("vatRateId")}>
            {vatRates.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Preț implicit (cu TVA)</span><input type="number" min="0" value={p.defaultPrice} onChange={set("defaultPrice")} /></label>
        <label className="field">
          <span className="fl">Pe factură</span>
          <select value={p.billingMode} onChange={set("billingMode")}>
            <option value="separate">Doar separat</option>
            <option value="aggregatable">Poate fi agregat în cazare</option>
          </select>
        </label>
      </div>
      <label className="salutation-opt" style={{ display: "inline-flex", marginBottom: 14 }}>
        <input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
        Activ (apare la adăugarea de extra în folio)
      </label>
      {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit}><Check size={15} /> Salvează</button>
      </div>
    </Dialog>
  );
}

/* Datele emitentului (hotelul), afisate pe PDF-ul facturii. Stocate ca
   obiect simplu in settings (app_state), nu tabel propriu — un singur
   set de date, nu o colectie. */

export function InvoiceIssuerCard({ core, updateCore }) {
  const saved = core.invoiceIssuer || emptyInvoiceIssuer();
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    await updateCore({ ...core, invoiceIssuer: draft });
    await audit.push("Date emitent modificate", draft.name || "—");
    setSaving(false);
  };

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 20 }}>
      <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>
        Date emitent (pe factura PDF)
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Denumire</span><input value={draft.name} onChange={set("name")} placeholder="La Livada SRL" /></label>
        <label className="field"><span className="fl">CUI</span><input value={draft.cui} onChange={set("cui")} placeholder="RO12345678" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Nr. Reg. Comerțului</span><input value={draft.regCom} onChange={set("regCom")} placeholder="J12/345/2020" /></label>
        <label className="field"><span className="fl">Adresă</span><input value={draft.address} onChange={set("address")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Oraș</span><input value={draft.city} onChange={set("city")} /></label>
        <label className="field"><span className="fl">Județ</span><input value={draft.county} onChange={set("county")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">IBAN</span><input className="mono" value={draft.iban} onChange={set("iban")} placeholder="RO49 AAAA 1B31 0075 9384 0000" /></label>
        <label className="field"><span className="fl">Bancă</span><input value={draft.bank} onChange={set("bank")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Email</span><input type="email" value={draft.email} onChange={set("email")} /></label>
        <label className="field"><span className="fl">Telefon</span><input value={draft.phone} onChange={set("phone")} /></label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
        {dirty && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Modificări nesalvate</span>}
      </div>
    </div>
  );
}

export function ProductsView({ core, updateCore }) {
  const vatRates = core.vatRates || [];
  const products = core.products || [];
  const [modal, setModal] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const saveProduct = async (product) => {
    const exists = products.some((p) => p.id === product.id);
    const next = exists ? products.map((p) => (p.id === product.id ? product : p)) : [...products, product];
    await updateCore({ ...core, products: next });
    await audit.push(exists ? "Produs modificat" : "Produs adăugat", product.name);
    setModal(null);
  };
  const removeProduct = async (id) => {
    const p = products.find((x) => x.id === id);
    await updateCore({ ...core, products: products.filter((x) => x.id !== id) });
    await audit.push("Produs șters", p?.name || id);
    setConfirmId(null);
  };

  const addVatRate = async () => {
    await updateCore({ ...core, vatRates: [...vatRates, { id: uid(), label: "Cotă nouă", rate: 0, active: true }] });
  };
  const patchVatRate = async (id, patch) => {
    await updateCore({ ...core, vatRates: vatRates.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  };
  const removeVatRate = async (id) => {
    if (products.some((p) => p.vatRateId === id)) {
      toaster.show("Cota e folosită de un produs — schimbă produsul înainte de a o șterge.", { tone: "danger" });
      return;
    }
    await updateCore({ ...core, vatRates: vatRates.filter((v) => v.id !== id) });
  };

  return (
    <div>
      <InvoiceIssuerCard core={core} updateCore={updateCore} />

      <div className="note">
        Nomenclatorul de produse/servicii și cotele de TVA sunt folosite la adăugarea de extra în folio și la
        generarea facturii. Nimic de aici nu e legat direct de e-Factura.
      </div>

      <div className="toolbar">
        <span className="badge-count">{vatRates.length} cote TVA</span>
        <div className="grow" />
        <button className="btn btn-ghost" style={{ width: "auto" }} onClick={addVatRate}><Plus size={15} /> Cotă nouă</button>
      </div>
      <div className="panel" style={{ marginBottom: 20 }}>
        {vatRates.length === 0 ? (
          <div className="section-empty">Nicio cotă de TVA definită.</div>
        ) : vatRates.map((v) => (
          <div className="list-row" key={v.id}>
            <div className="field-row vat-rate-row">
              <input value={v.label} onChange={(e) => patchVatRate(v.id, { label: e.target.value })} />
              <input type="number" min="0" step="0.1" value={v.rate} onChange={(e) => patchVatRate(v.id, { rate: Number(e.target.value) || 0 })} />
              <button className="icon-btn" onClick={() => removeVatRate(v.id)} aria-label={`Șterge cota ${v.label}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <span className="badge-count">{products.length} produse/servicii</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ product: null })} disabled={!vatRates.length}>
          <Plus size={15} /> Produs nou
        </button>
      </div>
      {!vatRates.length && <div className="note">Adaugă întâi o cotă de TVA ca să poți crea produse.</div>}
      <div className="panel">
        {products.length === 0 ? (
          <div className="section-empty">Niciun produs/serviciu definit.</div>
        ) : products.map((p) => (
          <div className="list-row" key={p.id}>
            <div>
              <div className="primary">
                {p.name} {!p.active && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>(inactiv)</span>}
              </div>
              <div className="secondary">
                {p.category} · {fmtMoney(p.defaultPrice)} / {p.unit} · {vatRates.find((v) => v.id === p.vatRateId)?.label || "—"}
                {p.billingMode === "aggregatable" ? " · poate fi agregat" : ""}
              </div>
            </div>
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setModal({ product: p })} aria-label={`Editează ${p.name}`}><Pencil size={14} /></button>
              {confirmId === p.id ? (
                <>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={() => removeProduct(p.id)}>Confirmă</button>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmId(null)}>Renunță</button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setConfirmId(p.id)} aria-label={`Șterge ${p.name}`}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <ProductModal
          product={modal.product}
          vatRates={vatRates}
          onSave={saveProduct}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   FINANCIAR — facturi emise, încasări, produse & TVA, permisiuni
----------------------------------------------------------------*/

export function InvoicesListView({ core }) {
  const [invoices, setInvoices] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  /* Doua stari pentru cautare: ce se tasteaza (`search`) si ce s-a cerut
     efectiv (`searchAplicat`). Filtrarea foloseste a doua, ca lista sa nu
     se schimbe sub degete la fiecare litera — de aici si butonul. */
  const [search, setSearch] = useState("");
  const [searchAplicat, setSearchAplicat] = useState("");
  const [printInvoiceId, setPrintInvoiceId] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await dateFacturare.listeazaFacturi().then((d) => ({ data: d, error: null }), (e) => ({ data: null, error: e }));
    if (error) { setLoadError(mesajEroare(error)); return; }
    setInvoices(data || []);
    setLoadError("");
  }, []);
  useEffect(() => { load(); }, [load]);

  const customerLabel = (id) => {
    const c = (core.billingCustomers || []).find((x) => x.id === id);
    return c ? billingCustomerLabel(c) : "—";
  };

  const filtered = (invoices || []).filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (searchAplicat) {
      const hay = `${inv.series || ""} ${inv.number || ""} ${customerLabel(inv.billing_customer_id)}`.toLowerCase();
      if (!hay.includes(searchAplicat.toLowerCase())) return false;
    }
    return true;
  });

  /* Cand factura se emite din fereastra ei, lista trebuie sa reflecte
     noul serie+numar fara o reincarcare completa. */
  const dupaModificare = (actualizata) => {
    if (!actualizata) return;
    setInvoices((prev) => (prev || []).map((x) => (x.id === actualizata.id ? actualizata : x)));
  };

  const totals = filtered.reduce((s, inv) => ({
    total: s.total + Number(inv.total_amount), paid: s.paid + Number(inv.paid_amount),
  }), { total: 0, paid: 0 });

  return (
    <div>
      {/* Căutarea, statusul și butonul stau pe un singur rând; pe ecran
          îngust rândul se rupe controlat, fără să se împrăștie. */}
      <div className="toolbar filtre-facturi">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input
            placeholder="Caută serie, număr sau client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSearchAplicat(search.trim()); }}
            aria-label="Caută facturi"
          />
          {search && (
            <button type="button" className="icon-btn" aria-label="Golește căutarea"
              onClick={() => { setSearch(""); setSearchAplicat(""); }}>
              <X size={14} />
            </button>
          )}
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrează după status" className="filtru-status">
          <option value="all">Toate statusurile</option>
          {Object.keys(INVOICE_STATUS_LABEL).map((s) => (
            <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" style={{ width: "auto" }}
          onClick={() => setSearchAplicat(search.trim())}>
          <Search size={15} /> Caută
        </button>
        <div className="grow" />
        <span className="badge-count">{filtered.length} facturi · {fmtMoney(totals.total)} · încasat {fmtMoney(totals.paid)}</span>
      </div>
      {loadError ? (
        <div className="note" style={{ color: "var(--danger)" }}>{loadError}</div>
      ) : invoices === null ? (
        <div className="note">Se încarcă…</div>
      ) : filtered.length === 0 ? (
        <div className="section-empty">Nicio factură.</div>
      ) : (
        <div className="panel">
          {filtered.map((inv) => (
            <div className="list-row" key={inv.id}>
              <div>
                <div className="primary">
                  {inv.series ? `${inv.series} ${inv.number}` : "Draft"}
                  <span className={"role-tag " + INVOICE_STATUS_CLASS[inv.status]} style={{ marginLeft: 8 }}>
                    {INVOICE_STATUS_LABEL[inv.status]}
                  </span>
                </div>
                <div className="secondary">
                  {customerLabel(inv.billing_customer_id)} · {inv.issue_date ? fmtDateFull(inv.issue_date) : "neemisă"}
                </div>
              </div>
              <div className="row-actions" style={{ gap: 10 }}>
                <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(inv.total_amount)}</span>
                {/* Emiterea se face din fereastra facturii (ochiul de
                    alaturi), nu de aici: se vede intai ce contine
                    documentul si abia apoi se aloca numarul. */}
                <button className="icon-btn" onClick={() => setPrintInvoiceId(inv.id)}
                  aria-label={inv.status === "draft" ? "Deschide draftul" : "Vezi factura"}>
                  <Eye size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {printInvoiceId && (
        <InvoicePrint invoiceId={printInvoiceId} core={core} onClose={() => setPrintInvoiceId(null)} onChanged={dupaModificare} />
      )}
    </div>
  );
}

export function PaymentMethodsEditor({ core, updateCore }) {
  const methods = core.paymentMethods || [];

  const addMethod = async () => {
    await updateCore({ ...core, paymentMethods: [...methods, { id: uid(), label: "Metodă nouă", active: true, sortOrder: methods.length }] });
  };
  const patchMethod = async (id, patch) => {
    await updateCore({ ...core, paymentMethods: methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  };
  const removeMethod = async (id) => {
    await updateCore({ ...core, paymentMethods: methods.filter((m) => m.id !== id) });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="toolbar">
        <span className="badge-count">{methods.length} metode de plată</span>
        <div className="grow" />
        <button className="btn btn-ghost" style={{ width: "auto" }} onClick={addMethod}><Plus size={15} /> Metodă nouă</button>
      </div>
      <div className="panel">
        {methods.length === 0 ? (
          <div className="section-empty">Nicio metodă de plată definită.</div>
        ) : methods.map((m) => (
          <div className="list-row" key={m.id}>
            <div className="field-row" style={{ gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 10, width: "100%" }}>
              <input value={m.label} onChange={(e) => patchMethod(m.id, { label: e.target.value })} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={m.active} onChange={(e) => patchMethod(m.id, { active: e.target.checked })} /> activă
              </label>
              <button className="icon-btn" onClick={() => removeMethod(m.id)} aria-label={`Șterge ${m.label}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReceiptSeriesEditor() {
  const [row, setRow] = useState(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await datePlati.serieChitante();
      if (data) { setRow(data); setValue(data.series); }
    } catch (e) {
      /* Fara serie citita, componenta se ascunde singura (return null mai
         jos) — inainte eroarea era inghitita tacut prin destructurare. */
      console.error("serie chitante", e);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const next = value.trim().toUpperCase();
    if (!next || next === row?.series) return;
    setSaving(true);
    try {
      await datePlati.schimbaSerieChitante(next);
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut salva seria"), { tone: "danger" });
      return;
    } finally {
      setSaving(false);
    }
    await audit.push("Serie chitanțe modificată", next);
    await load();
    toaster.show("Serie de chitanțe actualizată.");
  };

  if (!row) return null;
  return (
    <div className="toolbar" style={{ marginBottom: 14 }}>
      <label className="field" style={{ maxWidth: 200, margin: 0 }}>
        <span className="fl">Serie chitanțe (numerar)</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn btn-ghost" style={{ width: "auto" }} onClick={save} disabled={saving}>Salvează</button>
      <div className="grow" />
      <span className="badge-count">Următorul număr: {row.series} {row.next_number}</span>
    </div>
  );
}

export function PaymentsListView({ core, updateCore }) {
  const [payments, setPayments] = useState(null);
  const [invoiceMap, setInvoiceMap] = useState({});
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const { plati, facturiDupaId } = await datePlati.listeazaPlatiCuFacturi();
      setPayments(plati);
      setInvoiceMap(facturiDupaId);
      setLoadError("");
    } catch (e) {
      setLoadError(mesajEroare(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const customerLabel = (id) => {
    const c = (core.billingCustomers || []).find((x) => x.id === id);
    return c ? billingCustomerLabel(c) : "—";
  };
  const methodLabel = (id) => (core.paymentMethods || []).find((m) => m.id === id)?.label || PAYMENT_METHOD_LABEL[id] || id;

  const total = (payments || []).reduce((s, p) => s + Number(p.amount), 0);

  const receiptLabel = (p) => {
    if (p.receipt_series) return `Chitanță ${p.receipt_series} ${p.receipt_number}`;
    if (p.card_receipt_number) return `Bon ${p.card_receipt_number}${p.card_receipt_date ? ` · ${fmtDateFull(p.card_receipt_date)}` : ""}`;
    return "";
  };

  return (
    <div>
      <PaymentMethodsEditor core={core} updateCore={updateCore} />
      <ReceiptSeriesEditor />
      <div className="toolbar">
        <span className="badge-count">{(payments || []).length} plăți · {fmtMoney(total)} încasat</span>
      </div>
      {loadError ? (
        <div className="note" style={{ color: "var(--danger)" }}>{loadError}</div>
      ) : payments === null ? (
        <div className="note">Se încarcă…</div>
      ) : payments.length === 0 ? (
        <div className="section-empty">Nicio plată înregistrată.</div>
      ) : (
        <div className="panel">
          {payments.map((p) => {
            const inv = invoiceMap[p.invoice_id];
            return (
              <div className="list-row" key={p.id}>
                <div>
                  <div className="primary">
                    {inv?.series ? `${inv.series} ${inv.number}` : "Factură"} · {customerLabel(inv?.billing_customer_id)}
                  </div>
                  <div className="secondary">
                    {methodLabel(p.method)} · {fmtDateFull(p.paid_at)}{p.reference ? ` · ${p.reference}` : ""}
                    {receiptLabel(p) ? ` · ${receiptLabel(p)}` : ""}
                  </div>
                </div>
                <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(p.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BillingPermissionsView() {
  const [staffList, setStaffList] = useState(null);
  const [perms, setPerms] = useState({});
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const { personal, permisiuniDupaUtilizator } = await datePersonal.personalCuPermisiuni();
      /* Adminii nu apar in ecran: au oricum tot, prin has_billing_permission. */
      setStaffList(personal.filter((u) => u.role !== "admin"));
      setPerms(permisiuniDupaUtilizator);
      setLoadError("");
    } catch (e) { setLoadError(mesajEroare(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (userId, perm, has) => {
    try {
      if (has) await datePersonal.retragePermisiune(userId, perm);
      else await datePersonal.acordaPermisiune(userId, perm);
    } catch (e) {
      toaster.show(mesajEroare(e, has ? "Nu am putut retrage permisiunea" : "Nu am putut acorda permisiunea"), { tone: "danger" });
      return;
    }
    setPerms((prev) => {
      const next = { ...prev, [userId]: new Set(prev[userId] || []) };
      if (has) next[userId].delete(perm); else next[userId].add(perm);
      return next;
    });
    const staffMember = (staffList || []).find((u) => u.user_id === userId);
    await audit.push(has ? "Permisiune facturare retrasă" : "Permisiune facturare acordată",
      `${staffMember?.name || userId} · ${BILLING_PERMISSION_LABEL[perm]}`);
  };

  if (loadError) return <div className="note" style={{ color: "var(--danger)" }}>{loadError}</div>;
  if (staffList === null) return <div className="note">Se încarcă…</div>;

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        Adminii au automat toate drepturile de facturare. Restul userilor primesc doar ce e bifat aici.
      </div>
      {staffList.length === 0 ? (
        <div className="section-empty">Niciun user non-admin.</div>
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          {staffList.map((u) => (
            <div className="list-row" key={u.user_id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div className="primary">{u.name} <span className={"role-tag role-" + u.role} style={{ marginLeft: 8 }}>{ROLE_LABEL[u.role]}</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                {BILLING_PERMISSION_KEYS.map((perm) => {
                  const has = perms[u.user_id]?.has(perm) || false;
                  return (
                    <label key={perm} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                      <input type="checkbox" checked={has} onChange={() => toggle(u.user_id, perm, has)} />
                      {BILLING_PERMISSION_LABEL[perm]}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   EXPORT CONTABILITATE — Invoice -> AccountingExportModel -> XMLAdapter.
   Formatul e generic si auto-descriptiv: nu exista inca un program de
   contabilitate tinta stabilit, deci exportam un XML clar structurat,
   usor de mapat manual sau printr-un import configurabil in aproape
   orice program. Cand se stabileste programul, se adauga un adaptor nou
   (ex. sagaXmlAdapter) care consuma acelasi AccountingExportModel — restul
   fluxului (selectie, istoric, permisiuni) nu se schimba.
----------------------------------------------------------------*/

export function xmlEscape(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildAccountingExportModel(invoice, lines, payments, customer, issuer) {
  return {
    series: invoice.series || "", number: invoice.number ?? "", status: invoice.status,
    issueDate: invoice.issue_date, serviceDateStart: invoice.service_date_start, serviceDateEnd: invoice.service_date_end,
    supplier: {
      name: issuer.name || "", taxId: issuer.cui || "", regCom: issuer.regCom || "",
      address: [issuer.address, issuer.city, issuer.county, issuer.country].filter(Boolean).join(", "),
      iban: issuer.iban || "", bank: issuer.bank || "",
    },
    customer: customer ? {
      kind: customer.kind, name: billingCustomerLabel(customer),
      taxId: customer.kind === "company" ? (customer.cui || "") : (customer.cnp || ""),
      regCom: customer.kind === "company" ? (customer.regCom || "") : "",
      address: [customer.address, customer.city, customer.county, customer.country].filter(Boolean).join(", "),
    } : null,
    lines: lines.map((l) => ({
      name: l.name, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), vatRate: Number(l.vat_rate),
      netAmount: Number(l.net_amount), vatAmount: Number(l.vat_amount), totalAmount: Number(l.total_amount),
    })),
    totals: {
      subtotalNet: Number(invoice.subtotal_net), subtotalVat: Number(invoice.subtotal_vat),
      totalAmount: Number(invoice.total_amount), paidAmount: Number(invoice.paid_amount),
    },
    payments: payments.map((p) => ({ date: p.paid_at, method: p.method, amount: Number(p.amount), reference: p.reference || "" })),
  };
}

export function genericXmlAdapter(models) {
  const money = (n) => (Number(n) || 0).toFixed(2);
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
  const invoicesXml = models.map((m) => `  <Invoice>
    <Series>${xmlEscape(m.series)}</Series>
    <Number>${xmlEscape(m.number)}</Number>
    <Status>${xmlEscape(m.status)}</Status>
    <IssueDate>${xmlEscape(dateOnly(m.issueDate))}</IssueDate>
    <ServicePeriod start="${xmlEscape(dateOnly(m.serviceDateStart))}" end="${xmlEscape(dateOnly(m.serviceDateEnd))}" />
    <Supplier>
      <Name>${xmlEscape(m.supplier.name)}</Name>
      <TaxId>${xmlEscape(m.supplier.taxId)}</TaxId>
      <RegCom>${xmlEscape(m.supplier.regCom)}</RegCom>
      <Address>${xmlEscape(m.supplier.address)}</Address>
      <IBAN>${xmlEscape(m.supplier.iban)}</IBAN>
      <Bank>${xmlEscape(m.supplier.bank)}</Bank>
    </Supplier>
    <Customer>${m.customer ? `
      <Kind>${xmlEscape(m.customer.kind)}</Kind>
      <Name>${xmlEscape(m.customer.name)}</Name>
      <TaxId>${xmlEscape(m.customer.taxId)}</TaxId>
      <RegCom>${xmlEscape(m.customer.regCom)}</RegCom>
      <Address>${xmlEscape(m.customer.address)}</Address>` : ""}
    </Customer>
    <Lines>
${m.lines.map((l) => `      <Line>
        <Name>${xmlEscape(l.name)}</Name>
        <Quantity>${l.quantity}</Quantity>
        <UnitPrice>${money(l.unitPrice)}</UnitPrice>
        <VatRate>${l.vatRate}</VatRate>
        <NetAmount>${money(l.netAmount)}</NetAmount>
        <VatAmount>${money(l.vatAmount)}</VatAmount>
        <TotalAmount>${money(l.totalAmount)}</TotalAmount>
      </Line>`).join("\n")}
    </Lines>
    <Totals>
      <SubtotalNet>${money(m.totals.subtotalNet)}</SubtotalNet>
      <SubtotalVat>${money(m.totals.subtotalVat)}</SubtotalVat>
      <TotalAmount>${money(m.totals.totalAmount)}</TotalAmount>
      <PaidAmount>${money(m.totals.paidAmount)}</PaidAmount>
    </Totals>
    <Payments>
${m.payments.map((p) => `      <Payment date="${xmlEscape(dateOnly(p.date))}" method="${xmlEscape(p.method)}" amount="${money(p.amount)}" reference="${xmlEscape(p.reference)}" />`).join("\n")}
    </Payments>
  </Invoice>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AccountingExport format="generic_v1" generatedAt="${xmlEscape(new Date().toISOString())}">\n${invoicesXml}\n</AccountingExport>\n`;
}

export function downloadTextFile(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AccountingExportView({ core }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [periodStart, setPeriodStart] = useState(toDateInput(monthStart));
  const [periodEnd, setPeriodEnd] = useState(toDateInput(today));
  const [seriesFilter, setSeriesFilter] = useState("LIV");
  const [statusFilter, setStatusFilter] = useState(() => new Set(["issued", "partially_paid", "paid"]));
  const [invoices, setInvoices] = useState([]);
  const [alreadyExported, setAlreadyExported] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState(null);

  const toggleStatus = (s) => setStatusFilter((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const facturi = await dateContabilitate.cautaFacturiDeExportat({
        deLa: periodStart, panaLa: periodEnd, serie: seriesFilter, statusuri: statusFilter,
      });
      setInvoices(facturi);
      setSelected(new Set(facturi.map((i) => i.id)));
      setAlreadyExported(await dateContabilitate.facturiDejaExportate(facturi.map((i) => i.id)));
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut încărca facturile"), { tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, seriesFilter, statusFilter]);
  useEffect(() => { search(); }, [search]);

  const loadHistory = useCallback(async () => {
    /* Istoricul e informativ: daca nu se poate citi, ecranul de export
       ramane folosibil. Inainte, eroarea era ignorata tacit prin
       destructurare; acum e macar vizibila in consola. */
    try { setHistory(await dateContabilitate.istoricExporturi()); }
    catch (e) { console.error("istoric exporturi", e); setHistory([]); }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedInvoices = invoices.filter((i) => selected.has(i.id));
  const hasReexport = selectedInvoices.some((i) => alreadyExported[i.id]);

  const runExport = async () => {
    if (!selectedInvoices.length) return;
    if (hasReexport && !canBilling("reexport_accounting")) {
      toaster.show("Unele facturi selectate au mai fost exportate — ai nevoie de permisiunea de reexport.", { tone: "danger" });
      return;
    }
    setExporting(true);
    try {
      const models = [];
      for (const inv of selectedInvoices) {
        const { linii, plati, client } = await dateContabilitate.detaliiFacturaPentruExport(inv);
        models.push(buildAccountingExportModel(inv, linii, plati, client, core.invoiceIssuer || {}));
      }
      const xml = genericXmlAdapter(models);
      const fileName = `export-contabilitate-${periodStart}_${periodEnd}.xml`;
      downloadTextFile(xml, fileName, "application/xml");

      await dateContabilitate.consemneazaExport({
        id: uid(), deLa: periodStart, panaLa: periodEnd,
        statusuri: statusFilter, serie: seriesFilter,
        numeFisier: fileName, creatDe: audit.user?.id || null,
        facturi: selectedInvoices.map((inv) => ({ id: inv.id, esteReexport: !!alreadyExported[inv.id] })),
      });

      await audit.push("Export contabilitate generat", `${selectedInvoices.length} facturi · ${periodStart} → ${periodEnd}`);
      toaster.show(`Export generat: ${selectedInvoices.length} facturi.`);
      await search();
      await loadHistory();
    } catch (e) {
      toaster.show(mesajEroare(e, "Exportul a eșuat"), { tone: "danger" });
    } finally {
      setExporting(false);
    }
  };

  if (!canBilling("export_accounting")) {
    return <div className="note">Nu ai permisiunea de a exporta date de contabilitate.</div>;
  }

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        Exportă facturile ca XML generic (denumire, sume, TVA pe fiecare linie, plăți) — de importat manual sau
        printr-un adaptor dedicat, odată ce alegi programul de contabilitate. Nimic de aici nu trimite date către
        e-Factura.
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">De la</span><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
        <label className="field"><span className="fl">Până la</span><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
      </div>
      <label className="field"><span className="fl">Serie (gol = toate seriile)</span><input value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)} placeholder="LIV" /></label>
      <div className="field">
        <span className="fl">Statusuri incluse</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 6 }}>
          {Object.keys(INVOICE_STATUS_LABEL).map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} />
              {INVOICE_STATUS_LABEL[s]}
            </label>
          ))}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <span className="badge-count">{selectedInvoices.length} din {invoices.length} facturi selectate</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={runExport} disabled={exporting || !selectedInvoices.length}>
          <FileDown size={15} /> {exporting ? "Se exportă…" : "Export XML"}
        </button>
      </div>
      {hasReexport && (
        <div className="note" style={{ color: "var(--warning)" }}>
          Unele facturi selectate au mai fost exportate anterior — vor apărea marcate ca reexport în istoric.
        </div>
      )}

      {loading ? (
        <div className="note">Se încarcă…</div>
      ) : invoices.length === 0 ? (
        <div className="section-empty">Nicio factură nu se potrivește filtrelor.</div>
      ) : (
        <div className="panel" style={{ marginTop: 10 }}>
          {invoices.map((inv) => (
            <div className="list-row" key={inv.id}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
                <div style={{ minWidth: 0 }}>
                  <div className="primary">
                    {inv.series} {inv.number}
                    <span className={"role-tag " + INVOICE_STATUS_CLASS[inv.status]} style={{ marginLeft: 8 }}>{INVOICE_STATUS_LABEL[inv.status]}</span>
                    {alreadyExported[inv.id] && <span className="role-tag role-admin" style={{ marginLeft: 8 }}>exportată</span>}
                  </div>
                  <div className="secondary">{inv.issue_date ? fmtDateFull(inv.issue_date) : "—"}</div>
                </div>
              </label>
              <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(inv.total_amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 24 }}>
        <span className="fl" style={{ margin: 0 }}>Istoric exporturi</span>
      </div>
      {history === null ? (
        <div className="note">Se încarcă…</div>
      ) : history.length === 0 ? (
        <div className="section-empty">Niciun export generat încă.</div>
      ) : (
        <div className="panel">
          {history.map((h) => (
            <div className="list-row" key={h.id}>
              <div>
                <div className="primary">{fmtDateFull(h.created_at)}{h.series_filter ? ` · seria ${h.series_filter}` : ""}</div>
                <div className="secondary">{fmtDateFull(h.period_start)} → {fmtDateFull(h.period_end)} · {h.file_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FinancialView({ core, updateCore }) {
  const [tab, setTab] = useState("invoices");

  const tabs = (
    <div className="sub-tabs">
      <button className={tab === "invoices" ? "on" : ""} onClick={() => setTab("invoices")}>
        <Receipt size={14} /> Facturi
      </button>
      <button className={tab === "payments" ? "on" : ""} onClick={() => setTab("payments")}>
        <CreditCard size={14} /> Încasări
      </button>
      <button className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>
        <Package size={14} /> Produse & TVA
      </button>
      <button className={tab === "permissions" ? "on" : ""} onClick={() => setTab("permissions")}>
        <ShieldCheck size={14} /> Permisiuni
      </button>
      <button className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>
        <FileDown size={14} /> Export
      </button>
    </div>
  );

  if (tab === "payments") return <div>{tabs}<PaymentsListView core={core} updateCore={updateCore} /></div>;
  if (tab === "products") return <div>{tabs}<ProductsView core={core} updateCore={updateCore} /></div>;
  if (tab === "permissions") return <div>{tabs}<BillingPermissionsView /></div>;
  if (tab === "export") return <div>{tabs}<AccountingExportView core={core} /></div>;
  return <div>{tabs}<InvoicesListView core={core} /></div>;
}

/* ---------------------------------------------------------------
   ROOMS / DEVICE CONFIG VIEW
----------------------------------------------------------------*/
