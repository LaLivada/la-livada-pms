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
  return billingPerms.set.has(perm);
}
