// @ts-check
/* Importul calendarelor OTA — partea care DECIDE, separata de cea care
 * vorbeste cu reteaua si cu baza.
 *
 * Functia edge `ical-import` descarca feedul .ics al fiecarui OTA, il
 * parseaza cu ics.ts (acelasi parser ca la calendarul salilor) si aduce aici
 * doua liste: ce scrie feedul ACUM si ce rezervari avem noi deja de la acea
 * sursa, pe acea camera. De aici ies trei liste de executat. Nicio decizie
 * nu se ia in corpul functiei edge, ca sa poata fi toate testate in vitest,
 * fara retea si fara Deno — acelasi tipar ca src/lib/retragere.js.
 *
 * CE NU CONTINE UN FEED OTA. Doar intervalul ocupat: nici nume, nici
 * telefon, nici pret. Asta nu e o limitare a codului de aici, ci a ceea ce
 * publica Airbnb si Booking.com dintr-o adresa .ics gratuita. De-aia
 * rezervarile importate primesc eticheta TAG_OTA_INCOMPLET si un banner in
 * fisa lor — recepția trebuie sa deschida extranetul si sa completeze.
 */

/* Ce se poate atinge dintr-un import. O rezervare pe care recepția a
   procesat-o deja (checkedin/checkedout) nu se mai modifica automat,
   oricat ar zice feedul: acolo a intervenit un om, cu oaspetele in fata. */
const MODIFICABILE = new Set(["confirmed", "pending"]);

/* Orele hotelului puse peste zilele din .ics. Feedurile OTA dau date fara
   ora (`DTSTART;VALUE=DATE`), iar `fara_suprapunere` lucreaza pe momente:
   fara orele astea, plecarea si sosirea din aceeasi zi ar fi amandoua la
   miezul noptii si schimbul de oaspeti ar fi respins ca suprapunere. */
export const ORA_SOSIRE = 14;
export const ORA_PLECARE = 11;

/* Cele doua OTA-uri care au corespondent direct in SOURCES
   (src/lib/constante.js). Restul intra pe `source = 'other'`, dar isi
   pastreaza slug-ul in `external_source` — altfel doua agentii diferite ar
   imparti acelasi spatiu de UID-uri in indexul res_extern_unic. */
export const OTA_CUNOSCUTE = [
  { ota: "booking", eticheta: "Booking.com" },
  { ota: "airbnb", eticheta: "Airbnb" },
];

export const sursaDinOta = (ota) => (ota === "booking" || ota === "airbnb" ? ota : "other");

/* Eticheta pusa automat pe fiecare rezervare importata, scoasa de mana cand
   recepția a completat oaspetele din extranetul OTA-ului. NU e in
   DEFAULT_TAGS: lista aia e ce poate alege un om in formular, pe cand asta o
   pune si o justifica importul. Sta aici, nu langa celelalte nomenclatoare
   din constante.js, fiindca o citesc doua parti independente — functia edge
   si bannerul din fisa rezervarii — iar constante.js ar trage in deployul
   functiei toate judetele si prefixele telefonice degeaba. */
export const TAG_OTA_INCOMPLET = "Detalii lipsă (OTA)";

/* Numele scris de om → slug-ul din coloana `ota`. Trebuie sa iasa mereu
   ceva ce trece de constrangerea din migratie (`^[a-z0-9][a-z0-9._-]{0,31}$`,
   si niciodata 'eveniment'); sirul gol inseamna „nu se poate face un slug
   din asta", iar interfata cere alt nume in loc sa trimita ceva invalid. */
export function slugOta(nume) {
  /* NFD desface „ș" in „s" + virgulita combinata, iar `\p{Mn}` (semn
     combinat fara latime proprie) prinde si virgulita, si sedila, si tot
     restul — deci diacriticele romanesti nu au nevoie de un caz separat.
     Clasa scrisa pe nume, nu ca interval U+0300–U+036F: intervalul ar fi
     pus in fisier caractere invizibile, imposibil de citit la o revizuire. */
  const s = String(nume ?? "")
    .normalize("NFD").replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return s === "eveniment" ? "" : s;
}

/* Motivele pentru care o intrare e lasata in pace. Text, nu cod: ajung in
   jurnal exact asa cum sunt scrise, ca sa se inteleaga din ecranul Jurnal
   de ce importul n-a facut ce parea evident. */
export const MOTIVE = {
  trecut: "sejurul s-a incheiat deja",
  procesata: "rezervarea e deja procesata la receptie",
  inceputa: "sosirea e in trecut",
};

const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/* Doua momente sunt „aceeasi valoare" doar daca pica la fix la fel. Feedul
   da zile, iar orele le punem noi (vezi `laOreleHotelului` din functia
   edge), deci o diferenta reala inseamna intotdeauna alta zi. */
const egal = (a, b) => ms(a) === ms(b);

/**
 * @typedef {{ uid: string, checkin: Date|string, checkout: Date|string }} EvenimentFeed
 * @typedef {{ id: string, externalUid: string, checkin: Date|string, checkout: Date|string, status: string }} RezervareExistenta
 */

/**
 * Compara ce scrie feedul cu ce avem in baza si intoarce ce e de facut.
 *
 * @param {EvenimentFeed[]} evenimente  evenimentele din feed, cu orele deja
 *   puse pe programul hotelului
 * @param {RezervareExistenta[]} rezervari  rezervarile noastre cu acelasi
 *   (external_source, room_id) — inclusiv cele anulate, ca sa nu incercam
 *   sa reinseram peste indexul unic res_extern_unic
 * @param {Date} acum  injectat, ca testele sa fie deterministe
 */
export function decideActiuni(evenimente, rezervari, acum = new Date()) {
  const t = ms(acum);
  const deInserat = [];
  const deActualizat = [];
  const deAnulat = [];
  const sarite = [];

  const dupaUid = new Map();
  for (const r of rezervari || []) {
    if (r?.externalUid) dupaUid.set(r.externalUid, r);
  }
  const uidInFeed = new Set();

  for (const ev of evenimente || []) {
    if (!ev?.uid) continue;
    uidInFeed.add(ev.uid);
    const existenta = dupaUid.get(ev.uid);

    /* Un sejur incheiat nu mai are ce sa protejeze: camera e libera de mult,
       iar inserarea lui ar putea doar sa se loveasca de o rezervare reala
       din trecut (fara_suprapunere) si sa dea o alerta degeaba. Feedurile
       OTA chiar contin istoric, deci cazul nu e teoretic. */
    if (!existenta && ms(ev.checkout) <= t) {
      sarite.push({ uid: ev.uid, motiv: MOTIVE.trecut });
      continue;
    }
    if (!existenta) {
      deInserat.push({ uid: ev.uid, checkin: ev.checkin, checkout: ev.checkout });
      continue;
    }

    const anulata = existenta.status === "cancelled";
    const acelasi = egal(existenta.checkin, ev.checkin) && egal(existenta.checkout, ev.checkout);
    if (acelasi && !anulata) continue;

    /* O rezervare anulata care reapare in feed inseamna ca OTA-ul a
       reactivat-o. Se invie, nu se insereaza inca una: indexul unic
       res_extern_unic tine si pe randurile anulate. */
    if (!anulata && !MODIFICABILE.has(existenta.status)) {
      sarite.push({ uid: ev.uid, id: existenta.id, motiv: MOTIVE.procesata });
      continue;
    }
    if (ms(existenta.checkin) <= t && ms(ev.checkin) <= t) {
      sarite.push({ uid: ev.uid, id: existenta.id, motiv: MOTIVE.inceputa });
      continue;
    }
    deActualizat.push({
      id: existenta.id, uid: ev.uid,
      checkin: ev.checkin, checkout: ev.checkout,
      reactiveaza: anulata,
    });
  }

  for (const r of rezervari || []) {
    if (!r?.externalUid || uidInFeed.has(r.externalUid)) continue;
    if (r.status === "cancelled") continue;          // deja anulata, nimic de facut
    if (!MODIFICABILE.has(r.status)) {
      sarite.push({ uid: r.externalUid, id: r.id, motiv: MOTIVE.procesata });
      continue;
    }
    /* Disparitia unui UID din feed inseamna „anulat pe OTA" DOAR pentru
       sejururile viitoare. Feedurile lor arata o fereastra, nu toata
       istoria: fara garda asta, fiecare rulare ar anula tot ce a plecat
       din fereastra — adica exact rezervarile onorate. */
    if (ms(r.checkin) <= t) {
      sarite.push({ uid: r.externalUid, id: r.id, motiv: MOTIVE.inceputa });
      continue;
    }
    deAnulat.push({ id: r.id, uid: r.externalUid });
  }

  return { deInserat, deActualizat, deAnulat, sarite };
}
