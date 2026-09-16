// @ts-check
/* Validarea cererii de retragere din contract, comună formularului de pe
   rezervari.lalivada.ro/retragere/ și — copiată regulă cu regulă, fiindcă
   Deno nu importă de aici — funcției edge `retragere`. Dacă schimbi o limită,
   schimb-o în amândouă: browserul refuză înainte de trimitere, funcția
   refuză orice ar veni pe lângă browser. */

export const LIMITE = Object.freeze({
  nume: { min: 2, max: 120 },
  email: { max: 200 },
  rezervare: { max: 40 },
  mesaj: { max: 2000 },
});

/* Aceeași verificare largă ca la rezervare: ceva înainte de @, un domeniu cu
   punct, fără spații. Nu încearcă să fie RFC 5322 — un email „valid” după
   RFC pe care nu-l poate primi nimeni nu ne ajută cu nimic. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const curat = (v) => String(v ?? "").trim();

/**
 * @param {Record<string, unknown>} c câmpurile brute din formular
 * @returns {{ valid: boolean, erori: Record<string, string>, date: Record<string, string> }}
 *   `date` are câmpurile curățate (spații tăiate, email cu litere mici),
 *   gata de trimis; `erori` are un mesaj pe fiecare câmp greșit.
 */
export function valideazaCerere(c) {
  const date = {
    nume: curat(c.nume).replace(/\s+/g, " "),
    email: curat(c.email).toLowerCase(),
    rezervare: curat(c.rezervare).toUpperCase(),
    sosire: curat(c.sosire),
    mesaj: curat(c.mesaj),
  };
  const erori = {};

  if (date.nume.length < LIMITE.nume.min) erori.nume = "Scrie numele tău.";
  else if (date.nume.length > LIMITE.nume.max) erori.nume = "Numele e prea lung.";

  if (!date.email) erori.email = "Scrie adresa de email, ca să-ți putem răspunde.";
  else if (date.email.length > LIMITE.email.max || !EMAIL.test(date.email)) {
    erori.email = "Adresa de email nu pare corectă.";
  }

  if (date.rezervare.length > LIMITE.rezervare.max) {
    erori.rezervare = "Numărul rezervării e prea lung.";
  }

  if (date.sosire && (!DATA_ISO.test(date.sosire) || Number.isNaN(Date.parse(date.sosire)))) {
    erori.sosire = "Data sosirii nu pare corectă.";
  }

  if (!date.mesaj) erori.mesaj = "Scrie ce rezervare vrei să anulezi.";
  else if (date.mesaj.length > LIMITE.mesaj.max) erori.mesaj = "Mesajul e prea lung.";

  return { valid: Object.keys(erori).length === 0, erori, date };
}

/* Textul standard al declarației, pus dinainte în câmpul de mesaj. Omul îl
   poate lăsa așa sau îl poate schimba; ce contează e să nu fie nevoit să
   compună el o formulă „juridică” ca să-și exercite un drept. */
export function mesajImplicit() {
  return "Vă informez că mă retrag din contractul de prestare a serviciilor de cazare încheiat prin rezervarea de mai sus și vă rog să-mi confirmați anularea pe email.";
}
