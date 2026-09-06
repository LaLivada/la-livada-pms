/* Textele redactionale din pagina oaspetelui.
 *
 * Stau separat de App.jsx dintr-un motiv practic: cine vrea sa schimbe o
 * regula sau sa adauge o atractie nu trebuie sa deschida un fisier de
 * interfata si sa nimereasca printre hook-uri. Aici e doar text.
 *
 * Ce NU se pune aici: nimic care depinde de rezervare. Ora de plecare,
 * codul de acces si valabilitatea lui vin din baza, pentru fiecare sejur
 * in parte, si se compun in App.jsx. Daca ar fi scrise aici ar fi corecte
 * pana la prima exceptie si gresite dupa.
 */

/* Numarul de la receptie, singurul punct de contact din pagina. */
export const TELEFON = "+40722899899";
export const TELEFON_SCRIS = "+40 722 899 899";

/* Complexul, la DN24 nr. 743, Muntenii de Jos, judetul Vaslui.
   Coordonatele sunt cele din OpenStreetMap, unde punctul e chiar numit
   „La Livada" — nu centrul comunei. Le foloseste widget-ul de vreme si
   calculul distantelor catre atractii. */
export const ACASA = { lat: 46.6225253, lon: 27.7551750, localitate: "Muntenii de Jos" };

/* „Bun venit". Un rand de intampinare si cateva lucruri de stiut din prima
   clipa. Punctele sunt perechi titlu/text. */
export const BUN_VENIT = {
  intro: "Ne bucurăm că ești aici.",
  puncte: [
    {
      titlu: "Pagina asta rămâne a ta",
      text: "Salveaz-o pe ecranul telefonului: ține codul de acces și butonul de deschidere pentru tot sejurul.",
    },
    {
      titlu: "Orice, la un telefon distanță",
      text: `Dacă ceva nu merge sau ai nevoie de ceva, sună-ne la ${TELEFON_SCRIS}.`,
    },
  ],
};

/* „Important". Reguli si lucruri de tinut minte care sunt aceleasi pentru
   toata lumea. Cele care depind de rezervare (ora de plecare, valabilitatea
   codului) se adauga in App.jsx, inaintea acestora.

   LISTA E DELIBERAT SCURTA. Contine doar ce se poate verifica din datele
   proprietatii. Fumatul, animalele de companie, ora de liniste si accesul
   in zonele comune se adauga aici cand sunt confirmate — pana atunci
   lipsesc, in loc sa fie inventate. */
export const IMPORTANT = [];

/* „Atracții" — obiective din judetul Vaslui.
 *
 * CUM AU FOST ALESE. Zece obiective care apar in mai multe liste
 * independente despre judet (Stirile ProTV, bunadimineata.ro, Travelminit),
 * nu o selectie proprie.
 *
 * DISTANTELE SUNT PE SOSEA, nu in linie dreapta: calculate cu OSRM de la
 * coordonatele complexului la fiecare obiectiv. „21 km" in linie dreapta
 * si „21 km cu masina" sunt lucruri diferite, iar oaspetele pe al doilea il
 * conduce. Ordonarea din pagina se face dupa `km`, crescator.
 *
 * POZELE sunt de pe Wikimedia Commons, cu licenta libera, descarcate in
 * `public-guest/atractii/` — nu legate direct de pe Commons. Doua motive:
 * pagina nu trimite adresa IP a oaspetelui catre un server strain doar ca
 * sa vada o poza, si o imagine stearsa de acolo maine nu lasa un patrat
 * gol aici. Autorul si licenta se afiseaza, fiindca asa cer CC BY si
 * CC BY-SA — nu e politete, e conditia de folosire.
 *
 * TREI OBIECTIVE N-AU POZA: muzeul judetean din Vaslui, muzeul caricaturii
 * din Husi si gradina zoologica din Barlad. Pe Commons nu exista nicio
 * fotografie libera a lor (cautat si dupa nume, si prin categoriile
 * oraselor). Am preferat sa le las fara imagine decat sa pun poza altui
 * loc — o fotografie a centrului Husiului sub titlul „Muzeul Caricaturii"
 * e o minciuna mica pe care oaspetele o descopera abia la fata locului.
 *
 * LINKUL catre Google Maps e o cautare dupa nume, nu un pin pe coordonate:
 * geocodarea Google pentru locurile astea e mai buna decat a mea, iar
 * rezultatul e fisa locului, cu program si recenzii, nu un ac pe camp.
 */
export const ATRACTII = [
  {
    cheie: "curtea",
    nume: "Curtea Domnească",
    loc: "Vaslui",
    km: 3, minute: 4,
    text: "Ruinele curții ridicate de Alexandru cel Bun și extinse de Ștefan cel Mare între 1472 și 1490, lângă biserica „Tăierea Capului Sf. Ioan Botezătorul”, ctitorie a lui Ștefan din 1490.",
    cauta: "Curtea Domnească Vaslui",
    foto: "curtea.jpg",
    credit: { autor: "Adrian Baciu", licenta: "CC BY-SA 3.0 RO",
      pagina: "https://commons.wikimedia.org/wiki/File:Biserica_Taierea_Capului_Sfantului_Ioan_Botezatorul_0082.jpg" },
  },
  {
    cheie: "muzeuvs",
    nume: "Muzeul Județean „Ștefan cel Mare”",
    loc: "Vaslui",
    km: 3, minute: 5,
    text: "Colecția de bază a județului: istorie, arheologie, etnografie, artă populară și artă modernă, din antichitate până azi.",
    cauta: "Muzeul Județean Ștefan cel Mare Vaslui",
    foto: null,
  },
  {
    cheie: "copou",
    nume: "Parcul Copou",
    loc: "Vaslui",
    km: 4, minute: 7,
    text: "Cea mai mare grădină publică a orașului. Pe Aleea Scriitorilor sunt busturile lui Eminescu, Creangă, Kogălniceanu, Alecu Russo și Costache Negri.",
    cauta: "Parcul Copou Vaslui",
    foto: "copou.jpg",
    credit: { autor: "Gabysor", licenta: "CC BY-SA 4.0",
      pagina: "https://commons.wikimedia.org/wiki/File:Parcul_Copou.jpg" },
  },
  {
    cheie: "solesti",
    nume: "Conacul Rosetti-Solescu",
    loc: "Solești",
    km: 21, minute: 31,
    /* Spus pe fata, nu ocolit: cine face 21 de km asteptandu-se la un conac
       restaurat se intoarce suparat. Ce merita drumul e curtea, nu casa. */
    text: "Casa copilăriei Elenei Cuza, ridicată pe la 1827. Conacul e în ruină și nu se vizitează pe dinăuntru — de văzut rămân parcul cu arbori seculari, biserica „Adormirea Maicii Domnului” și mormântul Elenei Cuza din curtea ei.",
    cauta: "Conacul Rosetti-Solescu Solești Vaslui",
    foto: "solesti.jpg",
    credit: { autor: "Cezar Suceveanu", licenta: "CC BY 2.5",
      pagina: "https://commons.wikimedia.org/wiki/File:Conacul_din_Sole%C5%9Fti.jpg" },
  },
  {
    cheie: "burcel",
    nume: "Movila lui Burcel",
    loc: "Miclești",
    km: 28, minute: 38,
    text: "Monument și mănăstire pe o movilă cu priveliște largă peste dealurile Vasluiului. Legenda spune că aici l-ar fi ajutat Ștefan cel Mare la arat pe răzeșul Burcel.",
    cauta: "Movila lui Burcel Miclești Vaslui",
    foto: "burcel.jpg",
    credit: { autor: "FoamBubbles", licenta: "CC BY-SA 4.0",
      pagina: "https://commons.wikimedia.org/wiki/File:Situl_istoric_%E2%80%9EMovila_lui_Burcel%E2%80%9D_monument.jpg" },
  },
  {
    cheie: "racovita",
    nume: "Casa memorială „Emil Racoviță”",
    loc: "com. Emil Racoviță",
    km: 34, minute: 38,
    text: "Muzeu dedicat savantului, cu fotografii, documente de familie și obiecte din expediția antarctică a navei Belgica.",
    cauta: "Casa memorială Emil Racoviță Vaslui",
    foto: "racovita.jpg",
    credit: { autor: "Cezar Suceveanu", licenta: "CC BY 2.5",
      pagina: "https://commons.wikimedia.org/wiki/File:Casa_memorial%C4%83_Emil_Racovi%C8%9B%C4%83.jpg" },
  },
  {
    cheie: "husi",
    nume: "Muzeul Caricaturii",
    loc: "Huși",
    km: 39, minute: 49,
    text: "Unul dintre puținele muzee de caricatură din țară, deschis în 2006, cu lucrări din salonul de grafică satirică „Damigenius”.",
    cauta: "Muzeul Caricaturii Huși",
    foto: null,
  },
  {
    cheie: "zoo",
    nume: "Grădina Zoologică",
    loc: "Bârlad",
    km: 48, minute: 50,
    text: "Șase hectare de pădure veche la marginea orașului, cu zeci de specii de mamifere, păsări și pești, printre care lei și tigri. Deschisă din 1959.",
    cauta: "Grădina Zoologică Bârlad",
    foto: null,
  },
  {
    cheie: "parvan",
    nume: "Muzeul „Vasile Pârvan”",
    loc: "Bârlad",
    km: 50, minute: 52,
    text: "Cel mai mare muzeu al județului, cu cinci secții — arheologie, artă, științele naturii, astronomie și oameni ai Bârladului — și singurul planetariu digital din Vaslui, deschis în 2009.",
    cauta: "Muzeul Vasile Pârvan Bârlad",
    foto: "parvan.jpg",
    credit: { autor: "ElaG", licenta: "CC BY-SA 3.0 RO",
      pagina: "https://commons.wikimedia.org/wiki/File:Muzeul_%22Vasile_Parvan%22_Barlad.jpg" },
  },
  {
    cheie: "sturdza",
    nume: "Casa Sturdza",
    loc: "Bârlad",
    km: 50, minute: 53,
    text: "Casă boierească din 1812, una dintre cele mai bine păstrate clădiri de epocă din județ. Găzduiește Muzeul Colecțiilor, șase colecții donate de-a lungul a peste optzeci de ani.",
    cauta: "Casa Sturdza Bârlad",
    foto: "sturdza.jpg",
    credit: { autor: "Bogdan29roman", licenta: "CC BY-SA 3.0",
      pagina: "https://commons.wikimedia.org/wiki/File:Casa_Sturdza_-_Muzeul_Colectiilor_Barlad.jpg" },
  },
];

/* Cate atractii pe pagina. Cinci, cum s-a cerut — si tot cinci e numarul
   de poze care se descarca odata, ceea ce conteaza pe date mobile. */
export const ATRACTII_PE_PAGINA = 5;

export const linkHarta = (a) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.cauta)}`;
