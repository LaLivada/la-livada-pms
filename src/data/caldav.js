// @ts-check
/* Salile de evenimente si contul CalDAV — datele pentru ecranul „Sali si
   CalDAV" (admin) si pentru „Contul tau" (fiecare user). Serverul CalDAV
   propriu-zis e functia supabase/functions/caldav; aici sunt doar tabelele
   lui (caldav_calendare, caldav_obiecte, caldav_conturi) si importul de
   fisiere .ics, care trece prin functie (parsarea sta intr-un singur loc).

   Parola CalDAV: generata aici, in browser, aratata o singura data; in
   baza ajunge doar hash-ul ei SHA-256 (caldav_conturi.parola_hash). Functia
   compara hash-ul la fiecare cerere a telefonului. */
import { supabase } from "../supabase.js";

const CALENDAR = "id, slug, nume, culoare, ordine, ctag, activ, creat_la, actualizat_la";

/** @typedef {{ id: string, slug: string, nume: string, culoare: string | null, ordine: number, ctag: number, activ: boolean, creat_la: string, actualizat_la: string }} CalendarSala */

/** @returns {Promise<CalendarSala[]>} */
export async function listeazaCalendare() {
  const { data, error } = await supabase.from("caldav_calendare").select(CALENDAR).order("ordine").order("nume");
  if (error) throw error;
  return data || [];
}

/* Cate evenimente vii are fiecare calendar: { [calendar_id]: n }. */
/** @returns {Promise<Record<string, number>>} */
export async function numarEvenimente() {
  const { data, error } = await supabase.from("caldav_obiecte").select("calendar_id").eq("sters", false);
  if (error) throw error;
  /** @type {Record<string, number>} */
  const n = {};
  for (const r of data || []) n[r.calendar_id] = (n[r.calendar_id] || 0) + 1;
  return n;
}

/* „Sala Mare & Terasă" → "sala-mare-terasa": segmentul din adresa CalDAV. */
/** @param {string} nume */
export function slugDin(nume) {
  const s = nume.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "sala";
}

/** @param {{ nume: string, culoare: string | null }} p */
export async function adaugaCalendar({ nume, culoare }) {
  const existente = await listeazaCalendare();
  const baza = slugDin(nume);
  let slug = baza;
  for (let i = 2; existente.some((c) => c.slug === slug); i++) slug = `${baza}-${i}`;
  const { data, error } = await supabase.from("caldav_calendare")
    .insert({ slug, nume, culoare, ordine: existente.length }).select(CALENDAR).single();
  if (error) throw error;
  return data;
}

/** @param {string} id @param {{ nume?: string, culoare?: string | null, ordine?: number, activ?: boolean }} campuri */
export async function actualizeazaCalendar(id, campuri) {
  const { data, error } = await supabase.from("caldav_calendare")
    .update({ ...campuri, actualizat_la: new Date().toISOString() }).eq("id", id).select(CALENDAR).single();
  if (error) throw error;
  return data;
}

/** @param {string} id */
export async function stergeCalendar(id) {
  const { error } = await supabase.from("caldav_calendare").delete().eq("id", id);
  if (error) throw error;
}

/** @typedef {{ user_id: string, utilizator: string, email: string | null, creat_la: string, ultima_folosire: string | null }} ContCaldav */

/** @param {string} userId @returns {Promise<ContCaldav | null>} */
export async function contCaldav(userId) {
  const { data, error } = await supabase.from("caldav_conturi")
    .select("user_id, utilizator, email, creat_la, ultima_folosire").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

const ALFABET = "abcdefghjkmnpqrstuvwxyz23456789";

/* Patru grupe de cinci caractere fara cele care se confunda (0/o, 1/l/i):
   ~99 de biti, usor de tastat o singura data in telefon. */
export function parolaNoua() {
  const litere = [];
  const prag = 256 - (256 % ALFABET.length);
  while (litere.length < 20) {
    const r = new Uint8Array(32);
    crypto.getRandomValues(r);
    for (const b of r) if (b < prag && litere.length < 20) litere.push(ALFABET[b % ALFABET.length]);
  }
  return [0, 5, 10, 15].map((i) => litere.slice(i, i + 5).join("")).join("-");
}

/** @param {string} text */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Creeaza sau inlocuieste contul CalDAV al userului; intoarce parola in
   clar, o singura data. Cea veche nu mai merge din clipa asta. */
/** @param {{ userId: string, utilizator: string, email: string | null }} p */
export async function genereazaParolaCaldav({ userId, utilizator, email }) {
  const parola = parolaNoua();
  const parola_hash = await sha256Hex(parola);
  const { error } = await supabase.from("caldav_conturi")
    .upsert({ user_id: userId, utilizator: utilizator.trim().toLowerCase(), email, parola_hash, creat_la: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
  return parola;
}

/** @param {string} userId */
export async function stergeContCaldav(userId) {
  const { error } = await supabase.from("caldav_conturi").delete().eq("user_id", userId);
  if (error) throw error;
}

/* Importul unui .ics exportat (Synology, Apple...) intr-o sala: functia
   imparte fisierul in obiecte per UID si le scrie; ce exista deja identic
   se ignora. Raspuns: { noi, actualizate, ignorate, total }. */
/** @param {string} slug @param {string} text @returns {Promise<{ noi: number, actualizate: number, ignorate: number, total: number }>} */
export async function importaICS(slug, text) {
  const { data, error } = await supabase.functions.invoke(`caldav/import/${encodeURIComponent(slug)}`, {
    body: text,
    headers: { "Content-Type": "text/calendar" },
  });
  if (error) throw error;
  return data;
}
