/* Acces la date pentru personal, autentificare si permisiuni de facturare.
 *
 * Domeniul cel mai sensibil al stratului, si de-aia merita cel mai mult sa
 * fie intr-un singur loc: raspunde la "cine are voie ce". Regula ramane
 * aceeasi — aici stau CERERILE, nu deciziile.
 *
 * De retinut: nimic din ce se citeste aici nu e o garantie de securitate.
 * Rolul si permisiunile intoarse mai jos servesc DOAR la ce arata interfata.
 * Autoritatea reala e in Postgres (RLS + has_billing_permission), care nu se
 * uita la ce crede browserul. Un browser compromis poate minti aplicatia
 * despre rolul lui, dar nu poate citi sau scrie ce nu-i permite baza.
 */
import { supabase } from "../supabase.js";

/* --- SESIUNE ------------------------------------------------------ */

export async function sesiuneCurenta() {
  const { data: { session } } = await supabase.auth.getSession();
  return session || null;
}

export async function autentifica(email, parola) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parola });
  if (error) throw error;
  return data;
}

export async function deconecteaza() {
  await supabase.auth.signOut();
}

export async function schimbaParola(parolaNoua) {
  const { error } = await supabase.auth.updateUser({ password: parolaNoua });
  if (error) throw error;
}

/* Anunta cand sesiunea se schimba in ORICE tab al aceluiasi browser —
   asa o deconectare intr-un tab goleste datele si in celelalte.
   Intoarce functia de dezabonare. */
export function laSchimbareSesiune(cheama) {
  const { data } = supabase.auth.onAuthStateChange((eveniment) => cheama(eveniment));
  return () => data.subscription.unsubscribe();
}

/* --- PERSONAL ----------------------------------------------------- */

/* Randul din `staff` al unui cont. Fara el, contul se autentifica dar nu
   primeste acces — verificarea asta se reia periodic in aplicatie, ca un tab
   lasat deschis sa nu ramana cu drepturi retrase intre timp. */
export async function membruPersonal(idUtilizator) {
  const { data, error } = await supabase
    .from("staff").select("name, role").eq("user_id", idUtilizator).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listeazaPersonal() {
  const { data, error } = await supabase
    .from("staff").select("user_id, name, role").order("name");
  if (error) throw error;
  return data || [];
}

export async function adaugaMembru({ idUtilizator, nume, rol }) {
  const { error } = await supabase
    .from("staff").insert({ user_id: idUtilizator, name: nume, role: rol });
  if (error) throw error;
}

export async function actualizeazaMembru({ idUtilizator, nume, rol }) {
  const { error } = await supabase
    .from("staff").update({ name: nume, role: rol }).eq("user_id", idUtilizator);
  if (error) throw error;
}

export async function stergeMembru(idUtilizator) {
  const { error } = await supabase.from("staff").delete().eq("user_id", idUtilizator);
  if (error) throw error;
}

/* --- PERMISIUNI DE FACTURARE -------------------------------------- */

/* Permisiunile unui singur cont — se citesc la autentificare, ca interfata
   sa stie ce butoane sa arate. */
export async function permisiunileMele(idUtilizator) {
  const { data, error } = await supabase
    .from("billing_permissions").select("permission").eq("user_id", idUtilizator);
  if (error) throw error;
  return (data || []).map((r) => r.permission);
}

/* Personalul impreuna cu permisiunile fiecaruia, pentru ecranul de
   administrare. Doua cereri, nu una per utilizator. */
export async function personalCuPermisiuni() {
  const [personal, permisiuni] = await Promise.all([
    supabase.from("staff").select("user_id, name, role").order("name"),
    supabase.from("billing_permissions").select("user_id, permission"),
  ]);
  if (personal.error) throw personal.error;
  if (permisiuni.error) throw permisiuni.error;

  const dupaUtilizator = {};
  (permisiuni.data || []).forEach((r) => {
    (dupaUtilizator[r.user_id] = dupaUtilizator[r.user_id] || new Set()).add(r.permission);
  });
  return { personal: personal.data || [], permisiuniDupaUtilizator: dupaUtilizator };
}

export async function acordaPermisiune(idUtilizator, permisiune) {
  const { error } = await supabase
    .from("billing_permissions").insert({ user_id: idUtilizator, permission: permisiune });
  if (error) throw error;
}

export async function retragePermisiune(idUtilizator, permisiune) {
  const { error } = await supabase.from("billing_permissions")
    .delete().eq("user_id", idUtilizator).eq("permission", permisiune);
  if (error) throw error;
}
