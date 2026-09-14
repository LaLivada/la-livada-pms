/* FACTURARE / PRODUSE SI EMITENT — catalogul de produse si servicii (cu TVA)
 * si datele firmei care emite facturile.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect } from "react";
import { Plus, Check, Trash2, Pencil } from "lucide-react";
import { uid } from "../../lib/uid.js";
import { fmtMoney } from "../../lib/format.js";
import { Dialog, toaster, useModalLock } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";

const emptyInvoiceIssuer = () => ({
  name: "", cui: "", regCom: "", address: "", city: "", county: "",
  country: "România", iban: "", bank: "", email: "", phone: "",
});

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
