/* Traducerea intre randurile din Postgres (snake_case) si obiectele folosite
 * in aplicatie (camelCase).
 *
 * Stau aici, langa stratul de acces la date, nu in pms-app.jsx: sunt parte din
 * granita cu baza, nu din interfata. Un modul din `src/data/` care intoarce
 * randuri brute ar muta traducerea inapoi in componente si ar face granita
 * permeabila — ce iese din `data/` are deja forma pe care o foloseste restul
 * aplicatiei.
 *
 * Modulul creste pe masura ce se migreaza domeniile (facturare, personal,
 * nucleu); deocamdata contine doar ce foloseste exportul de contabilitate.
 */

export const camelBillingCustomer = (c) => ({
  id: c.id, kind: c.kind,
  lastName: c.last_name || "", firstName: c.first_name || "", cnp: c.cnp || "",
  companyName: c.company_name || "", cui: c.cui || "", regCom: c.reg_com || "",
  contactName: c.contact_name || "",
  address: c.address || "", city: c.city || "", county: c.county || "",
  postalCode: c.postal_code || "", country: c.country || "România",
  email: c.email || "", phone: c.phone || "", guestId: c.guest_id || "",
  createdAt: c.created_at,
});

export const snakeBillingCustomer = (c) => ({
  id: c.id, kind: c.kind,
  last_name: c.kind === "person" ? (c.lastName || null) : null,
  first_name: c.kind === "person" ? (c.firstName || null) : null,
  cnp: c.kind === "person" ? (c.cnp || null) : null,
  company_name: c.kind === "company" ? (c.companyName || null) : null,
  cui: c.kind === "company" ? (c.cui || null) : null,
  reg_com: c.kind === "company" ? (c.regCom || null) : null,
  contact_name: c.kind === "company" ? (c.contactName || null) : null,
  address: c.address || "", city: c.city || "", county: c.county || "",
  postal_code: c.postalCode || null, country: c.country || "România",
  email: c.email || null, phone: c.phone || null, guest_id: c.guestId || null,
});
