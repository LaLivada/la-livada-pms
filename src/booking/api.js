/* Legătura cu PMS-ul. Trei apeluri, atât.
 *
 * Deliberat pe `fetch`, nu pe biblioteca Supabase: aplicația publică nu
 * are nevoie de auth, realtime sau query builder, iar biblioteca ar
 * adăuga ~50 KB unui bundle pe care îl descarcă fiecare vizitator.
 *
 * Cheia de mai jos e cea publicabilă (anon) — aceeași pe care o vede
 * oricine deschide PMS-ul în browser. Nu e un secret: singurul acces pe
 * care îl dă sunt exact aceste trei funcții, fiecare cu validările ei în
 * PostgreSQL. Tabelele sunt inaccesibile.
 */

const URL_BAZA = import.meta.env.VITE_SUPABASE_URL;
const CHEIE = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL_BAZA || !CHEIE) {
  // Mai bine o eroare clară la pornire decât apeluri care eșuează tăcut.
  console.error("Lipsesc VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
}

/* Codul P0002 e ridicat de PostgreSQL când camera tocmai s-a ocupat.
   E singurul caz care merită un mesaj propriu în interfață — restul sunt
   erori neașteptate. */
export const COD_INDISPONIBIL = "P0002";

async function rpc(nume, parametri) {
  let raspuns;
  try {
    raspuns = await fetch(`${URL_BAZA}/rest/v1/rpc/${nume}`, {
      method: "POST",
      headers: {
        apikey: CHEIE,
        Authorization: `Bearer ${CHEIE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parametri),
    });
  } catch {
    // Rețea căzută: mesaj despre conexiune, nu despre server.
    const e = new Error("Nu am putut contacta serverul. Verifică conexiunea.");
    e.retea = true;
    throw e;
  }

  const text = await raspuns.text();
  let date = null;
  try { date = text ? JSON.parse(text) : null; } catch { /* răspuns ne-JSON */ }

  if (!raspuns.ok) {
    const e = new Error(date?.message || "A apărut o eroare neașteptată.");
    e.cod = date?.code;
    throw e;
  }
  return date;
}

/* Disponibilitatea. Întoarce tipuri de cameră, nu camere individuale —
   alocarea camerei fizice o face serverul la confirmare. */
export function cautaDisponibilitate({ checkin, checkout, adulti, copii }) {
  return rpc("public_availability", {
    p_checkin: checkin,
    p_checkout: checkout,
    p_adults: adulti,
    p_children: copii,
  });
}

/* Creează rezervarea.
 *
 * `cheieIdempotenta` trebuie să fie ACEEAȘI pentru toate reîncercările
 * aceleiași intenții de rezervare. Dacă cererea ajunge de două ori
 * (dublu-click, timeout urmat de retry), serverul întoarce rezervarea
 * deja creată în loc să facă a doua.
 *
 * Prețul NU se trimite: e calculat de server. Ce vede clientul pe ecran
 * până aici e informativ; totalul care contează vine în răspuns. */
export function creeazaRezervare({
  cheieIdempotenta, checkin, checkout, camere, oaspete, cerinte,
}) {
  return rpc("create_public_booking", {
    p_idempotency_key: cheieIdempotenta,
    p_checkin: checkin,
    p_checkout: checkout,
    p_last_name: oaspete.nume,
    p_first_name: oaspete.prenume,
    p_phone: oaspete.telefon,
    p_email: oaspete.email || null,
    p_city: oaspete.oras,
    p_county: oaspete.judet,
    p_country: oaspete.tara,
    p_rooms: camere,
    p_notes: cerinte || null,
  });
}

/* Pagina de confirmare. Tokenul e singura cheie — id-urile interne nu
   apar niciodată în adresă. */
export function citesteRezervare(token) {
  return rpc("public_booking_by_token", { p_token: token });
}
