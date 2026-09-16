/* Poarta features/facturare.jsx (faza 4, D1): dupa spargerea in
 * features/facturare/, exporta aceleasi nume ca inainte. Un export lipsa s-ar
 * vedea abia cand cineva deschide Financiar sau o fisa de rezervare (import
 * lazy), nu la build; testul asta il prinde la `npm test`, si odata cu el
 * orice fisier din dosar care nu se mai incarca.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

const poarta = await import("./features/facturare.jsx");

const NUMELE = [
  "emiteFactura", "ensureCazareLine", "FolioPanel", "AddExtraForm", "InvoiceBuilderModal",
  "RecordPaymentInline", "InvoiceCancelCreditActions", "InvoiceLineEditRow", "InvoicePrint",
  "billingCustomerLabel", "BillingCustomerPicker", "BillingCustomerModal",
  "ProductModal", "InvoiceIssuerCard", "ProductsView", "InvoicesListView",
  "PaymentMethodsEditor", "ReceiptSeriesEditor", "PaymentsListView", "BillingPermissionsView",
  "OblioView",
  "xmlEscape", "buildAccountingExportModel", "genericXmlAdapter", "downloadTextFile",
  "AccountingExportView", "FinancialView",
];

describe("poarta features/facturare.jsx", () => {
  it("exporta toate componentele si functiile de dinainte de spargere, ca functii", () => {
    const lipsa = NUMELE.filter((n) => typeof poarta[n] !== "function");
    expect(lipsa, "nume care nu mai ies din poarta").toEqual([]);
  });

  it("nu exporta nimic in plus fata de inainte", () => {
    expect(Object.keys(poarta).sort()).toEqual([...NUMELE].sort());
  });
});
