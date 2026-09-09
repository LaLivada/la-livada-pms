/* Acces la date pentru fisele de cazare.
 *
 * Spre deosebire de `acces.js`, de aici se poate si SCRIE — receptia trebuie
 * sa poata completa fisa in locul oaspetelui. Un om de optzeci de ani fara
 * smartphone tot trebuie cazat legal, iar fara calea asta mutarea pe digital
 * n-ar elimina hartia, ci ar face-o imposibila pentru o parte din oaspeti.
 *
 * CINE AJUNGE AICI: admin si receptioner. `housekeeping` nu — cine face
 * curat n-are ce cauta in seriile de buletin. Regula sta in politicile RLS
 * din baza, nu in fisierul asta: aici doar se cere, acolo se decide.
 *
 * CE NU SE POATE, ORICAT DE MULT AR PAREA CA LIPSESTE: modificarea unei
 * fise. Documentul e imuabil dupa semnare, iar triggerul `fise_cazare_imuabila`
 * respinge orice update in afara anularii. Corectiile se fac prin `anuleaza`
 * si o fisa noua — vezi docs/fisa-cazare.md 2.
 */
import { supabase } from "../supabase.js";

/* Fisa activa a unei rezervari, sau null. Indexul partial din baza
   garanteaza ca nu pot exista doua neanulate pe acelasi (rezervare, ordine). */
export async function fisaActiva(idRezervare, ordine = 1) {
  const { data, error } = await supabase.from("fise_cazare")
    .select("*")
    .eq("reservation_id", idRezervare)
    .eq("ordine", ordine)
    .is("anulata_la", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/* Toate fisele unei rezervari, anulate incluse, cea mai noua prima.
   Anulatele raman vizibile deliberat: un document legal care dispare fara
   urma e mai rau decat unul gresit. */
export async function fisePentruRezervare(idRezervare) {
  const { data, error } = await supabase.from("fise_cazare")
    .select("*")
    .eq("reservation_id", idRezervare)
    .order("semnat_la", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* Cate rezervari din lista au fisa completata. O singura cerere pentru tot
   ecranul, nu una pe rand: indicatorul apare pe fiecare rezervare din zi, iar
   la douazeci de camere ar fi insemnat douazeci de dus-intorsuri. */
export async function rezervariCuFisa(idRezervari) {
  if (!idRezervari?.length) return new Set();
  const { data, error } = await supabase.from("fise_cazare")
    .select("reservation_id")
    .in("reservation_id", idRezervari)
    .is("anulata_la", null);
  if (error) throw error;
  return new Set((data || []).map((r) => r.reservation_id));
}

/* Toate fisele, pentru ecranul „Fise" din Clienti. Cele anulate sunt incluse:
   un document legal care dispare din liste fara urma e mai rau decat unul
   gresit — acelasi motiv ca la `fisePentruRezervare`.

   Vine din vederea `fise_cazare_lista`, nu din tabel, ca sa NU vina si
   semnaturile: la cateva sute de fise ar fi insemnat sute de kilobytes de
   desen trimisi degeaba la fiecare intrare in ecran. Vederea pastreaza doar
   `are_semnatura`, singurul lucru care conteaza in lista; desenul se cere
   separat, prin `fisaIntreaga`, cand chiar se deschide una. */
export async function toateFisele(limita = 500) {
  const { data, error } = await supabase.from("fise_cazare_lista")
    .select("*")
    .order("semnat_la", { ascending: false })
    .limit(limita);
  if (error) throw error;
  return data || [];
}

/* Randul intreg al unei fise, semnatura inclusa. O singura cerere, la
   deschidere — perechea lui `toateFisele`. */
export async function fisaIntreaga(idFisa) {
  const { data, error } = await supabase.from("fise_cazare")
    .select("*").eq("id", idFisa).maybeSingle();
  if (error) throw error;
  return data || null;
}

/* Are rezervarea o fisa neanulata? Intrebarea apare la STERGEREA rezervarii:
   `on delete cascade` duce stergerea pana la fisa, iar acolo triggerul
   `fise_cazare_imuabila` o refuza — un document legal nu se sterge, se
   anuleaza. Bine de aflat inainte, nu dupa ce receptia a apasat deja
   butonul si i s-a revocat oaspetelui codul de usa.

   Trece prin `rezervariCuFisa` ca sa existe o singura definitie a lui „are
   fisa" — inclusiv pentru insotitori, care au alt `ordine` si pe care
   `fisaActiva(id)` i-ar rata. */
export async function areFisaActiva(idRezervare) {
  return (await rezervariCuFisa([idRezervare])).has(idRezervare);
}

/* Fisa scrisa de la receptie.
 *
 * `completataDe` inseamna „cine a tastat", nu „in locul semnaturii": daca
 * oaspetele semneaza pe tableta receptiei, fisa are si semnatura, si numele
 * celui care a completat-o. Cand nu semneaza, `faraSemnaturaMotiv` e
 * obligatoriu — constrangerea din baza il cere, iar formularul il cere
 * inainte, ca receptionerul sa nu afle de la o eroare de Postgres. */
export async function scrieFisa(fisa) {
  const { error } = await supabase.from("fise_cazare").insert(fisa);
  if (error) throw error;
  return true;
}

/* Anularea. Nu sterge nimic — randul ramane, marcat.
 *
 * DE STIUT INAINTE DE A O FOLOSI: dupa anulare, linkul oaspetelui redevine
 * deschis pentru scriere, fiindcă cheia lui e „nu exista deja o fisa activa".
 * Corect cand receptia vrea ca oaspetele s-o refaca, dar inseamna ca anularea
 * redeschide pentru cateva minute fereastra pe care modelul de securitate o
 * inchide (docs/fisa-cazare.md 5). Nu e o operatie de rutina. */
export async function anuleaza(idFisa, deCine, motiv) {
  const { error } = await supabase.from("fise_cazare")
    .update({
      anulata_la: new Date().toISOString(),
      anulata_de: deCine,
      anulata_motiv: motiv,
    })
    .eq("id", idFisa);
  if (error) throw error;
  return true;
}
