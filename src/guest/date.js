/* Faptele operationale ale complexului — coordonate, numere de telefon,
 * numele retelei Wi-Fi, ordinea pozelor de acces, datele factuale ale
 * atractiilor (distanta, poza, sursa). NU se traduc si NU se dubleaza
 * per limba: un singur fisier, indiferent cate limbi are pagina.
 *
 * Contine EXACT ce ramane identic in toate cele 7 limbi. Textul care se
 * traduce (descrieri, introduceri, reguli) sta in continut.<lang>.js. */

export const TELEFON = "+40722899899";
export const TELEFON_SCRIS = "+40 722 899 899";
export const FIRMA = "S.C. OVISER S.R.L. · CUI RO33918057";

/* `nume`, `telefon`, `scris`, `wa` nu se traduc — un nume de persoana si
 * niste cifre. Propozitia „raspunde in cateva minute" e text, deci sta
 * in continut.<lang>.js, ca `asistentaRaspuns`. */
export const ASISTENTA = {
  nume: "Răzvan",
  telefon: "+40725259999",
  scris: "+40 725 259 999",
  wa: "40725259999",
};

export const ACASA = { lat: 46.6225253, lon: 27.7551750, localitate: "Vaslui" };

const ADRESA = "Complex La Livada, DN24, nr. 743, Muntenii de Jos, jud. Vaslui";
export const LINK_MAPS =
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADRESA)}`;
export const LINK_WAZE =
  `https://www.waze.com/ul?q=${encodeURIComponent(ADRESA)}&navigate=yes`;
export const HARTA_INCORPORATA =
  `https://maps.google.com/maps?q=${ACASA.lat},${ACASA.lon}` +
  `&t=h&z=16&hl=ro&ie=UTF8&output=embed`;

/* `poze` tine DOAR ordinea si numele fisierului — descrierea (text) e in
 * continut.<lang>.js, legata prin `fisier`, nu prin pozitie in array: o
 * traducere care schimba ordinea din greseala nu strica potrivirea. */
export const ACCES_CAMERE = {
  poze: [
    { fisier: "1-intrarea.jpg" },
    { fisier: "2-aleea.jpg" },
    { fisier: "3-parcarea.jpg" },
    { fisier: "4-poteca.jpg" },
  ],
  pasi: [],
};

export const WIFI = { retea: "La Livada WiFi" };

/* Campurile factuale ale atractiilor, legate de text prin `cheie` — vezi
 * continut.<lang>.js pentru `nume`/`text`. */
export const ATRACTII = [
  { cheie: "curtea", loc: "Vaslui", km: 3, minute: 4,
    cauta: "Curtea Domnească Vaslui", foto: "curtea.jpg",
    credit: { autor: "Adrian Baciu", licenta: "CC BY-SA 3.0 RO",
      pagina: "https://commons.wikimedia.org/wiki/File:Biserica_Taierea_Capului_Sfantului_Ioan_Botezatorul_0082.jpg" } },
  { cheie: "muzeuvs", loc: "Vaslui", km: 3, minute: 5,
    cauta: "Muzeul Județean Ștefan cel Mare Vaslui", foto: "muzeuvs.jpg" },
  { cheie: "copou", loc: "Vaslui", km: 4, minute: 7,
    cauta: "Parcul Copou Vaslui", foto: "copou.jpg",
    credit: { autor: "Gabysor", licenta: "CC BY-SA 4.0",
      pagina: "https://commons.wikimedia.org/wiki/File:Parcul_Copou.jpg" } },
  { cheie: "statuie", loc: "Băcăoani, com. Muntenii de Jos", km: 6, minute: 10,
    cauta: "Statuia ecvestră Ștefan cel Mare Podul Înalt Băcăoani", foto: "statuie.jpg" },
  { cheie: "dinoparc", loc: "Secuia, com. Muntenii de Jos", km: 8, minute: 13,
    cauta: "Dino Parc Moldova Secuia Vaslui", foto: "dino.jpg" },
  { cheie: "solesti", loc: "Solești", km: 21, minute: 31,
    cauta: "Conacul Rosetti-Solescu Solești Vaslui", foto: "solesti.jpg",
    credit: { autor: "Cezar Suceveanu", licenta: "CC BY 2.5",
      pagina: "https://commons.wikimedia.org/wiki/File:Conacul_din_Sole%C5%9Fti.jpg" } },
  { cheie: "burcel", loc: "Miclești", km: 28, minute: 38,
    cauta: "Movila lui Burcel Miclești Vaslui", foto: "burcel.jpg",
    credit: { autor: "FoamBubbles", licenta: "CC BY-SA 4.0",
      pagina: "https://commons.wikimedia.org/wiki/File:Situl_istoric_%E2%80%9EMovila_lui_Burcel%E2%80%9D_monument.jpg" } },
  { cheie: "racovita", loc: "com. Emil Racoviță", km: 34, minute: 38,
    cauta: "Casa memorială Emil Racoviță Vaslui", foto: "racovita.jpg",
    credit: { autor: "Cezar Suceveanu", licenta: "CC BY 2.5",
      pagina: "https://commons.wikimedia.org/wiki/File:Casa_memorial%C4%83_Emil_Racovi%C8%9B%C4%83.jpg" } },
  { cheie: "zoo", loc: "Bârlad", km: 48, minute: 50,
    cauta: "Grădina Zoologică Bârlad", foto: "zoo.jpg" },
  { cheie: "parvan", loc: "Bârlad", km: 50, minute: 52,
    cauta: "Muzeul Vasile Pârvan Bârlad", foto: "parvan.jpg",
    credit: { autor: "ElaG", licenta: "CC BY-SA 3.0 RO",
      pagina: "https://commons.wikimedia.org/wiki/File:Muzeul_%22Vasile_Parvan%22_Barlad.jpg" } },
];

export const ATRACTII_PE_PAGINA = 5;

export const linkHarta = (a) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.cauta)}`;
