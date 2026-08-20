/* Traducerea erorilor de la Supabase/Postgres în limbaj de recepție.
 *
 * Până acum, orice eșec de scriere ajungea la utilizator ca text brut din
 * Postgres — nume de constrângeri ("fara_suprapunere"), formulări de RLS
 * ("new row violates row-level security policy"). Nu e o scurgere de date
 * sensibile, dar pentru cineva de la recepție e neinteligibil, iar în
 * cazul RLS chiar induce în eroare (pare o defecțiune, când de fapt e o
 * lipsă de drepturi).
 *
 * Regula: se traduce după CODUL erorii (stabil, documentat de Postgres),
 * nu după textul ei (care se schimbă între versiuni). Textul se
 * folosește doar ca ultimă soluție, când codul lipsește.
 */

/* Coduri Postgres/PostgREST relevante pentru scrierile din aplicație.
   Lista completă: https://www.postgresql.org/docs/current/errcodes-appendix.html */
const DUPA_COD = {
  "23505": "Există deja o înregistrare cu aceleași date.",
  "23503": "Înregistrarea e legată de altceva care nu există (sau a fost ștearsă între timp).",
  "23514": "Datele introduse nu respectă o regulă de validare.",
  "23502": "Un câmp obligatoriu a rămas necompletat.",
  "23P01": "Camera este deja ocupată în acea perioadă.",
  "40001": "Altcineva a modificat aceleași date între timp. Am reîncărcat — verifică și reia modificarea.",
  "42501": "Nu ai dreptul să faci această modificare.",
  "P0001": null,   // raise exception din funcțiile noastre — mesajul e deja scris pentru utilizator
  "PGRST301": "Sesiunea a expirat. Autentifică-te din nou.",
  /* Nu vine de la Postgres: îl ridicăm noi când un import dinamic eșuează.
     Fișierele încărcate la cerere (bibliotecile de PDF) au un hash în nume
     care se schimbă la fiecare build, deci o filă lăsată deschisă peste un
     deploy cere un fișier care nu mai există. */
  "APP_VERSIUNE": "A apărut o versiune nouă a aplicației. Reîncarcă pagina (Ctrl+Shift+R) și încearcă din nou.",
};

/* Fragmente recunoscute din textul erorii, pentru cazurile fără cod util.
   Erorile de la Supabase Auth vin doar cu text, fără cod Postgres. */
const DUPA_TEXT = [
  [/invalid login credentials/i, "Email sau parolă greșită."],
  [/email not confirmed/i, "Contul nu are emailul confirmat."],
  [/user already registered/i, "Există deja un cont cu acest email."],
  [/password should be at least/i, "Parola e prea scurtă."],
  [/(rate limit|too many requests)/i, "Prea multe încercări. Așteaptă un minut și încearcă din nou."],
  [/fara_suprapunere|exclusion/i, "Camera este deja ocupată în acea perioadă."],
  [/row-level security|violates row level/i, "Nu ai dreptul să faci această modificare."],
  [/modificat[ăa] de altcineva/i, "Altcineva a modificat aceleași date între timp. Am reîncărcat — verifică și reia modificarea."],
  [/failed to fetch|network|timeout/i, "Conexiunea a eșuat. Verifică internetul și încearcă din nou."],
  [/jwt|token/i, "Sesiunea a expirat. Autentifică-te din nou."],
];

/* Întoarce un mesaj potrivit pentru utilizator.
   `prefix` e contextul acțiunii (ex. "Salvarea rezervării"), ca mesajul
   să spună ce anume a eșuat, nu doar de ce. */
export function mesajEroare(e, prefix = "") {
  const cod = e?.code ? String(e.code) : "";
  const brut = e?.message || "";

  let mesaj = null;
  if (cod in DUPA_COD) {
    /* null = eroare ridicată intenționat de funcțiile noastre SQL, cu un
       mesaj deja formulat în română pentru utilizator; îl păstrăm. */
    mesaj = DUPA_COD[cod] === null ? brut : DUPA_COD[cod];
  }
  if (!mesaj) {
    const potrivire = DUPA_TEXT.find(([re]) => re.test(brut));
    if (potrivire) mesaj = potrivire[1];
  }
  if (!mesaj) {
    mesaj = brut
      ? "A apărut o eroare neașteptată. Detalii tehnice: " + brut
      : "A apărut o eroare neașteptată.";
  }
  return prefix ? `${prefix}: ${mesaj}` : mesaj;
}
