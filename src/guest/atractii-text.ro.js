/* Textul atractiilor turistice, in romana — sursa pentru celelalte 6
 * limbi. Mutat din continut.ro.js la Task 7: text lung, citit rar,
 * incarcat leneș prin continut-mare.js. Campurile factuale (distanta,
 * poza, link) raman in date.js, neschimbate de limba — aici e doar
 * `nume`/`text`, legate de ele prin `cheie`. Aceeasi forma trebuie sa
 * existe si in atractii-text.en.js, atractii-text.fr.js,
 * atractii-text.it.js, atractii-text.de.js, atractii-text.ru.js,
 * atractii-text.uk.js — verificat de continut-forme.test.js. */

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
