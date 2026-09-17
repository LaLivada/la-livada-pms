/* FACTURARE / ECRANUL FINANCIAR — filele: produse, facturi, incasari, drepturi,
 * export contabil.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState } from "react";
import { Receipt, CreditCard, FileDown, ShieldCheck, Package, CloudUpload } from "lucide-react";
import { ProductsView } from "./produse.jsx";
import { InvoicesListView } from "./facturi-lista.jsx";
import { PaymentsListView } from "./incasari.jsx";
import { BillingPermissionsView } from "./permisiuni.jsx";
import { AccountingExportView } from "./export-contabil.jsx";
import { OblioView } from "./oblio.jsx";
import { billingPerms } from "../../lib/permisiuni.js";

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
      {billingPerms.role === "admin" && (
        <button className={tab === "oblio" ? "on" : ""} onClick={() => setTab("oblio")}>
          <CloudUpload size={14} /> Oblio
        </button>
      )}
      <button className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>
        <FileDown size={14} /> Export
      </button>
    </div>
  );

  if (tab === "payments") return <div>{tabs}<PaymentsListView core={core} updateCore={updateCore} /></div>;
  if (tab === "products") return <div>{tabs}<ProductsView core={core} updateCore={updateCore} /></div>;
  if (tab === "permissions") return <div>{tabs}<BillingPermissionsView /></div>;
  if (tab === "oblio") return <div>{tabs}<OblioView core={core} /></div>;
  if (tab === "export") return <div>{tabs}<AccountingExportView core={core} /></div>;
  return <div>{tabs}<InvoicesListView core={core} updateCore={updateCore} /></div>;
}
