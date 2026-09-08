/* Permisiunile granulare de facturare ale utilizatorului curent.
 *
 * Obiect la nivel de modul, populat o singura data la autentificare: e
 * consultat din aproape toate ecranele, iar un context React ar insemna sa-l
 * pasezi prin zece nivele de props.
 *
 * ATENTIE la ce inseamna: raspunde la "ce ARATA interfata", nu la "ce are
 * voie sa faca omul". Regula reala e in Postgres — has_billing_permission()
 * plus politicile RLS — si se aplica indiferent ce crede browserul. Daca
 * cineva modifica obiectul asta din consola, vede butoane in plus, dar baza
 * ii refuza scrierile la fel.
 *
 * Adminii au tot, automat — oglindeste is_admin() din schema.
 */
export const billingPerms = { role: null, set: new Set() };

export function canBilling(perm) {
  if (billingPerms.role === "admin") return true;
  /* Si rolul, nu doar permisiunea. Randurile din `billing_permissions` nu se
     sterg la retrogradare — flagul `permisiuni_implicite_acordate` exista
     tocmai ca o repromovare sa nu reacorde tacit ce retrasese cineva manual
     — deci un fost receptioner ramane cu setul lui in tabel. Baza il refuza
     de acum (vezi has_billing_permission in schema.sql); aici ii ascundem si
     butoanele, ca sa nu apese pe ele si sa ia eroare. */
  if (billingPerms.role !== "receptionist") return false;
  return billingPerms.set.has(perm);
}
