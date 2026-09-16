/* FACTURARE / FACTURA — fereastra unei facturi: tiparirea, incasarea pe loc,
 * stornarea si corectiile de linie.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Receipt, CreditCard, Printer, Undo2, XCircle, ExternalLink, Send } from "lucide-react";
import * as dateFacturare from "../../data/facturare.js";
import * as dateOblio from "../../data/oblio.js";
import * as datePlati from "../../data/plati.js";
import { mesajEroare } from "../../lib/errors.js";
import { calcAmounts } from "../../lib/money.js";
import { fmtMoney, fmtDateFull } from "../../lib/format.js";
import { dataLocala } from "../../lib/timp.js";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS, PAYMENT_METHOD_LABEL, OBLIO_EFACTURA_LABEL, OBLIO_EFACTURA_CLASS } from "../../lib/constante.js";
import { Dialog, toaster, useModalLock } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";
import { canBilling } from "../../lib/permisiuni.js";
import { emiteFactura } from "./emitere.jsx";
import { billingCustomerLabel } from "./clienti-facturare.jsx";

export function InvoicePrint({ invoiceId, core, onClose, onChanged }) {
  useModalLock();
  const [invoice, setInvoice] = useState(null);
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const fisaRef = useRef(null);
  const [emitere, setEmitere] = useState(false);
  const [oblio, setOblio] = useState(null);
  const [spv, setSpv] = useState(false);

  const emite = async () => {
    if (emitere) return;
    setEmitere(true);
    try {
      const actualizata = await emiteFactura(invoice);
      if (actualizata) {
        setInvoice(actualizata);
        onChanged?.(actualizata);
      } else {
        /* Prin Oblio, un refuz lasa draftul cu mesajul lor in oblio_eroare;
           il recitim ca sa-l aratam sub butoane. */
        await load();
      }
    } finally {
      setEmitere(false);
    }
  };
  const trimiteSpv = async () => {
    if (spv) return;
    setSpv(true);
    const r = await dateOblio.cheamaOblio("efactura-trimite", { invoiceId: invoice.id });
    setSpv(false);
    if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return; }
    setInvoice(r.factura);
    onChanged?.(r.factura);
    await audit.push("e-Factura trimisă în SPV", `${r.factura.series} ${r.factura.oblio_numar || r.factura.number} · cod ${r.cod}`);
    toaster.show(OBLIO_EFACTURA_LABEL[String(r.cod)] || "Trimisă în SPV", { tone: r.cod === 2 ? "danger" : "ok" });
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
    try { setOblio(await dateOblio.setariOblio()); } catch { setOblio(null); }
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
      <div className="no-print factura-bara-actiuni">
        <span className={"role-tag " + INVOICE_STATUS_CLASS[invoice.status]}>{INVOICE_STATUS_LABEL[invoice.status]}</span>
        {/* `?? …`: un cod nou de la Oblio n-are voie sa dea
            class="… undefined" si o eticheta goala. */}
        {invoice.oblio_efactura_cod != null && (
          <span className={"role-tag oblio-chip " + (OBLIO_EFACTURA_CLASS[String(invoice.oblio_efactura_cod)] ?? "")}>
            {OBLIO_EFACTURA_LABEL[String(invoice.oblio_efactura_cod)] ?? `SPV: cod ${invoice.oblio_efactura_cod}`}
          </span>
        )}
        <div className="grow" />
        {/* Emiterea sta aici, in fereastra draftului: se vede intai ce
            contine factura si abia apoi se aloca numarul — spre deosebire
            de un buton in lista, unde se apasa fara sa vezi documentul. */}
        {invoice.status === "draft" && canBilling("issue_invoice") && (
          <button className="btn btn-primary btn-lat"
            onClick={emite} disabled={emitere}>
            <Receipt size={15} /> {emitere ? "Se emite…" : (dateOblio.oblioActiv(oblio) ? "Emite prin Oblio" : "Emite factura")}
          </button>
        )}
        {invoice.oblio_link && (
          <a className="btn btn-ghost btn-lat" href={invoice.oblio_link} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> PDF din Oblio
          </a>
        )}
        {/* Fara `oblioActiv`: pentru o factura deja in Oblio, trimiterea in
            SPV nu depinde de comutator — nici backend-ul nu-l mai cere (la
            fel ca anularea si stornarea, docs/oblio.md). */}
        {invoice.oblio_stare === "emisa" && canBilling("issue_invoice")
          && invoice.oblio_efactura_cod !== 0 && invoice.oblio_efactura_cod !== 1 && (
          <button className="btn btn-ghost btn-lat" onClick={trimiteSpv} disabled={spv}>
            <Send size={15} /> {spv ? "Se trimite…" : "Trimite în SPV"}
          </button>
        )}
        <button className="btn btn-ghost btn-lat" onClick={() => window.print()}>
          <Printer size={15} /> Printează
        </button>
      </div>
      {invoice.status === "draft" && canBilling("issue_invoice") && (
        <div className="note no-print mt-neg6 mb-14">
          {dateOblio.oblioActiv(oblio)
            ? "La emitere, Oblio alocă seria și numărul și generează PDF-ul; factura nu mai poate fi modificată — orice corecție ulterioară se face doar prin stornare."
            : "La emitere se alocă serie și număr, iar factura nu mai poate fi modificată — orice corecție ulterioară se face doar prin stornare."}
        </div>
      )}
      {/* Nota e neutra fiindca acopera doua cazuri diferite: Oblio a refuzat
          (draftul se corecteaza) SI raspunsul s-a pierdut ori PMS-ul n-a
          putut scrie (documentul poate exista deja la Oblio). */}
      {invoice.status === "draft" && invoice.oblio_stare === "eroare" && (
        <div className="note no-print oblio-eroare">
          Emiterea prin Oblio nu s-a încheiat: {invoice.oblio_eroare} Corectează dacă e cazul și apasă din nou „Emite prin Oblio” — aceeași cerere, Oblio nu emite de două ori.
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
            <div className="note no-print mt-6">
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

export function RecordPaymentInline({ invoice, core, onChanged }) {
  const [open, setOpen] = useState(false);
  const sold = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));
  const [amount, setAmount] = useState(sold);
  const methods = (core?.paymentMethods || []).filter((m) => m.active);
  const [method, setMethod] = useState(methods[0]?.id || "cash");
  const [reference, setReference] = useState("");
  const [cardReceiptNumber, setCardReceiptNumber] = useState("");
  const [cardReceiptDate, setCardReceiptDate] = useState(() => dataLocala(new Date()));
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
    let updated, plata;
    try {
      /* Plata si (la numerar) numarul de chitanta, intr-o singura tranzactie
         (inregistreaza_plata, data/plati.js): un esec nu mai consuma numarul.
         Vine si factura reincarcata — soldul si statusul sunt recalculate de
         un trigger server-side dupa inserarea platii. */
      ({ factura: updated, plata } = await datePlati.inregistreazaPlata({
        idFactura: invoice.id, suma: amount, metoda: method,
        referinta: reference.trim(),
        cuChitanta: isCash, serieChitanta: receiptSeries?.series || "CH",
        numarBonCard: isCard ? (cardReceiptNumber.trim() || null) : null,
        dataBonCard: isCard ? (cardReceiptDate || null) : null,
      }));
    } catch (e) {
      toaster.show(mesajEroare(e, "Plata a eșuat"), { tone: "danger" });
      setSaving(false); return;
    }
    const methodLabel = methods.find((m) => m.id === method)?.label || method;
    const receiptNote = plata?.receipt_series ? ` · chitanță ${plata.receipt_series} ${plata.receipt_number}` : "";
    await audit.push("Plată înregistrată", `${fmtMoney(amount)} · ${methodLabel}${receiptNote}`);
    if (updated) onChanged(updated);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="panel no-print p-16 mt-16">
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
            <div className="note mb-10">
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
          <div className="modal-actions mt-0">
            <div className="grow" />
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Renunță</button>
            <button className="btn btn-primary btn-lat" onClick={submit} disabled={saving}>
              <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary btn-lat" onClick={() => setOpen(true)}>
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
      let data;
      if (invoice.oblio_stare === "emisa") {
        /* Emisa prin Oblio → se anuleaza intai acolo; baza se schimba doar
           daca Oblio a acceptat. */
        const r = await dateOblio.cheamaOblio("anuleaza", { invoiceId: invoice.id });
        /* Mesajul lui Oblio se arata ca atare, nu prin mesajEroare, care ar
           invalui un text necunoscut in „eroare neasteptata”. */
        if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return; }
        data = r.factura;
      } else {
        data = await dateFacturare.anuleazaFactura(invoice.id);
      }
      await audit.push("Factură anulată", `${invoice.series || "draft"} ${invoice.oblio_numar || invoice.number || ""}`.trim());
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
      let original, serie, numar;
      if (invoice.oblio_stare === "emisa") {
        const r = await dateOblio.cheamaOblio("storneaza", { invoiceId: invoice.id });
        if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return; }
        original = r.original;
        serie = r.stornare.series;
        numar = r.stornare.oblio_numar || r.stornare.number;
      } else {
        const serieStorno = await dateFacturare.serieActiva();
        if (!serieStorno) {
          toaster.show("Nu există nicio serie de facturare activă. Configureaz-o în Financiar → Serii.", { tone: "danger" });
          return;
        }
        ({ original, serie, numar } = await dateFacturare.storneazaFactura(invoice, { serie: serieStorno }));
      }
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
    <div className="no-print factura-anulare-actiuni">
      {confirm === "cancel" ? (
        <>
          <span className="factura-confirmare-text">Sigur anulezi factura?</span>
          <button className="btn btn-danger btn-lat" disabled={busy} onClick={cancelInvoice}>Confirmă</button>
          <button className="btn btn-ghost btn-lat" onClick={() => setConfirm(null)}>Renunță</button>
        </>
      ) : confirm === "credit" ? (
        <>
          <span className="factura-confirmare-text">Sigur storne­zi? Se emite o factură nouă, cu sume negative.</span>
          <button className="btn btn-danger btn-lat" disabled={busy} onClick={creditInvoice}>Confirmă</button>
          <button className="btn btn-ghost btn-lat" onClick={() => setConfirm(null)}>Renunță</button>
        </>
      ) : (
        <>
          {Number(invoice.paid_amount) === 0 && canBilling("cancel_invoice") && (
            <button className="btn btn-ghost btn-lat" onClick={() => setConfirm("cancel")}>
              <XCircle size={15} /> Anulează factura
            </button>
          )}
          {canBilling("create_credit_note") && (
            <button className="btn btn-ghost btn-lat" onClick={() => setConfirm("credit")}>
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
