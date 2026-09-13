/* Acces la date pentru OASPETI, la cerere.
 *
 * Din 13 septembrie 2026 (faza 1, docs/faza1.md §2.4) browserul nu mai tine
 * toti oaspetii: `core.guests` e un CACHE — cei din fereastra de rezervari,
 * cei gasiti prin cautare si cei creati in sesiune. Tot ce inseamna „toti"
 * (lista din Clienti, numarul lor, cautarea, istoricul unuia) vine de aici,
 * paginat sau limitat, si nu trece prin `updateCore`.
 *
 * Aceleasi reguli ca in restul stratului: doar cereri, iesirea in forma
 * aplicatiei (camelCase), erorile aruncate mai departe.
 */
import { supabase } from "../supabase.js";
import { camelGuest, snakeGuest, camelRes } from "./mapari.js";
import { GUEST_HISTORY_PAGE_SIZE } from "../lib/constante.js";

/* Cati oaspeti pe o pagina din Clienti. */
export const OASPETI_PE_PAGINA = 30;
/* Cate rezultate aduce o cautare: in formularul de rezervare se aleg
   oricum primele cateva; in Clienti lista e paginata local, pana la plafon
   (functia din baza nu da mai mult de 100). */
export const LIMITA_CAUTARE = 20;
export const LIMITA_CAUTARE_LISTA = 100;
/* Sub 3 caractere serverul nu e intrebat: un index trigram n-are ce cauta
   intr-un „%ab%" (nicio trigrama intreaga), deci ar citi toata tabela —
   100 ms pe 40.000 de oaspeti (bench), la fiecare tasta. */
export const MIN_LITERE_CAUTARE = 3;

/* Cautare „contine" pe nume, oras si telefon (doar cifre, de la 3 in sus) —
   functia `cauta_oaspeti` din schema.sql, pe indexuri trigram. Textul gol
   nu cere nimic. */
export async function cautaOaspeti(text, limita = LIMITA_CAUTARE) {
  const t = String(text || "").trim();
  if (!t) return [];
  const { data, error } = await supabase.rpc("cauta_oaspeti", { p_text: t, p_limita: limita });
  if (error) throw error;
  return (data || []).map(camelGuest);
}

/* O pagina din lista completa, in ordinea numelui, cu numarul total. Offset,
   nu keyset: ecranul are „31–60 din 2.688" si sare direct la o pagina; cu
   indexul `guests_ordine_nume` saltul la pagina 1.000 costa 13 ms pe 40.000
   de oaspeti (bench, docs/faza1.md). */
export async function oaspetiPagina(pagina, pePagina = OASPETI_PE_PAGINA) {
  const de = (Math.max(1, pagina) - 1) * pePagina;
  const { data, count, error } = await supabase.from("guests")
    .select("*", { count: "exact" })
    .order("last_name").order("first_name").order("id")
    .range(de, de + pePagina - 1);
  if (error) throw error;
  return { oaspeti: (data || []).map(camelGuest), total: count ?? 0 };
}

export async function numarOaspeti() {
  const { count, error } = await supabase.from("guests").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/* Sejururi, nopti, incasat si ultima sosire pentru o lista de oaspeti —
   vederea `oaspeti_statistici`, aceeasi definitie ca fostul calcul din
   browser (isLive / isStatsEligible / nightsBetween). Map dupa id; cine nu
   are niciun sejur lipseste din ea. */
export async function sumarOaspeti(ids) {
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return new Map();
  const { data, error } = await supabase.from("oaspeti_statistici").select("*").in("guest_id", lista);
  if (error) throw error;
  return new Map((data || []).map((s) => [s.guest_id, {
    sejururi: Number(s.sejururi) || 0, nopti: Number(s.nopti) || 0,
    incasat: Number(s.incasat) || 0, ultimaSosire: s.ultima_sosire || null,
  }]));
}

/* Sejururile unui oaspete, cele mai noi intai, paginate, cu totalul. */
export async function istoricOaspete(guestId, pagina, pePagina = GUEST_HISTORY_PAGE_SIZE) {
  const de = (Math.max(1, pagina) - 1) * pePagina;
  const { data, count, error } = await supabase.from("reservations")
    .select("*", { count: "exact" })
    .eq("guest_id", guestId)
    .order("checkin", { ascending: false }).order("id")
    .range(de, de + pePagina - 1);
  if (error) throw error;
  return { sejururi: (data || []).map(camelRes), total: count ?? 0 };
}

/* Cate rezervari (orice status) si cate grupuri il au pe oaspete — inainte
   de stergere. Baza refuza oricum (guest_id e ON DELETE RESTRICT), dar un
   mesaj clar bate o eroare de constrangere urmata de reincarcare. */
export async function legaturiOaspete(guestId) {
  const [rez, gr] = await Promise.all([
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("guest_id", guestId),
    supabase.from("res_groups").select("id", { count: "exact", head: true }).eq("main_guest_id", guestId),
  ]);
  if (rez.error) throw rez.error;
  if (gr.error) throw gr.error;
  return { rezervari: rez.count ?? 0, grupuri: gr.count ?? 0 };
}

/* Un singur rand, upsert; intoarce randul asa cum a ramas in baza. */
export async function salveazaOaspete(oaspete) {
  const { data, error } = await supabase.from("guests")
    .upsert(snakeGuest(oaspete), { onConflict: "id" }).select().single();
  if (error) throw error;
  return camelGuest(data);
}
