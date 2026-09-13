/* Legatura cu PMS-ul, pentru pagina oaspetelui. Trei apeluri, atat.
 *
 * Pe `fetch`, nu pe biblioteca Supabase, din acelasi motiv ca la booking:
 * pagina n-are nevoie de auth, realtime sau query builder, iar biblioteca
 * ar adauga ~50 KB unui bundle deschis de pe telefon, adesea pe date
 * mobile, in fata unei usi.
 *
 * Cheia e cea publicabila (anon). Nu e un secret: singurul acces pe care
 * il da sunt exact cele trei functii de mai jos, fiecare cu poarta ei in
 * PostgreSQL. Tabelele raman inaccesibile.
 */

/* Limita de timp si reincercarea stau in lib, comune cu site-ul de
   rezervari. Ce se reincearca si ce nu e decis AICI, apel cu apel. */
import { fetchCuTimeout, cuOReincercare } from "../lib/retea.js";

const URL_BAZA = import.meta.env.VITE_SUPABASE_URL;
const CHEIE = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL_BAZA || !CHEIE) {
  console.error("Lipsesc VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
}

/* Yala e la capatul unui lant (functie edge -> cloud TTLock -> gateway ->
   incuietoare) care poate dura cateva secunde bune; 15 s ar fi taiat
   deschideri care chiar reuseau. */
const TIMEOUT_USA_MS = 20_000;

async function rpc(nume, parametri) {
  let raspuns;
  try {
    raspuns = await fetchCuTimeout(`${URL_BAZA}/rest/v1/rpc/${nume}`, {
      method: "POST",
      headers: {
        apikey: CHEIE,
        Authorization: `Bearer ${CHEIE}`,
        "Content-Type": "application/json",
      },
      /* Codul intra in CORPUL cererii, nu in adresa. In bara de adrese apare
         oricum, o data; ce se poate evita e sa mai apara si in logurile
         fiecarui apel, la fiecare deschidere de pagina. */
      body: JSON.stringify(parametri),
    });
  } catch (e) {
    /* Timeout-ul vine gata marcat din lib; o retea cazuta e marcata aici,
       ca `cuOReincercare` sa stie ca e un esec de transport, nu un verdict. */
    if (e.timeout) throw e;
    const eroare = new Error("Fără legătură la internet.");
    eroare.retea = true;
    throw eroare;
  }
  if (!raspuns.ok) throw new Error(`Serverul a raspuns cu ${raspuns.status}.`);
  return raspuns.json();
}

/* Citirile se reincearca o data la un esec de transport: pe date mobile,
   in fata usii, o cerere pierduta e regula, nu exceptia, iar a doua
   incercare costa mai putin decat un „ceva n-a mers" pe ecran. */
export const citesteSejurul = (cod) => cuOReincercare(() => rpc("guest_stay_by_cod", { p_cod: cod }));
export const citesteCodulDeAcces = (cod) => cuOReincercare(() => rpc("guest_access_code_by_cod", { p_cod: cod }));
export const citesteMinibarul = () => cuOReincercare(() => rpc("guest_minibar", {}));

/* Fisa de cazare. Doua apeluri, pe acelasi `rpc` ca restul.
 *
 * `citesteFisa` intoarce `{ok, gata, date}`. `gata: true` inseamna ca fisa e
 * deja semnata SI ca nu mai vine nimic din continutul ei — nu e o scapare,
 * e regula: docs/fisa-cazare.md 3. `date` aduce doar campurile nesensibile;
 * data nasterii, locul nasterii si actul de identitate se cer de fiecare
 * data, chiar daca oaspetele a mai stat la noi.
 *
 * Semnarea NU se reincearca singura: e o scriere, iar omul are butonul in
 * fata — daca a picat, apasa din nou dupa ce vede mesajul. */
export const citesteFisa = (cod) => cuOReincercare(() => rpc("guest_fisa_precompletare", { p_cod: cod }));
export const trimiteFisa = (cod, date) =>
  rpc("guest_fisa_semneaza", { p_cod: cod, p_date: date });

/* Deschiderea usii nu e un RPC, ci o functie edge: ea vorbeste cu yala,
   ceea ce PostgreSQL n-are cum sa faca. Autorizarea sta tot in baza —
   functia cheama `guest_poate_deschide` inainte sa atinga incuietoarea.
 *
 * Aici nu se arunca la raspuns de eroare, ca la `rpc`: serverul intoarce
 * 403 cu un motiv anume („sejurul n-a inceput", „prea multe incercari"),
 * iar mesajul ala trebuie sa ajunga la om. O exceptie l-ar fi inlocuit cu
 * un „ceva n-a mers" generic, exact cand explicatia conteaza mai mult.
 *
 * Nici timeout-ul nu e exceptie: e un rezultat („n-a raspuns la timp"),
 * cu mesajul lui. Doar reteaua cazuta se propaga — App.jsx are mesajul
 * pentru ea. Fara reincercare automata: fiecare incercare conteaza la
 * plafonul de deschideri, iar omul are butonul in fata. */
export async function deschideUsa(cod) {
  let raspuns;
  try {
    raspuns = await fetchCuTimeout(`${URL_BAZA}/functions/v1/guest-unlock`, {
      method: "POST",
      headers: { apikey: CHEIE, "Content-Type": "application/json" },
      body: JSON.stringify({ cod }),
    }, TIMEOUT_USA_MS);
  } catch (e) {
    if (e.timeout) return { ok: false, mesaj: "Ușa n-a răspuns la timp. Mai încearcă o dată." };
    throw e;
  }
  let corp = null;
  try { corp = await raspuns.json(); } catch { /* raspuns fara corp */ }
  if (corp?.ok) return { ok: true };
  return { ok: false, mesaj: corp?.error || "Ușa n-a răspuns. Mai încearcă o dată." };
}
