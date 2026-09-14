/* FACTURARE / INCASARILE — lista incasarilor, metodele de plata si seriile de
 * chitante.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import * as datePlati from "../../data/plati.js";
import { uid } from "../../lib/uid.js";
import { mesajEroare } from "../../lib/errors.js";
import { fmtMoney, fmtDateFull } from "../../lib/format.js";
import { PAYMENT_METHOD_LABEL } from "../../lib/constante.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";
import { billingCustomerLabel } from "./clienti-facturare.jsx";

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
