/* FACTURARE / LISTA FACTURILOR — toate facturile, cu filtre si deschiderea
 * fiecareia.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useCallback } from "react";
import { X, Search, Eye, ExternalLink } from "lucide-react";
import * as dateFacturare from "../../data/facturare.js";
import { mesajEroare } from "../../lib/errors.js";
import { fmtMoney, fmtDateFull } from "../../lib/format.js";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS, OBLIO_EFACTURA_LABEL, OBLIO_EFACTURA_CLASS } from "../../lib/constante.js";
import { InvoicePrint } from "./factura.jsx";
import { billingCustomerLabel } from "./clienti-facturare.jsx";

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
                  {/* `?? …`: un cod nou de la Oblio n-are voie sa dea
                      class="… undefined" si o eticheta goala. */}
                  {inv.oblio_efactura_cod != null && (
                    <span className={"role-tag oblio-chip " + (OBLIO_EFACTURA_CLASS[String(inv.oblio_efactura_cod)] ?? "")}>
                      {OBLIO_EFACTURA_LABEL[String(inv.oblio_efactura_cod)] ?? `SPV: cod ${inv.oblio_efactura_cod}`}
                    </span>
                  )}
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
                {inv.oblio_link && (
                  <a className="icon-btn" href={inv.oblio_link} target="_blank" rel="noopener noreferrer" aria-label="PDF din Oblio">
                    <ExternalLink size={14} />
                  </a>
                )}
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
