// @ts-check
/* Acces la date pentru folio — nota de consum a unui sejur: cazarea plus
 * serviciile adaugate pe parcurs, inainte sa devina factura.
 *
 * Aceleasi reguli ca in restul stratului `src/data/`: doar cereri, fara
 * decizii de permisiuni, fara toast-uri, fara stare React.
 */
import { supabase } from "../supabase.js";
import { uid } from "../lib/uid.js";

/* Folio-ul unei rezervari, creat daca nu exista inca.

   Doua cereri din aceeasi fila pentru aceeasi rezervare impart aceeasi
   creare (`inCurs`): pe 26 septembrie 2026, dupa un check-in, panoul folio
   s-a incarcat de doua ori la 150 ms distanta (a doua oara la reincarcarea
   lui `core` dupa reconectarea Realtime) si ambele incarcari l-au creat —
   a doua a primit 409. Intre dispozitive diferite cursa ramane posibila:
   coloana `folios.reservation_id` e unica, deci al doilea ia 23505 si
   citeste randul celuilalt in loc sa esueze. */
const inCurs = new Map();

/** @param {string} idRezervare */
export function folioPentruRezervare(idRezervare) {
  const deja = inCurs.get(idRezervare);
  if (deja) return deja;
  const cerere = cautaSauCreeazaFolio(idRezervare).finally(() => inCurs.delete(idRezervare));
  inCurs.set(idRezervare, cerere);
  return cerere;
}

/** @param {string} idRezervare */
async function cautaSauCreeazaFolio(idRezervare) {
  const { data: gasit, error } = await supabase
    .from("folios").select("*").eq("reservation_id", idRezervare).maybeSingle();
  if (error) throw error;
  if (gasit) return gasit;
  const { data: creat, error: eCreare } = await supabase
    .from("folios").insert({ id: uid(), reservation_id: idRezervare }).select().maybeSingle();
  if (!eCreare) return creat;
  if (eCreare.code !== "23505") throw eCreare;
  const { data: alCeluilalt, error: eRecitire } = await supabase
    .from("folios").select("*").eq("reservation_id", idRezervare).maybeSingle();
  if (eRecitire) throw eRecitire;
  return alCeluilalt;
}

/* Pozitiile unui folio, in ordinea in care s-au petrecut. */
export async function pozitiiFolio(idFolio) {
  const { data, error } = await supabase
    .from("folio_items").select("*").eq("folio_id", idFolio).order("occurred_at");
  if (error) throw error;
  return data || [];
}

/* Scrie (sau actualizeaza) linia de cazare a unui folio.
   `upsert`, nu `insert`: linia de cazare e una singura per folio si se
   recalculeaza cand se schimba perioada sau pretul rezervarii. */
export async function salveazaLinieCazare(rand) {
  const { data, error } = await supabase
    .from("folio_items").upsert(rand).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function adaugaPozitie(rand) {
  const { data, error } = await supabase
    .from("folio_items").insert(rand).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* Sterge o pozitie. Regula "pozitiile facturate nu se sterg" NU e impusa
   aici — sta in interfata si, ca plasa de siguranta, in RLS. */
export async function stergePozitie(idPozitie) {
  const { error } = await supabase.from("folio_items").delete().eq("id", idPozitie);
  if (error) throw error;
}
