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
 *
 * Din faza 4 (D1, docs/audit-2026-09.md) fisierul e doar poarta de intrare:
 * componentele stau in features/facturare/, grupate pe ce fac (clientii de
 * facturare, emiterea, folio, factura, produse, lista facturilor, incasari,
 * drepturi, export, ecranul financiar), cu aceleasi nume si acelasi
 * comportament. Cine importa de aici (pms-app, clienti, rezervari) n-a
 * trebuit sa se schimbe; codul nou se pune direct in fisierul potrivit.
 */
export { emiteFactura, ensureCazareLine } from "./facturare/emitere.jsx";
export { FolioPanel, AddExtraForm, InvoiceBuilderModal } from "./facturare/folio.jsx";
export { RecordPaymentInline, InvoiceCancelCreditActions, InvoiceLineEditRow, InvoicePrint } from "./facturare/factura.jsx";
export { billingCustomerLabel, BillingCustomerPicker, BillingCustomerModal } from "./facturare/clienti-facturare.jsx";
export { ProductModal, InvoiceIssuerCard, ProductsView } from "./facturare/produse.jsx";
export { InvoicesListView } from "./facturare/facturi-lista.jsx";
export { PaymentMethodsEditor, ReceiptSeriesEditor, PaymentsListView } from "./facturare/incasari.jsx";
export { BillingPermissionsView } from "./facturare/permisiuni.jsx";
export { OblioView } from "./facturare/oblio.jsx";
export { xmlEscape, buildAccountingExportModel, genericXmlAdapter, downloadTextFile, AccountingExportView } from "./facturare/export-contabil.jsx";
export { FinancialView } from "./facturare/financiar.jsx";
