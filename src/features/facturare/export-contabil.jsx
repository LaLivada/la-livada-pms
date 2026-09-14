/* FACTURARE / EXPORTUL CONTABIL — modelul lunii (facturi, linii, incasari),
 * adaptorul XML generic si descarcarea.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { descarcaText } from "../../lib/descarcare.js";
import { useState, useEffect, useCallback } from "react";
import { FileDown } from "lucide-react";
import * as dateContabilitate from "../../data/contabilitate.js";
import { uid } from "../../lib/uid.js";
import { mesajEroare } from "../../lib/errors.js";
import { fmtMoney, fmtDateFull, toDateInput } from "../../lib/format.js";
import { inceputDeLuna } from "../../lib/timp.js";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS } from "../../lib/constante.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";
import { canBilling } from "../../lib/permisiuni.js";
import { billingCustomerLabel } from "./clienti-facturare.jsx";

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

/* Mutata in lib/descarcare.js (faza 3, C6), ca s-o foloseasca si
   Rapoartele; ramane aici cu numele vechi pentru apelantii existenti. */
export function downloadTextFile(text, filename, mime) {
  return descarcaText(text, filename, mime);
}

export function AccountingExportView({ core }) {
  const today = new Date();
  const monthStart = inceputDeLuna(0, today);
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
