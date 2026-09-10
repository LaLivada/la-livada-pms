/* Fisa de anuntare a sosirii — logica pura.
 *
 * Traieste aici, nu in componenta, din acelasi motiv ca lib/acces.js: se
 * poate testa fara DOM, fara retea si fara baza, iar regula pe care o apara
 * e cea care se strica tacut. Un camp obligatoriu scapat dintr-o lista nu
 * da nicio eroare — da o fisa incompleta, aflata la un control.
 *
 * `sensibil` nu e o eticheta decorativa: campurile marcate asa nu se
 * precompleteaza NICIODATA si nu se citesc inapoi (docs/fisa-cazare.md 3).
 * Regula sta in date ca sa poata fi verificata de un test, nu doar promisa
 * intr-un comentariu.
 */

export const ACT_TIPURI = [
  { cheie: "ci",       eticheta: "Carte de identitate" },
  { cheie: "pasaport", eticheta: "Pașaport" },
  { cheie: "permis",   eticheta: "Permis de ședere" },
];

export const CAMPURI = [
  { cheie: "nume",           eticheta: "Nume",              obligatoriu: true,  sensibil: false },
  { cheie: "prenume",        eticheta: "Prenume",           obligatoriu: true,  sensibil: false },
  { cheie: "dataNasterii",   eticheta: "Data nașterii",     obligatoriu: true,  sensibil: true,  tip: "date" },
  { cheie: "loculNasterii",  eticheta: "Locul nașterii",    obligatoriu: true,  sensibil: true },
  /* Doua campuri, nu unul: coala tiparita scrie `guests.country` in
     amandoua, deci un roman cu domiciliul in Germania iesea cu „Germania"
     la nationalitate. Pe hartie trecea neobservat fiindca receptionerul
     corecta cu pixul. */
  { cheie: "nationalitate",  eticheta: "Naționalitate",     obligatoriu: true,  sensibil: false },
  { cheie: "tara",           eticheta: "Țara de domiciliu", obligatoriu: true,  sensibil: false },
  { cheie: "adresa",         eticheta: "Adresa",            obligatoriu: true,  sensibil: false },
  { cheie: "localitate",     eticheta: "Localitatea",       obligatoriu: true,  sensibil: false },
  { cheie: "scopul",         eticheta: "Scopul călătoriei", obligatoriu: true,  sensibil: false },
  { cheie: "actTip",         eticheta: "Act de identitate", obligatoriu: true,  sensibil: true,  tip: "alegere" },
  /* Seria NU e obligatorie: pasapoartele n-au serie separata, doar numar.
     Ceruta, ar fi blocat orice oaspete strain in fata usii. */
  { cheie: "actSeria",       eticheta: "Seria",             obligatoriu: false, sensibil: true },
  { cheie: "actNumarul",     eticheta: "Numărul",           obligatoriu: true,  sensibil: true },
];

/* PRECOMPLETAREA DE LA RECEPTIE.
 *
 * Oaspetele care isi deschide linkul primeste datele deja scrise, din
 * `guest_fisa_precompletare`. Receptionerul care completeaza IN LOCUL lui
 * pornea de la un formular gol si retasta un nume si o adresa pe care PMS-ul
 * le avea deja — exact la ghiseu, cu omul in fata. Aici e aceeasi
 * precompletare, luata din fisa oaspetelui in loc de din baza.
 *
 * CELE CINCI CAMPURI SUNT ACELEASI ca la oaspete, si nu din intamplare: doua
 * precompletari diferite ar fi insemnat ca aceeasi rezervare arata altfel
 * dupa cine deschide fisa. Din acelasi motiv, regula ocupantului de mai jos e
 * scrisa si in `guest_fisa_precompletare` (schema.sql).
 *
 * Nationalitatea NU se ia din `country`, desi ar fi la indemana: `country` e
 * tara de domiciliu. Un roman cu domiciliul in Germania ar fi iesit cu
 * „Germania" la nationalitate — greseala pe care coala tiparita o facea deja
 * si care e scrisa mai sus, la campuri.
 *
 * Nimic sensibil nu trece, iar regula e aplicata de bucla, nu de lista: data
 * si locul nasterii si actul de identitate se citesc de pe documentul din
 * mana, de fiecare data. O serie precompletata dintr-o fisa veche e felul in
 * care ajunge un numar gresit pe un act oficial.
 */
const DIN_OASPETE = {
  nume:       (o) => o.lastName,
  prenume:    (o) => o.firstName,
  adresa:     (o) => o.address,
  localitate: (o) => o.city,
  tara:       (o) => o.country,
};

/* Campurile care descriu DOMICILIUL, nu persoana. Cand fisa se scrie pe
   numele ocupantului, ele nu mai au voie sa vina din fisa titularului: vezi
   comentariul de la `precompletareDinOaspete`. */
const ALE_DOMICILIULUI = ["adresa", "localitate", "tara"];

const curat = (v) => {
  /* Golurile se sar, nu se scriu ca sir vid: baza tine „-" ca valoare de
     umplutura la `city` si `country`, iar un camp precompletat cu „-" arata
     completat si trece de validare. */
  const t = v == null ? "" : String(v).trim();
  return t === "" || t === "-" ? "" : t;
};

/* OCUPANTUL, cand exista, e cel care doarme in camera — deci el semneaza fisa,
 * nu titularul care a platit. La un grup, titularul e o singura persoana
 * pentru zece camere; precompletat cu numele lui, receptionerul retasta
 * numele real la fiecare fisa.
 *
 * Cand numele vine de la ocupant, ADRESA NU MAI VINE de la titular. Ar fi
 * fost cea mai urata forma de gresit: o fisa care arata completa, cu numele
 * unui om si domiciliul altuia, semnata asa si pusa la dosar. Golul se vede,
 * amestecul nu.
 */
const eAcelasiOm = (rezervare, oaspete) => {
  const nume = (a, b) => `${curat(a)} ${curat(b)}`.trim().toLowerCase();
  const alOcupantului = nume(rezervare?.occupantLastName, rezervare?.occupantFirstName);
  return alOcupantului !== "" && alOcupantului === nume(oaspete?.lastName, oaspete?.firstName);
};

export function precompletareDinOaspete(oaspete, rezervare) {
  const ocupant = {
    nume: curat(rezervare?.occupantLastName),
    prenume: curat(rezervare?.occupantFirstName),
  };
  const dinOcupant = (ocupant.nume !== "" || ocupant.prenume !== "")
    && !eAcelasiOm(rezervare, oaspete);

  if (!oaspete && !dinOcupant) return {};
  const date = {};
  for (const [cheie, ia] of Object.entries(DIN_OASPETE)) {
    if (CAMPURI.find((c) => c.cheie === cheie)?.sensibil) continue;
    if (dinOcupant && ALE_DOMICILIULUI.includes(cheie)) continue;
    const v = dinOcupant && cheie in ocupant ? ocupant[cheie] : (oaspete ? ia(oaspete) : null);
    const t = curat(v);
    if (t !== "") date[cheie] = t;
  }
  return date;
}

/* Versiunea colii cu care se randeaza fisa. Se scrie in randul din baza si
   creste cand se schimba aspectul tiparit — vezi docs/fisa-cazare.md 4. */
export const SABLON_VERSIUNE = "fisa-2026-09";

const gol = (v) => v == null || String(v).trim() === "";

/* DATA NASTERII, IN TREI CASETE.
 *
 * `<input type="date">` deschide pe telefon un calendar care porneste de la
 * anul curent. Ca sa ajungi la 1980 derulezi patruzeci de ani, in fata usii.
 * Trei casete de cifre se completeaza din tastatura numerica, fara derulare.
 *
 * Formatul PASTRAT ramane „AAAA-LL-ZZ": coloana din Postgres e `date`, iar
 * coala tiparita si validarea se sprijina pe el. Casetele sunt doar felul in
 * care omul il scrie.
 */
export const dataInParti = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  return m ? { an: m[1], luna: m[2], zi: m[3] } : { an: "", luna: "", zi: "" };
};

/* Intoarce sir vid cat timp lipseste ceva, ca sa se aprinda „Data nasterii
   lipseste" si nu o eroare despre format. Anul se cere de patru cifre: „80"
   ghicit ca 1980 e felul in care ajunge un an gresit pe un act. */
export function dataDinParti(parti) {
  const zi = String(parti?.zi ?? "").trim();
  const luna = String(parti?.luna ?? "").trim();
  const an = String(parti?.an ?? "").trim();
  if (!/^\d{1,2}$/.test(zi) || !/^\d{1,2}$/.test(luna) || !/^\d{4}$/.test(an)) return "";
  return `${an}-${luna.padStart(2, "0")}-${zi.padStart(2, "0")}`;
}

/* 31 februarie NU e prinsa de `new Date`: sirul se rostogoleste tacut la
   2 martie. Cu un calendar nativ nu se putea tasta, cu trei casete se poate,
   iar Postgres respinge `1980-02-31` cu o eroare despre care oaspetele n-are
   ce sa inteleaga. Verificat prin dus-intors: ce a intrat trebuie sa iasa. */
const esteZiReala = (iso) => {
  const { an, luna, zi } = dataInParti(iso);
  if (!an) return false;
  const d = new Date(Date.UTC(+an, +luna - 1, +zi));
  return d.getUTCFullYear() === +an && d.getUTCMonth() === +luna - 1 && d.getUTCDate() === +zi;
};

export function campuriLipsa(date) {
  return CAMPURI
    .filter((c) => c.obligatoriu && gol(date?.[c.cheie]))
    .map((c) => c.cheie);
}

/* Peste atat inseamna aproape sigur o cifra gresita la an, nu un oaspete
   centenar. Pragul e sus deliberat: mai bine trece o varsta ciudata decat
   sa fie refuzat cineva real. */
const ANI_MAXIM = 120;

export function valideazaFisa(date) {
  const erori = {};

  /* Toate erorile deodata, nu prima. Un formular care arata cate una pe rand
     se completeaza de trei ori, iar oaspetele e in fata usii. */
  for (const cheie of campuriLipsa(date)) {
    const c = CAMPURI.find((x) => x.cheie === cheie);
    erori[cheie] = `${c.eticheta} lipsește.`;
  }

  const d = date?.dataNasterii;
  if (!gol(d)) {
    const nasterea = new Date(d);
    if (Number.isNaN(nasterea.getTime()) || !esteZiReala(d)) {
      erori.dataNasterii = "Data nașterii nu e o dată validă.";
    } else if (nasterea > new Date()) {
      erori.dataNasterii = "Data nașterii nu poate fi în viitor.";
    } else {
      const ani = (Date.now() - nasterea.getTime()) / (365.2425 * 24 * 3600 * 1000);
      /* Mesajul spune ce sa verifice, nu ca a gresit: cel mai des e o cifra
         schimbata la an, iar „verifica" duce ochiul acolo. */
      if (ani > ANI_MAXIM) erori.dataNasterii = "Verifică anul nașterii.";
    }
  }

  const tip = date?.actTip;
  if (!gol(tip) && !ACT_TIPURI.some((t) => t.cheie === tip)) {
    erori.actTip = "Alege un tip de act din listă.";
  }

  return { ok: Object.keys(erori).length === 0, erori };
}
