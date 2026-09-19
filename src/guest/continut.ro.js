/* Continutul editorial in romana — sursa pentru celelalte 6 limbi.
 * Aceeasi forma (aceleasi chei) trebuie sa existe si in continut.en.js,
 * continut.fr.js, continut.it.js, continut.de.js, continut.ru.js,
 * continut.uk.js — verificat de continut-forme.test.js. */

export const asistentaRaspuns = "răspunde în câteva minute";

export const BUN_VENIT = {
  intro: "Ne bucurăm că ești aici și îți dorim o ședere plăcută.",
  puncte: [
    {
      titlu: "Wi-Fi gratuit",
      inainte: "Rețeaua ",
      dupa: ", fără parolă.",
      actiune: "wifi",
    },
    {
      titlu: "Salvează pagina pe telefon",
      text: "Codul și butonul de deschidere rămân la îndemână tot sejurul.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Fumatul", text: "Interzis în cameră și în spațiile interioare — afară se poate. Fumatul în cameră se taxează cu 500 de lei." },
  { titlu: "Liniștea", text: "Între 22:00 și 08:00 te rugăm să păstrezi liniștea." },
  { titlu: "Animale de companie", text: "Sunt binevenite, cu o taxă de 50 de lei pe sejur." },
  { titlu: "Parcarea", text: "Gratuită în incintă, pe răspunderea proprietarului mașinii." },
];

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

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Intrați prin parcarea din dreapta și urmați sensul de mers." },
  { fisier: "2-aleea.jpg",    descriere: "La acest panou continuați să mergeți drept înainte." },
  { fisier: "3-parcarea.jpg", descriere: "Ați ajuns în parcare." },
  { fisier: "4-poteca.jpg",   descriere: "Accesul spre camere se face pe aleea din dreapta, prin fața Grand'Or Ballroom." },
];

export const ATRACTII_TEXT = [
  { cheie: "curtea", nume: "Curtea Domnească", text: "Ruinele curții ridicate de Alexandru cel Bun și extinse de Ștefan cel Mare între 1472 și 1490, lângă biserica „Tăierea Capului Sf. Ioan Botezătorul”, ctitorie a lui Ștefan din 1490." },
  { cheie: "muzeuvs", nume: "Muzeul Județean „Ștefan cel Mare”", text: "Colecția de bază a județului: istorie, arheologie, etnografie, artă populară și artă modernă, din antichitate până azi." },
  { cheie: "copou", nume: "Parcul Copou", text: "Cea mai mare grădină publică a orașului. Pe Aleea Scriitorilor sunt busturile lui Eminescu, Creangă, Kogălniceanu, Alecu Russo și Costache Negri." },
  { cheie: "statuie", nume: "Statuia ecvestră a lui Ștefan cel Mare", text: "Călărețul de bronz de 6,90 m, ridicat în 1975 pe un soclu de 8 m, la 500 de ani de la bătălia de la Podul Înalt din 10 ianuarie 1475. Sculptor: Mircea Ștefănescu. Se urcă pe 27 de trepte, iar la bază arde o flacără veșnică." },
  { cheie: "dinoparc", nume: "Dino Parc Moldova", text: "Peste 30 de dinozauri în mărime naturală, pe 2,2 hectare la marginea pădurii Crasna, cu poteci de peste 1,5 km, punți suspendate și un tunel. Deschis în 2026. Verifică programul pe Google Maps înainte să pornești." },
  { cheie: "solesti", nume: "Conacul Rosetti-Solescu", text: "Casa copilăriei Elenei Cuza, ridicată pe la 1827. Conacul e în ruină și nu se vizitează pe dinăuntru — de văzut rămân parcul cu arbori seculari, biserica „Adormirea Maicii Domnului” și mormântul Elenei Cuza din curtea ei." },
  { cheie: "burcel", nume: "Movila lui Burcel", text: "Monument și mănăstire pe o movilă cu priveliște largă peste dealurile Vasluiului. Legenda spune că aici l-ar fi ajutat Ștefan cel Mare la arat pe răzeșul Burcel." },
  { cheie: "racovita", nume: "Casa memorială „Emil Racoviță”", text: "Muzeu dedicat savantului, cu fotografii, documente de familie și obiecte din expediția antarctică a navei Belgica." },
  { cheie: "zoo", nume: "Grădina Zoologică", text: "Șase hectare de pădure veche la marginea orașului, cu zeci de specii de mamifere, păsări și pești, printre care lei și tigri. Deschisă din 1959." },
  { cheie: "parvan", nume: "Muzeul „Vasile Pârvan”", text: "Cel mai mare muzeu al județului, cu cinci secții — arheologie, artă, științele naturii, astronomie și oameni ai Bârladului — și singurul planetariu digital din Vaslui, deschis în 2009." },
];
