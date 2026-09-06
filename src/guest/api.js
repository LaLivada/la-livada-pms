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

const URL_BAZA = import.meta.env.VITE_SUPABASE_URL;
const CHEIE = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL_BAZA || !CHEIE) {
  console.error("Lipsesc VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
}

async function rpc(nume, parametri) {
  const raspuns = await fetch(`${URL_BAZA}/rest/v1/rpc/${nume}`, {
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
  if (!raspuns.ok) throw new Error(`Serverul a raspuns cu ${raspuns.status}.`);
  return raspuns.json();
}

export const citesteSejurul = (cod) => rpc("guest_stay_by_cod", { p_cod: cod });
export const citesteCodulDeAcces = (cod) => rpc("guest_access_code_by_cod", { p_cod: cod });
export const citesteMinibarul = () => rpc("guest_minibar", {});
