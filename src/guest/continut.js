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
 * ORDINEA DIN `poze` E ORDINEA DRUMULUI, si e singurul lucru care o
 * stabileste. Nu numele fisierului, nu data pozei: sirul de aici. Cine
 * schimba ordinea aici schimba traseul pe care il urmeaza oaspetele.
 *
 * `descriere` se afiseaza DEASUPRA pozei, nu sub ea: e o indrumare, nu o
 * legenda. Omul citeste ce are de facut si abia apoi se uita la poza ca sa
 * recunoasca locul. Lasata goala, poza apare fara text — nu se strica nimic.
 *
 * POZELE NU SE PUN DE MANA in public-guest/acces/. Vin din telefon cu 3-4 MB
 * bucata, iar panoul se deschide pe date mobile, la poarta. Se pun numerotate
 * 1..N in `poze-acces/` (folder ignorat de git) si se trec prin:
 *
 *   npm i --no-save sharp && node scripts/acces-poze.mjs
 *
 * Scriptul le duce la 720px, le roteste dupa EXIF, le comprima sub 220 KB si
 * tipareste la final exact sirul de pus mai jos.
 *
 * GOL PANA CAND E COMPLETAT. Un traseu inventat prin curtea altcuiva ar
 * trimite oaspetii aiurea, noaptea, cu bagajele in mana. Cat timp e gol,
 * fereastra spune cinstit ca indrumarea nu e pusa si da numarul de la
 * receptie — vezi `ContinutAcces` din App.jsx.
 *
 * Forma:
 *   poze:  [{ fisier: "1-intrarea.jpg", descriere: "Text deasupra pozei" }]
 *   pasi:  ["Intri pe poarta din dreapta clădirii…", "…"]
 */
export const ACCES_CAMERE = {
  poze: [],
  pasi: [],
};

/* Reteaua de oaspeti. Deschisa, fara parola — de aceea nu exista aici niciun
   camp de parola si nici nu trebuie sa apara vreodata unul: o parola scrisa
   in bundle-ul public ar fi o parola publica. */
export const WIFI = {
  retea: "La Livada WiFi",
};

/* „Bun venit". Un rand de intampinare si cateva lucruri de stiut din prima
   clipa. Punctele sunt perechi titlu/text. */
export const BUN_VENIT = {
  /* Se afiseaza pe un singur rand, cu marimea potrivita la rulare — vezi
     `useUnSingurRand` din App.jsx. Un text mai lung de atat va incepe sa
     micsoreze fontul pe telefoanele inguste. */
  intro: "Ne bucurăm că ești aici și îți dorim o ședere plăcută.",
  /* Wi-Fi-ul sta deasupra: e primul lucru cautat la intrarea in camera, iar
     salvarea paginii are sens abia dupa ce telefonul are internet. */
  puncte: [
    {
      titlu: "Wi-Fi gratuit",
      /* Numele retelei se ingroasa, deci textul vine taiat in trei. JSX n-are
         ce cauta aici: fisierul e .js, iar pluginul de React nu-l transforma
         — ar cadea build-ul. */
      inainte: "Rețeaua ",
      tare: WIFI.retea,
      dupa: ", fără parolă.",
      // Sub punctele astea doua apar butoanele lor; vezi App.jsx.
      actiune: "wifi",
    },
    {
      titlu: "Salvează pagina pe telefon",
      text: "Codul și butonul de deschidere rămân la îndemână tot sejurul.",
      actiune: "instalare",
    },
  ],
};

/* „Important". Reguli si lucruri de tinut minte care sunt aceleasi pentru
   toata lumea. Cele care depind de rezervare (ora de plecare, valabilitatea
   codului) se adauga in App.jsx, inaintea acestora.

   LISTA E DELIBERAT SCURTA. Aici stau numai cele patru lucruri pe care
   oaspetele trebuie sa le stie fara sa caute; restul regulilor sunt in
   REGULAMENT, la o apasare distanta. Scrise de doua ori, si aici pe lung,
   panoul ar fi devenit el insusi un regulament pe care nu-l mai citeste
   nimeni.

   Confirmate de proprietar in septembrie 2026. Pana atunci lista a fost
   goala, fiindca inventarea unei reguli de casa e mai rea decat lipsa ei. */
export const IMPORTANT = [
  {
    titlu: "Fumatul",
    text: "Interzis în cameră și în spațiile interioare — afară se poate. Fumatul în cameră se taxează cu 500 de lei.",
  },
  {
    titlu: "Liniștea",
    text: "Între 22:00 și 08:00 te rugăm să păstrezi liniștea.",
  },
  {
    titlu: "Animale de companie",
    text: "Sunt binevenite, cu o taxă de 50 de lei pe sejur.",
  },
  {
    titlu: "Parcarea",
    text: "Gratuită în incintă, pe răspunderea proprietarului mașinii.",
  },
];

/* Regulamentul complexului, deschis dintr-o fereastra suprapusa de sub
   punctele din „Important".
 *
 * TEXTUL E AL PROPRIETARULUI, transcris ca atare. S-au atins doar
 * diacriticele (ş/ţ cu sedila -> ș/ț cu virgula, ca in restul aplicatiei) si
 * cateva greseli evidente de dactilografiere. Formularile juridice au ramas
 * neschimbate chiar unde sunt stangace: nu e text de stil, e text care se
 * invoca la o paguba, iar o „limpezire" facuta de mine i-ar schimba
 * intelesul fara ca nimeni sa fi cerut asta. */
export const REGULAMENT = {
  intro: "Oaspeții au luat la cunoștință următoarele reguli și se obligă să le respecte:",
  reguli: [
    "să nu deterioreze amenajarea sau obiectele din dotarea complexului, în caz contrar aceștia datorează complexului suma egală cu valoarea achiziționării/amenajării obiectului deteriorat și manopera aferentă;",
    "să nu preia la plecare bunuri din dotarea complexului;",
    "să păstreze liniștea, în special între orele 22:00 și 08:00, astfel încât să nu deranjeze alți oaspeți;",
    "să nu intre fără permisiunea administrației în alte camere sau în spațiile destinate doar personalului complexului;",
    "să anunțe persoanele care vin în vizită nefiind cazate în cadrul locației; intrarea acestora în complex se va face doar în urma legitimării și înregistrării împreună cu persoana cazată ce urmează să fie vizitată de aceștia;",
    "să nu lase copiii nesupravegheați în niciunul dintre spațiile complexului; orice accident produs ca urmare a nesupravegherii copiilor în incinta locațiilor La Livada nu este responsabilitatea complexului, ci a persoanelor care însoțesc copiii și sunt însărcinate cu supravegherea acestora; părinții, tutorii sau însoțitorii sunt responsabili pentru acțiunile minorilor și se obligă să aibă grijă de ei, respectiv ca aceștia să se comporte civilizat și să nu deranjeze alți oaspeți ai complexului;",
    "să anunțe cât de repede posibil orice defecțiune a aparatelor, instalațiilor sau alte neconformități tehnice/mobilier din dotarea complexului. Eventuale defecțiuni tehnice pot apărea oricând. De îndată ce sunt sesizate, acestea vor fi anunțate prompt persoanei de contact pentru asistență, urmând ca în cel mai scurt timp un tehnician să remedieze defecțiunea. O defecțiune neanunțată nu poate fi reparată și nu poate fi reclamată după plecarea oaspetelui din complex;",
    "să nu arunce în toaletă obiecte care ar putea conduce la avarierea stației de colectare a reziduurilor;",
    "să informeze persoana de contact pentru asistență sau a sălilor de evenimente cu privire la orice alergie sau intoleranță la vreun aliment;",
    "să nu folosească prosoapele sau lenjeria pentru: șters părul, vopsit, pentru demachiat, curățat încălțămintea, geamantanele, pardoseala etc. Prosoapele se vor folosi pentru uz corporal. Dacă vor fi identificate prosoape sau lenjerie deteriorate de utilizarea necorespunzătoare a turistului, acestea se vor imputa ca daună și se vor achita de către turistul răspunzător. În caz contrar, Complexul La Livada își rezervă dreptul de a anula rezervarea camerei oaspetelui și de a face evacuarea acestuia, fără restituirea contravalorii serviciilor achitate;",
    "lenjeria de cameră (cearceafuri, prosoape, papuci) este destinată utilizării exclusive în incinta camerei. Este interzisă scoaterea oricărei piese de lenjerie în exterior;",
    "orice accident produs ca urmare a utilizării necorespunzătoare a obiectelor din dotare sau a utilizării facilităților complexului fără respectarea normelor de securitate corespunzătoare acestora nu este responsabilitatea hotelului;",
    "introducerea și utilizarea echipamentelor de gătit/încălzit în camerele din complex (în afara celor puse la dispoziție de către complex) este strict interzisă din motive de siguranță la incendiu, potrivit legislației în vigoare;",
    "se interzice cu desăvârșire introducerea în complex de armament, arme albe sau substanțe lacrimogene. Conform legislației române, consumul sau comercializarea de substanțe halucinogene sau psihotrope este interzis și se pedepsește;",
    "nu este permis nudismul sau orice formă de exhibiționism în incinta complexului;",
    "gunoiul și resturile menajere se vor depozita în coșurile de gunoi amplasate pe raza complexului;",
    "nu este permis alergatul sau practicarea oricărui sport în camere sau în aleile și parcările complexului;",

    /* De aici incolo, reguli confirmate de proprietar in septembrie 2026.
       Scrise in tiparul celor de mai sus; sumele si orele sunt exact cele
       date, nimic rotunjit si nimic completat de la mine. */
    "fumatul este interzis în camere și în spațiile interioare ale complexului; fumatul în cameră se taxează cu 500 de lei, reprezentând contravaloarea igienizării;",
    "animalele de companie sunt acceptate, cu o taxă de 50 de lei pe sejur;",
    "să nu cazeze în cameră mai multe persoane decât cele înscrise în rezervare; în caz contrar rezervarea se anulează, iar contravaloarea primei nopți nu se restituie;",
    "organizarea de petreceri sau de evenimente private în camere este interzisă. În caz contrar, Complexul La Livada își rezervă dreptul de a anula rezervarea camerei oaspetelui și de a face evacuarea acestuia, fără restituirea contravalorii serviciilor achitate;",
    "parcarea în incinta complexului este gratuită și se face pe răspunderea proprietarului autovehiculului;",
    "obiectele uitate în complex se păstrează 30 de zile de la plecare; după acest termen complexul nu mai răspunde de ele.",
  ],
};

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
