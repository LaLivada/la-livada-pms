// @ts-check
/* Logica pura a mesajelor de bun venit de pe televizoarele din camere
 * (Samsung LYNK Cloud).
 *
 * Traieste aici, nu in functia edge, din acelasi motiv ca lib/acces.js: sa
 * aiba o singura copie si sa poata fi testata fara Deno si fara sa atinga
 * contul Samsung. O folosesc amandoua:
 *   · PMS-ul (browser)     — previzualizarea din ecran si decizia CAND se
 *                            retrimite un mesaj dupa o modificare;
 *   · tv-provider (Deno)   — compune textul care pleaca efectiv spre TV.
 *
 * Nimic de aici nu face apeluri de retea si nu citeste din baza.
 *
 * DE CE UN MODUL SEPARAT DE lib/acces.js, desi amandoua compun un text
 * pentru acelasi oaspete: ecranul televizorului nu e WhatsApp. Nu are bold,
 * nu are emoji cu care sa se poata baza pe fontul telefonului, nu are
 * derulare, iar textul sta pe un banner de cateva randuri peste imaginea de
 * fundal. Un sablon comun ar fi insemnat ca orice schimbare facuta pentru
 * telefon sa ajunga, nevazuta, pe televizoarele din camere.
 */

import { FUS_HOTEL } from "./timp.js";
import { numeInMesaj, NUME_HOTEL_IMPLICIT } from "./acces.js";

/**
 * Setarile integrarii, asa cum stau in `app_state` la cheia `pms:tv:v1`.
 * Toate sunt optionale: o instalare noua n-are cheia deloc, iar functiile de
 * aici cad pe valorile implicite din fisier.
 *
 * @typedef {{ hotelName?: string, wifiName?: string, wifiPassword?: string,
 *   supportPhone?: string, templates?: Record<string, string>, maxLength?: number,
 *   maxLines?: number, faraDiacritice?: boolean, limbaFortata?: string }} SetariTv
 *
 * Rezervarea si oaspetele, in forma de ecran (camelCase). Functia edge isi
 * normalizeaza randul din Postgres inainte sa ajunga aici — vezi `catreLib`
 * din supabase/functions/tv-provider/index.ts.
 *
 * @typedef {{ id?: string, status?: string, roomId?: string, guestId?: string|null,
 *   checkin?: string, checkout?: string, occupantFirstName?: string|null,
 *   occupantLastName?: string|null }} RezervarePeTv
 *
 * @typedef {{ firstName?: string|null, lastName?: string|null,
 *   country?: string|null }} OaspetePeTv
 */

/* Limbile in care stie sa salute pensiunea. Nu sunt „toate limbile Europei":
   fiecare limba de aici inseamna un sablon pe care cineva trebuie sa-l
   citeasca si sa-l tina corect. */
export const LIMBI = ["ro", "en"];

/* Tarile care primesc mesajul in romana. Moldova e aici deliberat: nu e o
   scapare, e limba pe care o citeste oaspetele. */
const TARI_RO = ["ro", "rou", "romania", "românia", "md", "mda", "moldova", "republica moldova"];

/* Limba mesajului, dedusa din tara oaspetelui.
 *
 * Fara tara — cazul rezervarilor vechi si al ocupantilor de grup, unde tara
 * n-are camp — ramane romana: pensiunea e in Vaslui, iar majoritatea
 * covarsitoare a oaspetilor sunt din tara. Un „Welcome" pus din prudenta pe
 * toate televizoarele ar fi gresit mai des decat corect. */
/** @param {string|null|undefined} tara */
export function limbaOaspete(tara) {
  const t = String(tara || "").trim().toLowerCase();
  if (!t) return "ro";
  return TARI_RO.includes(t) ? "ro" : "en";
}

/* Sabloanele implicite, unul per limba.
 *
 * FARA bold si FARA emoji, spre deosebire de SABLON_IMPLICIT din lib/acces.js:
 * `**text**` ar ajunge pe ecran cu asteriscuri cu tot, iar un emoji depinde de
 * fontul televizorului — pe firmware-urile de hotel lipseste des si apare ca
 * dreptunghi gol. Ce nu se poate garanta pe ecranul din camera nu se trimite
 * acolo.
 *
 * Randurile care raman fara valoare DISPAR, nu raman ciunte: vezi
 * `randeazaMesajTv`. De-aia „Wi-Fi: {{wifi_name}}" poate sta linistit in
 * sablon si cat timp reteaua nu e configurata in setari.
 *
 * Sunt configurabile din `app_state`, cheia `pms:tv:v1`, campul `templates`;
 * textul de aici e punctul de pornire, nu o valoare inghetata. */
export const SABLOANE_IMPLICITE = {
  ro: `Bun venit, {{guest_name}}!
Vă dorim un sejur plăcut la {{hotel_name}}.
Camera {{room_number}} · Wi-Fi: {{wifi_name}}
Recepție: {{support_phone}}`,
  en: `Welcome, {{guest_name}}!
Enjoy your stay at {{hotel_name}}.
Room {{room_number}} · Wi-Fi: {{wifi_name}}
Front desk: {{support_phone}}`,
};

/* Cat de lung poate fi mesajul care ajunge pe ecran.
 *
 * Plafonul e AL NOSTRU, nu al Samsung-ului: banner-ul de bun venit are
 * cateva randuri peste imaginea de fundal, iar un text mai lung fie se taie
 * de la mijloc, fie iese din caseta — si n-am afla-o din raspunsul API-ului,
 * care accepta textul si raporteaza succes. Mai bine il taiem noi, la
 * cuvant, si stim exact ce se vede.
 *
 * Ambele sunt configurabile (`maxLength`, `maxLines`); astea sunt valorile cu
 * care pleaca o instalare noua. */
export const LUNGIME_MAXIMA = 200;
export const RANDURI_MAXIME = 6;

/* Separatorul dintre bucatile aceluiasi rand din sablon. Contine spatii
   inadins: e si semnul dupa care se taie un rand ramas fara valoare. */
export const SEPARATOR = " · ";

/* Ziua si ora asa cum apar pe ecran: „23 august 2026", „11:00".
   Fixate pe fusul hotelului, ca in lib/acces.js — mesajul se compune si pe
   server, si in browserul receptiei, iar un laptop lasat pe alt fus ar scrie
   alta ora decat serverul, pentru aceeasi cazare. */
const FMT_ZI = {
  ro: new Intl.DateTimeFormat("ro-RO", { timeZone: FUS_HOTEL, day: "numeric", month: "long", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: FUS_HOTEL, day: "numeric", month: "long", year: "numeric" }),
};
const FMT_ORA = new Intl.DateTimeFormat("ro-RO", {
  timeZone: FUS_HOTEL, hour: "2-digit", minute: "2-digit",
});

export const ziPeTv = (iso, limba = "ro") =>
  (iso ? (FMT_ZI[limba] || FMT_ZI.ro).format(new Date(iso)) : "");
export const oraPeTv = (iso) => (iso ? FMT_ORA.format(new Date(iso)) : "");

/* Diacriticele, scoase cand televizorul nu le poate desena.
 *
 * NU e implicit. Un „Bun venit, Ștefan" scris corect e ce trebuie sa se vada,
 * iar televizoarele Samsung de hotel din ultimii ani afiseaza UTF-8 fara
 * probleme. Setarea (`faraDiacritice`) exista pentru cazul in care un aparat
 * mai vechi din pensiune arata dreptunghiuri in loc de ș si ț: atunci e mai
 * bine „Bun venit, Stefan" decat „Bun venit, tefan".
 *
 * NFD desparte litera de semn, iar filtrul scoate semnul; merge si pentru
 * variantele cu sedila (ş, ţ), cele din fonturile vechi, nu doar pentru cele
 * cu virgula dedesubt. */
export function faraDiacritice(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* Un rand din care lipsesc valori: „Camera 1003 · Wi-Fi:" nu are ce cauta pe
 * ecran. Se taie bucatile ramase fara valoare (cele care se termina cu doua
 * puncte sau sunt goale), iar daca nu ramane nimic, dispare tot randul.
 *
 * De ce nu „scoatem doar randurile goale": un rand cu doua bucati lipite prin
 * SEPARATOR nu e gol cand doar una dintre ele lipseste — si exact asa arata
 * randul cu camera si Wi-Fi-ul cat timp reteaua nu e scrisa in setari. */
export function curataRand(rand) {
  return String(rand || "")
    .split(SEPARATOR)
    .map((b) => b.trim())
    .filter((b) => b && !/[:：]$/.test(b))
    .join(SEPARATOR);
}

/* Taie la `maxim` caractere, pe cuvant, cu „…" la capat.
 *
 * Pe cuvant, nu pe caracter: un nume rupt la jumatate („Bun venit,
 * Alexandr") arata a defect, nu a mesaj. Cand primul cuvant e singur mai lung
 * decat plafonul, se taie totusi dur — altfel n-ar mai ramane nimic. */
export function taieLa(text, maxim = LUNGIME_MAXIMA) {
  const t = String(text || "");
  if (!Number.isFinite(maxim) || maxim <= 0 || t.length <= maxim) return t;
  const bucata = t.slice(0, maxim - 1);
  const spatiu = bucata.search(/\s\S*$/);
  return `${(spatiu > 0 ? bucata.slice(0, spatiu) : bucata).trimEnd()}…`;
}

/* Randarea sablonului: inlocuieste `{{cheie}}`, curata randurile ramase fara
 * valoare, taie la plafonul de randuri si de caractere.
 *
 * O cheie necunoscuta sau goala devine sir gol, ca in `randeazaSablon` din
 * lib/acces.js — un „{{wifi_name}}" ajuns ca atare pe ecranul din camera ar fi
 * mai rau decat lipsa lui. */
/**
 * @param {string} sablon
 * @param {Record<string, string|number|null|undefined>} valori
 * @param {{ maxim?: number, randuri?: number, scoateDiacritice?: boolean }} [optiuni]
 */
export function randeazaMesajTv(sablon, valori, optiuni = {}) {
  const { maxim = LUNGIME_MAXIMA, randuri = RANDURI_MAXIME, scoateDiacritice = false } = optiuni;

  const cuValori = String(sablon || "").replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, cheie) => (valori && valori[cheie] != null ? String(valori[cheie]) : ""));

  const text = cuValori
    .split(/\r?\n/)
    .map(curataRand)
    .filter(Boolean)
    .slice(0, Math.max(1, randuri))
    .join("\n");

  return taieLa(scoateDiacritice ? faraDiacritice(text) : text, maxim);
}

/* CINE E SALUTAT PE ECRAN.
 *
 * Ocupantul, cand rezervarea il are scris — nu titularul. La un grup, titularul
 * rezerva pentru zece camere: „Bun venit, Ion Popescu" pe toate cele zece
 * ecrane ar fi gresit in noua din ele. Aceeasi regula ca la WhatsApp
 * (`destinatarWhatsapp` din lib/acces.js), doar ca aici alege NUMELE, nu
 * telefonul: pe televizor nu se trimite nimic, se afiseaza.
 *
 * Fara niciun nume, mesajul ramane fara salut personal — vezi `mesajBunVenit`,
 * care in cazul asta foloseste sablonul fara `{{guest_name}}`. */
/**
 * @param {RezervarePeTv|null} rezervare
 * @param {OaspetePeTv|null} [oaspete]
 */
export function numePeTv(rezervare, oaspete) {
  const ocupant = numeInMesaj(rezervare?.occupantFirstName, rezervare?.occupantLastName);
  if (ocupant) return ocupant;
  return numeInMesaj(oaspete?.firstName, oaspete?.lastName);
}

/* Doar prenumele, cand numele intreg nu incape.
 *
 * Nu e o scurtare oarecare: un banner de televizor are latimea lui, iar
 * „Bun venit, Alexandru-Constantin Vasilescu-Popescu!" ori se taie, ori
 * micsoreaza fontul pentru toata camera. Prenumele singur e si mai cald, si
 * mai sigur. Plafonul e in caractere, nu in cuvinte: „Ana Pop" incape. */
export const NUME_LUNG = 18;

export function numeScurt(nume, plafon = NUME_LUNG) {
  const intreg = String(nume || "").trim();
  if (intreg.length <= plafon) return intreg;
  const prenume = intreg.split(/\s+/)[0] || "";
  return prenume.length <= plafon ? prenume : taieLa(prenume, plafon);
}

/* Textul care pleaca spre televizor, gata de trimis.
 *
 * Primeste DEJA numele camerei si setarile, nu le cauta singur: functia asta
 * ruleaza si in browser, si in Deno, iar de citit din baza citeste fiecare in
 * felul lui.
 *
 * `rezervare` e obiectul de ecran (camelCase) si in browser, si in functia
 * edge — tv-provider isi normalizeaza randul din Postgres inainte sa ajunga
 * aici, exact ca sa nu existe doua forme. */
/**
 * @param {{ rezervare: RezervarePeTv, oaspete?: OaspetePeTv|null,
 *   numeCamera?: string, setari?: SetariTv }} arg
 * @returns {{ limba: string, text: string }}
 */
export function mesajBunVenit({ rezervare, oaspete, numeCamera, setari = {} }) {
  const limba = setari.limbaFortata && LIMBI.includes(setari.limbaFortata)
    ? setari.limbaFortata
    : limbaOaspete(oaspete?.country);

  const sabloane = { ...SABLOANE_IMPLICITE, ...(setari.templates || {}) };
  const sablon = sabloane[limba] || SABLOANE_IMPLICITE.ro;

  const valori = {
    guest_name: numeScurt(numePeTv(rezervare, oaspete)),
    hotel_name: setari.hotelName || "",
    room_number: numeCamera || "",
    wifi_name: setari.wifiName || "",
    wifi_password: setari.wifiPassword || "",
    support_phone: setari.supportPhone || "",
    checkout_date: ziPeTv(rezervare?.checkout, limba),
    checkout_time: oraPeTv(rezervare?.checkout),
    nights: rezervare?.checkin && rezervare?.checkout
      ? String(Math.max(1, Math.round(
        (new Date(rezervare.checkout).getTime() - new Date(rezervare.checkin).getTime()) / 86400000)))
      : "",
  };

  /* Un salut fara nume („Bun venit, !") e mai rau decat unul general. Cand nu
     stim cui ne adresam, scoatem virgula si numele dintr-o bucata. */
  const sablonFinal = valori.guest_name
    ? sablon
    : sablon.replace(/,?\s*\{\{\s*guest_name\s*\}\}/g, "");

  return {
    limba,
    text: randeazaMesajTv(sablonFinal, valori, {
      maxim: Number.isFinite(setari.maxLength) ? setari.maxLength : LUNGIME_MAXIMA,
      randuri: Number.isFinite(setari.maxLines) ? setari.maxLines : RANDURI_MAXIME,
      scoateDiacritice: Boolean(setari.faraDiacritice),
    }),
  };
}

/* SETARILE INTEGRARII, cu valorile de pornire.
 *
 * Stau aici, nu in fiecare capat, fiindca le citesc amandoua: ecranul
 * „Televizoare" (ca sa umple formularul) si functia edge (ca sa compuna
 * mesajul). Cat au stat scrise de doua ori, in alta integrare, cele doua
 * copii au apucat sa se departeze — vezi sablonul din lib/acces.js si
 * povestea lui.
 *
 * `provider: "simulare"` e implicit DELIBERAT. Pana cand cineva alege explicit
 * furnizorul real, un check-in n-are voie sa trimita nimic catre televizoarele
 * oaspetilor cu o configuratie pusa pe jumatate. La fel ca la yale: simularea
 * se activeaza din setare, niciodata ca rezerva automata cand furnizorul real
 * nu raspunde.
 *
 * `supportPhone` porneste GOL, nu cu numarul asistentei din lib/acces.js:
 * acolo e omul care raspunde la o usa care nu se deschide, aici scrie
 * „Receptie" pe ecranul din camera. Un numar presupus ar fi fost gresit fara
 * ca cineva sa afle; randul lipseste din mesaj pana cand e completat (vezi
 * `curataRand`). */
export const SETARI_IMPLICITE = {
  activ: true,
  provider: "simulare",
  hotelName: NUME_HOTEL_IMPLICIT,
  wifiName: "",
  wifiPassword: "",
  supportPhone: "",
  templates: SABLOANE_IMPLICITE,
  maxLength: LUNGIME_MAXIMA,
  maxLines: RANDURI_MAXIME,
  faraDiacritice: false,
  limbaFortata: "",
};

/* Setarile brute din `app_state` (cheia `pms:tv:v1`), curatate.
 *
 * Nimic de aici nu arunca: o valoare aiurea ramasa in baza dupa o editare
 * nefericita cade inapoi pe implicit, nu opreste un check-in. Singura setare
 * la care stricteea conteaza e `provider` — orice altceva decat "lynk"
 * inseamna simulare, adica varianta care NU atinge televizoarele reale.
 *
 * @param {any} brut
 */
export function normalizeazaSetari(brut) {
  const s = brut && typeof brut === "object" ? brut : {};
  const numar = (v, implicit) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : implicit);
  return {
    ...SETARI_IMPLICITE,
    activ: s.activ !== false,
    provider: s.provider === "lynk" ? "lynk" : "simulare",
    hotelName: String(s.hotelName || SETARI_IMPLICITE.hotelName),
    wifiName: String(s.wifiName || ""),
    wifiPassword: String(s.wifiPassword || ""),
    supportPhone: String(s.supportPhone || ""),
    templates: {
      ...SABLOANE_IMPLICITE,
      ...Object.fromEntries(
        Object.entries(s.templates || {}).filter(([k, v]) => LIMBI.includes(k) && typeof v === "string" && v.trim())),
    },
    maxLength: numar(s.maxLength, LUNGIME_MAXIMA),
    maxLines: numar(s.maxLines, RANDURI_MAXIME),
    faraDiacritice: Boolean(s.faraDiacritice),
    limbaFortata: LIMBI.includes(s.limbaFortata) ? s.limbaFortata : "",
  };
}

/* CE NU I SE SPUNE RECEPTIEI, dupa un apel pornit de la sine.
 *
 * Mesajul de pe televizor pleaca singur la check-in si la check-out, fara ca
 * cineva sa-l fi cerut. Un avertisment rosu pe o cale pe care nimeni n-a
 * apasat nimic nu se citeste ca „televizorul are o problema", ci ca „PMS-ul
 * se plange iar" — si dupa a treia oara nimeni nu-l mai citeste deloc,
 * inclusiv atunci cand chiar are dreptate.
 *
 * Tac patru situatii, toate avand in comun ca nu sunt despre cazarea de fata:
 *   · `fara`         — camera n-are televizor mapat. Majoritatea camerelor
 *                      sunt asa la inceput, si unele raman.
 *   · `inactiv`      — integrarea e oprita din setari, adica exact ce a cerut
 *                      cineva.
 *   · `nepublicat`   — functia edge nu e publicata pe proiect. Asa arata
 *                      intervalul dintre un deploy de frontend si unul de
 *                      backend; receptia n-are ce face, iar cazarile merg mai
 *                      departe neatinse.
 *   · `neconfigurat` — lipsesc secretele LYNK. E treaba adminului, nu a celui
 *                      de la ghiseu — acelasi tratament ca la yale, unde
 *                      doCheckOut tace deja pe „neconfigurat".
 *
 * ECRANUL „TELEVIZOARE" NU TACE NICIODATA: acolo omul a apasat un buton si
 * asteapta un raspuns, deci primeste eroarea intreaga. Tacerea e a caii
 * automate, nu a integrarii. */
export const MOTIVE_TACUTE = ["nepublicat", "neconfigurat"];

/** @param {any} r raspunsul functiei edge, asa cum il intoarce cheamaTv */
export function taceLaCheckin(r) {
  if (!r) return true;
  if (r.inactiv || r.fara) return true;
  /* Reusita fara nimic trimis: n-avea ce sa plece, deci n-are ce sa se
     anunte. Un „mesaj trimis pe 0 televizoare" e o notificare despre nimic. */
  if (r.ok) return !(r.trimise > 0);
  return MOTIVE_TACUTE.includes(r.reason);
}

/* Statusurile in care camera NU mai e a oaspetelui, deci ecranul lui n-are ce
   cauta pe televizor. Plecarea e inclusa: mesajul trebuie sa dispara la
   check-out, nu sa-l intampine pe urmatorul cu numele celui dinainte. */
export const STATUSURI_FARA_MESAJ = ["cancelled", "noshow", "checkedout"];

/* Ce trebuie facut cu mesajul de pe televizor dupa ce o rezervare s-a
 * modificat.
 *
 *   "clear"   — rezervarea nu mai ocupa camera (anulata, no-show, plecata):
 *               ecranul se curata;
 *   "muta"    — cazatul s-a mutat in alta camera: se curata televizorul din
 *               camera veche si se scrie in cea noua;
 *   "welcome" — mesajul trebuie rescris in aceeasi camera (s-a schimbat
 *               numele ocupantului, sau perioada, care intra in text);
 *   null      — nimic de facut.
 *
 * Separata de efect, ca `decideActiuneAcces`: regula „cand" e cea care se
 * strica tacut, nu apelul de retea.
 *
 * SE UITA DOAR LA CAZARILE IN CURS. O rezervare confirmata, dar fara check-in,
 * n-are mesaj pe ecran — deci n-are ce sa se schimbe. Mesajul se naste la
 * check-in (vezi doCheckIn), nu la salvarea rezervarii. */
/**
 * @param {RezervarePeTv|null} inainte
 * @param {RezervarePeTv|null} dupa
 * @returns {"clear"|"muta"|"welcome"|null}
 */
export function decideActiuneTv(inainte, dupa) {
  if (!inainte || !dupa) return null;

  const eraCazat = inainte.status === "checkedin";
  const eCazat = dupa.status === "checkedin";

  if (!eraCazat && !eCazat) return null;
  /* Orice iesire din „cazat" curata ecranul — plecare, anulare, no-show, dar
     si o revenire la „confirmed" facuta din greseala si apoi corectata.
     STATUSURI_FARA_MESAJ enumera cazurile asteptate; ce nu e in lista si
     totusi a iesit din cazare tot nu mai are dreptul la mesaj. */
  if (eraCazat && !eCazat) return "clear";
  if (!eraCazat && eCazat) return "welcome";

  if (inainte.roomId !== dupa.roomId) return "muta";

  const altNume =
    (inainte.occupantFirstName || "") !== (dupa.occupantFirstName || "") ||
    (inainte.occupantLastName || "") !== (dupa.occupantLastName || "") ||
    inainte.guestId !== dupa.guestId;
  const altaPerioada =
    new Date(inainte.checkout).getTime() !== new Date(dupa.checkout).getTime();

  return (altNume || altaPerioada) ? "welcome" : null;
}
