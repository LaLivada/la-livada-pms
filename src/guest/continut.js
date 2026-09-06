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

/* Numarul general al complexului: subsolul paginii si ecranul de refuz. */
export const TELEFON = "+40722899899";
export const TELEFON_SCRIS = "+40 722 899 899";

/* ASISTENTA — omul pe care il suna oaspetele cand ceva nu merge ACUM.
 *
 * Alt numar decat cel de mai sus, si deliberat: la subsol sta numarul
 * complexului, aici sta cineva anume, cu numele lui. Un oaspete inchis pe
 * dinafara la miezul noptii suna mai usor un „Razvan" decat un numar.
 *
 * `wa` e formatul cerut de wa.me: prefix de tara fara plus si fara zero. */
export const ASISTENTA = {
  nume: "Răzvan",
  raspuns: "răspunde în câteva minute",
  telefon: "+40725259999",
  scris: "+40 725 259 999",
  wa: "40725259999",
};

/* Complexul, la DN24 nr. 743, Muntenii de Jos, judetul Vaslui.
   Coordonatele sunt cele din OpenStreetMap, unde punctul e chiar numit
   „La Livada" — nu centrul comunei. Le foloseste widget-ul de vreme si
   calculul distantelor catre atractii. */
/* `localitate` e doar eticheta de sub siglă, si scrie „Vaslui", nu comuna
   reala. Nu e o scapare: complexul e la 3 km de oras, iar oaspetele care se
   uita la temperatura stie unde e Vasluiul, nu unde e Muntenii de Jos.
   Coordonatele raman ale complexului — vremea si distantele se calculeaza
   din ele, nu din eticheta. */
export const ACASA = { lat: 46.6225253, lon: 27.7551750, localitate: "Vaslui" };

/* Navigatia catre complex.
 *
 * Aceleasi adrese ca pe lalivada.ro (components/HartaContact.tsx), litera
 * cu litera — cautare dupa adresa, nu dupa coordonate. Am inceput cu
 * coordonatele, ca fiind mai precise, si m-am intors: cautarea dupa adresa
 * cade pe fisa firmei din Google, unde reperul e cel intretinut de ei. Daca
 * il corecteaza vreodata, se corecteaza in amandoua locurile deodata; cu
 * coordonate scrise de mana, aici ar fi ramas cel vechi.
 *
 * `www.waze.com`, nu `waze.com`: al doilea intoarce 301 catre primul, iar o
 * saritura in plus pe un telefon cu semnal prost e exact ce nu-ti trebuie
 * cand esti deja pe drum. `navigate=yes` porneste navigarea, nu doar arata
 * reperul — cine apasa aici vrea sa ajunga, nu sa se uite. */
const ADRESA = "Complex La Livada, DN24, nr. 743, Muntenii de Jos, jud. Vaslui";
export const LINK_MAPS =
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADRESA)}`;
export const LINK_WAZE =
  `https://www.waze.com/ul?q=${encodeURIComponent(ADRESA)}&navigate=yes`;

/* Harta din card.
 *
 * `t=h` inseamna HIBRID: imagine din satelit CU drumurile si numele lor peste
 * ea. `t=k` ar da satelitul curat, frumos si inutil — cine se uita la harta
 * vrea sa vada pe unde vine, iar de pe satelitul gol nu se citeste niciun drum.
 *
 * DE CE ADRESA ASTA SI NU API-UL OFICIAL. Google are un Maps Embed API
 * documentat (maps.googleapis.com/maps/embed/v1/), dar cere o cheie. Forma de
 * mai jos, cu `output=embed`, merge fara cheie si e cea folosita de ani de
 * zile peste tot; in schimb nu e documentata, deci daca intr-o zi harta apare
 * goala, aici trebuie cautat, nu in CSS. Alternativa e o cheie de la Google.
 *
 * Coordonatele, nu adresa scrisa: complexul e pe un drum national, iar
 * cautarea dupa text nimerea reperul „Muntenii de Jos", la vreun kilometru.
 *
 * De stiut: iframe-ul incarca de la Google, deci Google vede fiecare
 * deschidere a paginii de catre oaspete. */
export const HARTA_INCORPORATA =
  `https://maps.google.com/maps?q=${ACASA.lat},${ACASA.lon}` +
  `&t=h&z=16&hl=ro&ie=UTF8&output=embed`;

/* „Acces către camere" — cum se orienteaza omul in curtea interioara, dupa
   ce a ajuns la poarta.
 *
 * GOL PANA CAND E COMPLETAT. Textul si pozele vin de la proprietar; un
 * traseu inventat prin curtea altcuiva ar trimite oaspetii aiurea, noaptea,
 * cu bagajele in mana. Pana atunci, fereastra spune cinstit ca indrumarea
 * inca nu e pusa si da numarul de la receptie.
 *
 * Forma:
 *   poze:  [{ fisier: "curte-1.jpg", descriere: "Poarta dinspre DN24" }]
 *          fisierele se pun in `public-guest/acces/`
 *   pasi:  ["Intri pe poarta din dreapta clădirii…", "…"]
 */
export const ACCES_CAMERE = {
  poze: [],
  pasi: [],
};

/* „Bun venit". Un rand de intampinare si cateva lucruri de stiut din prima
   clipa. Punctele sunt perechi titlu/text. */
export const BUN_VENIT = {
  intro: "Ne bucurăm că ești aici.",
  /* Un singur punct. Al doilea trimitea la telefon, iar acum contactul are
     blocul lui la sfarsitul panoului, cu butoane — scris de doua ori, ar fi
     fost si mai lung, si mai putin clar. */
  puncte: [
    {
      titlu: "Salvează pagina pe telefon",
      text: "Codul și butonul de deschidere rămân la îndemână tot sejurul.",
      // Sub punctul asta apare butonul de adaugare pe ecranul principal.
      actiune: "instalare",
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
 * PATRU POZE VIN DE LA PENSIUNE, nu de pe Wikimedia: muzeul judetean din
 * Vaslui, gradina zoologica din Barlad, Dino Parc si statuia de la Bacaoani.
 * Pentru niciunul nu exista vreo fotografie libera — cautat dupa nume, prin
 * categoriile oraselor si prin geosearch pe coordonatele fiecarui obiectiv,
 * care gaseste orice poza geoetichetata indiferent cum se numeste fisierul.
 * Intrarile astea n-au `credit`, si de aceea legenda din App.jsx e pusa sub
 * o conditie: fara ea, `a.credit.autor` arunca si cade tot panoul.
 *
 * Cat au stat fara poza, au stat fara — nu s-a pus imaginea altui loc. O
 * fotografie a centrului unui oras sub numele unui muzeu e o minciuna mica
 * pe care oaspetele o descopera abia la fata locului.
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
    /* Poza vine de la pensiune, nu de pe Wikimedia — de aceea n-are `credit`.
       Nu exista nicio fotografie liber licentiata a cladirii: cautata pe
       Commons dupa nume, prin categoriile Vaslui si prin geosearch pe
       coordonatele muzeului, zero rezultate. */
    foto: "muzeuvs.jpg",
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
    cheie: "statuie",
    nume: "Statuia ecvestră a lui Ștefan cel Mare",
    loc: "Băcăoani, com. Muntenii de Jos",
    km: 6, minute: 10,
    text: "Călărețul de bronz de 6,90 m, ridicat în 1975 pe un soclu de 8 m, la 500 de ani de la bătălia de la Podul Înalt din 10 ianuarie 1475. Sculptor: Mircea Ștefănescu. Se urcă pe 27 de trepte, iar la bază arde o flacără veșnică.",
    cauta: "Statuia ecvestră Ștefan cel Mare Podul Înalt Băcăoani",
    /* Poza vine de la pensiune, deci fara `credit`. A inlocuit una de pe
       Wikimedia (CC BY 3.0, Cezar Suceveanu) care arata ansamblul dinainte de
       reabilitare, cu treptele crapate si buruieni printre ele — corecta ca
       licenta, dar nu mai semana cu ce gaseste omul acolo. */
    foto: "statuie.jpg",
  },
  {
    cheie: "dinoparc",
    nume: "Dino Parc Moldova",
    loc: "Secuia, com. Muntenii de Jos",
    km: 8, minute: 13,
    /* Fara program scris aici: parcul e deschis din 2026 si orele s-au
       schimbat deja o data intre sursele publice. Linkul catre Google Maps
       arata programul de azi; un orar scris de mana in fisierul asta ar
       trimite pe cineva degeaba, intr-o zi in care e inchis. */
    text: "Peste 30 de dinozauri în mărime naturală, pe 2,2 hectare la marginea pădurii Crasna, cu poteci de peste 1,5 km, punți suspendate și un tunel. Deschis în 2026. Verifică programul pe Google Maps înainte să pornești.",
    cauta: "Dino Parc Moldova Secuia Vaslui",
    /* Tot de la pensiune. Parcul s-a deschis in 2026 si nu are nicio poza
       libera nicaieri — de asta a stat o vreme fara. */
    foto: "dino.jpg",
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
    cheie: "zoo",
    nume: "Grădina Zoologică",
    loc: "Bârlad",
    km: 48, minute: 50,
    text: "Șase hectare de pădure veche la marginea orașului, cu zeci de specii de mamifere, păsări și pești, printre care lei și tigri. Deschisă din 1959.",
    cauta: "Grădina Zoologică Bârlad",
    /* Tot de la pensiune, deci fara `credit`. Nici pentru zoo nu exista vreo
       poza libera — cautata pe Commons dupa nume, prin categoriile Barladului
       si prin geosearch pe coordonate. */
    foto: "zoo.jpg",
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
];

/* Cate atractii pe pagina. Cinci, cum s-a cerut — si tot cinci e numarul
   de poze care se descarca odata, ceea ce conteaza pe date mobile. */
export const ATRACTII_PE_PAGINA = 5;

export const linkHarta = (a) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.cauta)}`;
