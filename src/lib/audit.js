/* Jurnalul de activitate — cine ce a modificat si cand.
 *
 * Obiect la nivel de modul, nu context React: orice componenta trebuie sa
 * poata consemna o actiune fara sa i se pasagereze un callback prin zece
 * nivele de props.
 *
 * A stat pana pe 9 septembrie 2026 intr-un blob JSON din `app_state`, cheia
 * `pms:log:v3`: fiecare intrare noua rescria tot vectorul. Cine putea adauga
 * o linie putea, cu aceeasi cerere, sa trimita `[]` si sa stearga tot —
 * inclusiv camerista, care avea grant explicit pe cheia aia. Iar `userName`
 * si `userRole` plecau din browser, deci o actiune putea fi semnata cu
 * numele altcuiva. Un jurnal pe care il poate rescrie cel despre care scrie
 * nu e jurnal.
 *
 * Acum e tabel (`activity_log`): INSERT are politica, UPDATE si DELETE n-au
 * niciuna, deci randul scris ramane scris. Cine l-a scris se citeste din
 * `staff` de un trigger — browserul trimite doar `action` si `detail`.
 *
 * Pentru operatiunile pe yale exista un jurnal separat, `access_audit`.
 */

import { uid } from "./uid.js";
import { supabase } from "../supabase.js";
import { toaster } from "../ui/primitive.jsx";

/* Cate intrari tine ecranul. Baza le pastreaza pe toate — plafonul de 400
   de dinainte nu era o alegere de afisare, era limita blobului, si taia
   istoricul definitiv (la mutare, cea mai veche intrare ramasa era din 21
   august). Aici doar nu cerem mai mult decat incape pe un ecran. */
const LIMITA_ECRAN = 400;

/* Bornele din `check`-urile tabelului. Taiem aici ca sa nu pice insertul pe
   o violare de constrangere — jurnalul n-are voie sa dea eroare pentru un
   detaliu lung. */
const MAX_ACTION = 200;
const MAX_DETAIL = 1000;

const catreEcran = (r) => ({
  id: String(r.id), ts: r.at, userName: r.user_name,
  userRole: r.user_role, action: r.action, detail: r.detail || "",
});

export const audit = {
  user: null,
  entries: [],
  setEntries: null,
  async push(action, detail) {
    const a = String(action ?? "").slice(0, MAX_ACTION);
    const d = detail == null ? null : String(detail).slice(0, MAX_DETAIL);
    /* Intrarea locala e doar pentru ecran, ca lista sa se miste imediat.
       Cea care conteaza e randul din baza, semnat acolo. `id`-ul ei nu se
       va potrivi cu al randului real, dar traieste doar pana la reincarcare
       si nu-l foloseste nimeni la nimic altceva decat la `key`. */
    const entry = {
      id: uid(), ts: new Date().toISOString(),
      userName: audit.user?.name || "?", userRole: audit.user?.role || "?",
      action: a, detail: d || "",
    };
    const next = [entry, ...audit.entries].slice(0, LIMITA_ECRAN);
    audit.entries = next;
    if (audit.setEntries) audit.setEntries(next);
    /* Jurnalul e secundar fata de actiunea in sine: daca scrierea lui
       esueaza, actiunea utilizatorului (rezervarea, plata) e deja
       salvata si nu are rost sa fie anulata. Anuntam discret si mergem
       mai departe. */
    try {
      const { error } = await supabase.from("activity_log")
        .insert({ action: a, detail: d });
      if (error) throw error;
    } catch (e) {
      console.error("Jurnalul nu a putut fi salvat", e);
      toaster.show("Acțiunea a fost salvată, dar nu a putut fi trecută în jurnal.", { tone: "danger" });
    }
  },
};

/* Intoarce [] in loc sa arunce, ca `loadShared` de dinainte: jurnalul se
   citeste la pornirea aplicatiei, iar aplicatia n-are voie sa refuze sa
   porneasca fiindca n-a putut citi jurnalul. Camerista primeste tot [],
   dar prin RLS — pentru ea nu e eroare, e pur si simplu gol. */
export async function incarcaJurnal(limita = LIMITA_ECRAN) {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, at, user_name, user_role, action, detail")
      .order("at", { ascending: false })
      .limit(limita);
    if (error) throw error;
    return (data || []).map(catreEcran);
  } catch (e) {
    console.error("Jurnalul nu a putut fi citit", e);
    return [];
  }
}

/* Un singur loc pentru "e admin?", in loc de audit.user?.role === "admin"
   repetat la fiecare buton care trebuie ascuns non-adminilor (stergere
   oaspeti/firme/grupuri). Tot doar pentru UI — RLS impune regula reala,
   la fel ca la canBilling mai jos. */
export const isAdmin = () => audit.user?.role === "admin";

/* Permisiuni granulare de facturare pentru userul curent — module-level
   ca audit, populat o singura data la login (vezi PMSApp). Adminii au
   automat tot (oglindeste has_billing_permission() din RLS — vezi
   schema.sql — asta e doar pentru UI, RLS impune regula reala). */
