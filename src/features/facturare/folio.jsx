/* FACTURARE / FOLIO — contul sejurului din fisa de rezervare: liniile, extra-
 * urile, alegerea a ce intra pe factura si emiterea ei.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useCallback } from "react";
import { Plus, Check, Trash2, Receipt, Eye } from "lucide-react";
import { supabase } from "../../supabase.js";
import * as dateFacturare from "../../data/facturare.js";
import * as dateFolio from "../../data/folio.js";
import { camelBillingCustomer, snakeBillingCustomer } from "../../data/mapari.js";
import { uid } from "../../lib/uid.js";
import { mesajEroare } from "../../lib/errors.js";
import { calcAmounts, round2 } from "../../lib/money.js";
import { fmtMoney, fmtDate, toDateInput } from "../../lib/format.js";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS } from "../../lib/constante.js";
import { Dialog, toaster, useModalLock } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";
import { canBilling } from "../../lib/permisiuni.js";
import { guestFullName } from "../../lib/nume.js";
import { emiteFactura, ensureCazareLine } from "./emitere.jsx";
import { InvoicePrint } from "./factura.jsx";
import { BillingCustomerPicker } from "./clienti-facturare.jsx";

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

      await audit.push("Factură creată (draft)", `${fmtMoney(total)} · ${nrLinii} poziții`, { roomId: reservation.roomId, reservationId: reservation.id });
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
