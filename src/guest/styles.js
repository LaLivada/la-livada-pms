/* Stiluri pentru pagina oaspetelui.
 *
 * Culorile si fonturile sunt luate din lalivada.ro, nu apropiate de ele:
 * aceleasi valori din booking/brand.css, care e la randul lui portat din
 * site. Ivory pentru fundal, charcoal pentru cardul principal, champagne
 * pentru butonul din el — exact rolurile pe care le au si acolo.
 *
 * Asezarea urmeaza macheta ceruta: salut cu emblema in dreapta, un card
 * inchis la culoare care tine lucrul cel mai important, un rand de butoane
 * si abia apoi restul.
 *
 * Diferenta de fond fata de restul aplicatiilor: pagina asta se deschide
 * aproape numai pe telefon, adesea in fata usii, uneori pe intuneric. De
 * aceea codul si butonul de deschidere stau primele si sunt mari.
 */
/* ATENTIE: tot ce urmeaza e un template literal. Fara backticks in
   comentariile CSS — inchid sirul, iar build-ul cade cu un mesaj despre
   punct si virgula lipsa, care nu trimite deloc la cauza reala. */
export const STILURI = `
:root{
  /* Jetoanele de pe lalivada.ro (booking/brand.css). */
  --ivory:#f5f1e8;
  --beige:#e7dfd1;
  --olive:#3f4a3d;
  --olive-deep:#333d31;
  --charcoal:#22221f;
  --champagne:#c8b18a;

  --ui:"Manrope",system-ui,-apple-system,sans-serif;
  --editorial:"Instrument Serif","Iowan Old Style",Georgia,serif;

  --g-text:#22221f;
  --g-muted:rgba(34,34,31,.62);
  --g-faint:rgba(34,34,31,.42);
  --g-line:rgba(63,74,61,.16);
  --g-hair:rgba(63,74,61,.09);
  --g-card:#fffdf8;
  /* Suprafata casetelor de formular si a panzei de semnat. Jeton, nu #fff
     scris in regula: textul din ele e --g-text, care se inverseaza in tema de
     noapte. Perechea trebuie sa se intoarca IMPREUNA — altfel textul tastat
     iese aproape alb pe alb, iar semnatura nu se vede deloc. */
  --g-camp:#fff;
  /* Text asezat pe suprafete inchise in AMBELE teme: butoanele masline si
     cardul principal. NU se redefineste in blocul de noapte, si asta e
     rostul lui — pana acum aici statea --ivory, care se inverseaza si lasa
     litera neagra pe verde inchis. */
  --g-pe-inchis:#f5f1e8;
  --g-radius:18px;
}
*,*::before,*::after{ box-sizing:border-box; }
body{
  margin:0; background:var(--ivory); color:var(--g-text);
  font-family:var(--ui); line-height:1.55;
  -webkit-font-smoothing:antialiased; -webkit-text-size-adjust:100%;
}
.g-pagina{
  max-width:480px; margin:0 auto;
  padding:22px 18px calc(36px + env(safe-area-inset-bottom));
  display:grid; gap:16px;
}

/* ---------- salutul ---------- */
/* Trei etaje, unul sub altul: ora zilei, apoi randul cu numele si sigla,
   apoi vremea.
   Sigla sta pe ACELASI rand cu numele si centrata pe el — nu langa blocul
   intreg de text, unde se alinia cu „buna dimineata" si parea agatata de
   randul gresit. */
.g-salut{ display:flex; flex-direction:column; gap:7px; }
/* Ora zilei la stanga, vremea la dreapta, deasupra siglei.
   Aliniate la INCEPUT, nu la mijloc: sigla de sub ele urca 11px in banda asta
   (vezi marginea negativa de la .g-salut-rand), deci vremea trebuie tinuta cat
   mai sus ca sa nu intre peste ea. Randul e inalt cat ora zilei, care e mai
   inalta decat vremea — asa adaugarea vremii nu misca nimic dedesubt. */
.g-salut-sus{
  display:flex; align-items:flex-start; justify-content:space-between;
  gap:10px;
}
.g-salut-ora{ margin:0; font-size:15px; color:var(--g-muted); }

/* space-between tine sigla lipita de marginea din dreapta indiferent cat de
   scurt e numele.

   Alinierea e pe LINIA DE BAZA, nu pe centru. Sigla e mai inalta decat banda
   literelor (27px fata de 17px cat are inaltimea majusculelor la 23px), deci
   centrata ea cobora cu ~6px sub baza textului — adica fix cat coada lui ț
   din „Duță". Ochiul citea sigla ca aliniata cu coada, nu cu textul.
   Cu baseline, marginea ei de jos sta exact pe linia pe care stau literele.
   Masurat: decalajul fata de baza trece de la 5,7px la 0. */
.g-salut-rand{
  display:flex; align-items:baseline; justify-content:space-between; gap:10px;
  /* Sigla e mai inalta decat partea de deasupra liniei de baza a numelui
     (33px fata de 22px, la 25px marime de font), iar alinierea pe linia de
     baza face diferenta asta sa impinga numele in jos: sub „buna seara"
     ramanea un gol de 18px in loc de 7. Marginea negativa ridica randul
     intreg, sigla cu tot, si pune numele inapoi la distanta ceruta de gap.
     Numarul e diferenta masurata; se schimba odata cu latimea siglei, deci
     are pereche in media query-ul de mai jos. */
  margin-top:-11px;
}
.g-salut-nume{
  margin:0; min-width:0; font-family:var(--editorial); font-weight:400;
  font-size:25px; line-height:1.15;
  /* Numele unui grup poate fi lung. Se rupe pe doua randuri si abia apoi
     se taie — pe langa vreme si emblema a mai ramas putina latime, iar un
     nume taiat la jumatate de cuvant e mai rau decat unul pe doua randuri. */
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; overflow-wrap:anywhere;
}
.g-mana{ font-family:var(--ui); font-size:19px; }

/* Latime fixa, nu procentuala: sigla e un desen cu litere, iar daca s-ar
   intinde dupa cat de lung e numele ar arata altfel la fiecare oaspete. */
.g-emblema{ display:block; flex-shrink:0; width:132px; }
.g-emblema img{ display:block; width:100%; height:auto; }
/* Pe telefoanele mici sigla se strange, ca sa nu manance latimea numelui.
   Sub 108px cuvintele „LA LIVADĂ" incep sa se inchida, deci acolo se
   opreste. */
@media (max-width: 359px){
  .g-emblema{ width:108px; }
  .g-salut-nume{ font-size:23px; }
  /* Sigla mai mica (27px inalta) si textul mai mic (20px deasupra liniei de
     baza) — depasirea scade de la 11 la 7. */
  .g-salut-rand{ margin-top:-7px; }
}

/* ---------- vremea ---------- */
/* Localitatea si temperatura pe acelasi rand, sub randul cu numele si sigla,
   aliniate la dreapta ca sa cada sub sigla. Randul nu se rupe niciodata
   (white-space:nowrap): altfel „Vaslui" ramane singur deasupra si arata ca
   doua lucruri fara legatura. */
.g-vreme{
  /* Ridicata deasupra salutului, in marginea de sus a paginii — singurul loc
     liber. Pagina are 22px de padding sus; -16 lasa vremea sa inceapa la 6px
     de marginea de sus, adica intreaga deasupra literelor din „buna seara".
     Nu misca nimic: intr-un rand flex cu align-items:flex-start, marginea
     negativa micsoreaza cutia exterioara a elementului, deci inaltimea
     randului ramane data de ora zilei, care e mai inalta. Verificat — sigla,
     numele si cardul stau la acelasi pixel ca inainte. */
  margin:-16px 0 0; display:flex; align-items:center; justify-content:flex-end;
  gap:6px; line-height:1.25; white-space:nowrap;
}
.g-vreme-loc{ font-size:12.5px; color:var(--g-muted); }
.g-vreme-grade{ font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; }
.g-vreme svg{
  width:16px; height:16px; flex-shrink:0; stroke:var(--olive); fill:none;
  stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round;
}

/* ---------- cardul inchis: codul si usa ---------- */
/* Culorile de aici sunt scrise ca valori, nu ca jetoane, si e intentionat.
   Cardul e inchis la culoare in ambele teme — asta e decizia de design —
   iar --ivory / --charcoal se inverseaza in blocul de mai jos. Luat din
   jetoane, textul ar fi devenit aproape negru pe fond negru cand telefonul
   e pe tema intunecata. */
.g-hero{
  background:#22221f; color:#f5f1e8;
  border-radius:var(--g-radius); padding:20px 20px 18px;
}
/* Numarul camerei, scris ca sa se vada. Era 13,5px la 66% opacitate, adica
   lucrul cel mai stins de pe card — dar omul care tocmai a coborat din masina
   cauta exact numarul, ca sa stie la ce usa sa se duca.
   Felul casutei ramane eticheta mica de langa el: „Tiny house" nu ajuta pe
   nimeni sa gaseasca usa, numarul da. */
/* Eticheta codului si camera, pe acelasi rand: una la stanga, cealalta la
   dreapta, asezate pe aceeasi linie de baza — asa eticheta mica de 11px sta
   pe linia numarului de 30px, nu plutind la mijlocul lui. */
.g-hero-sus{
  display:flex; align-items:baseline; justify-content:space-between;
  flex-wrap:wrap; gap:2px 12px; margin-bottom:2px;
}
.g-hero-camera{
  margin:0; display:flex; align-items:baseline; flex-wrap:wrap;
  justify-content:flex-end; gap:3px 9px;
}
.g-hero-camera-fel{
  font-size:11px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:rgba(245,241,232,.55);
}
/* Sampanie si serif, nu ivoriu si monospatiat: codul de dedesubt e deja o
   insiruire mare de cifre, iar doua numere identice ca infatisare pe acelasi
   card ar cere o clipa de gandit care e care. */
.g-hero-camera-nr{
  font-family:var(--editorial); font-weight:400; font-size:30px;
  line-height:1; color:var(--champagne); font-variant-numeric:tabular-nums;
}
.g-eticheta{
  margin:0; font-size:11px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:rgba(245,241,232,.55);
}
/* Blocul de rezerva, sub separator. Codul a fost pana acum PRIMUL lucru
   sub eticheta, la 46px — atat de mare incat era, implicit, „ce ai de
   facut". Oaspetii tastau cifrele pe incuietoare fara sa mai ajunga cu
   ochii la buton, mai jos. Acum e sub el, dupa o linie, cu propria
   eticheta mica ce spune direct ca e varianta secundara. Ramane totusi
   citibil de la un metru: cand nu e semnal, butonul n-are cum sa ceara
   serverul, iar atunci codul de aici e singurul drum spre usa. */
.g-hero-rezerva{
  margin-top:16px; padding-top:14px;
  border-top:1px solid rgba(245,241,232,.14);
}
.g-hero-rezerva .g-eticheta{ margin-bottom:4px; }
/* Cifre monospatiate si distantate, ca 8 si 0 sa nu se confunde la lumina
   slaba a unei terase. Doar fonturi de sistem — un al treilea font, cerut
   pentru patru cifre, ar fi inca o descarcare inainte ca omul sa vada
   codul. 32px, nu cei 46px de dinainte: mai mic decat butonul de deasupra,
   dar tot de doua ori cat restul textului de pe card. */
.g-cod{
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-size:32px; font-weight:600; letter-spacing:.14em;
  margin:0 0 4px; line-height:1.15;
  user-select:all; -webkit-user-select:all;
}
/* Diezul e ce se apasa dupa cifre pe tastatura yalei. Ceva mai stins decat
   ele, fiindca nu e parte din secret — dar prezent, fiindca fara el usa nu
   se deschide, iar asta nu se tine minte in fata usii. */
.g-diez{ color:rgba(245,241,232,.5); margin-left:.06em; }
.g-valabil{ margin:0; font-size:13px; color:rgba(245,241,232,.62); }
.g-valabil b{ color:var(--g-pe-inchis); font-weight:600; }
/* Acelasi separator ca g-hero-rezerva, chiar daca elementul e altul: cardul
   trebuie sa arate la fel de asezat cu codul gata sau nepregatit, nu doar
   in cazul fericit. */
.g-cod-lipsa{
  margin:16px 0 0; padding-top:14px;
  border-top:1px solid rgba(245,241,232,.14);
  font-size:14px; color:rgba(245,241,232,.75);
}

/* PRIMUL lucru de sub eticheta, inaintea codului — vezi comentariul din
   App.jsx pentru motivul reasezarii. Cu nimic altceva deasupra care sa-i
   ia ochiul, marimea de aici conteaza mai mult decat inainte: font si
   padding usor peste vechile 16px/15px, ca sa poarte greutatea de „primul
   pas", nu doar de actiune oarecare intr-un card. */
.g-usa{
  margin-top:16px; width:100%; border:0; border-radius:12px;
  background:var(--champagne); color:var(--charcoal);
  font:inherit; font-size:17px; font-weight:600;
  padding:17px 18px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:10px;
  touch-action:manipulation;
}
.g-usa:disabled{ opacity:.5; cursor:default; }
/* Clipirea de la deschidere. Butonul e si blocat in acest interval, deci
   opacitatea coborata de mai sus l-ar fi stins tocmai cand trebuie sa se
   vada — de aceea starea „deschis" si-o ia inapoi. */
.g-usa[data-stare="deschis"]{ opacity:1; animation:g-clipire .5s steps(1) 5; }
@keyframes g-clipire{
  0%,49%  { background:#eadcc4; box-shadow:0 0 0 4px rgba(200,177,138,.35); }
  50%,100%{ background:var(--champagne); box-shadow:0 0 0 0 rgba(200,177,138,0); }
}
/* Cine a cerut mai putina miscare primeste acelasi semnal, dar stationar. */
@media (prefers-reduced-motion: reduce){
  .g-usa[data-stare="deschis"]{
    animation:none; background:#eadcc4; box-shadow:0 0 0 4px rgba(200,177,138,.35);
  }
}
.g-usa svg{ width:21px; height:21px; stroke:currentColor; fill:none;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.g-usa-stare{
  margin:10px 0 0; font-size:13.5px; text-align:center;
  color:rgba(245,241,232,.72); min-height:1.3em;
}
.g-usa-stare[data-fel="bine"]{ color:var(--champagne); font-weight:600; }
.g-usa-stare[data-fel="rau"]{ color:#eeb0a4; }

/* ---------- bannerul fisei de cazare ---------- */
/* Rand intreg, deasupra celor patru butoane — nu unul dintre ele. Fondul
   olive, imprumutat de la .g-fisa-trimit (butonul de „Semnez si trimit" din
   fereastra), il deosebeste deliberat de cele patru carduri neutre de mai
   jos: astea sunt scurtaturi spre informatie, bannerul e o sarcina ramasa de
   facut, si trebuie sa arate altfel, nu doar sa fie primul in ordine. */
.g-fisa-banner{
  display:flex; align-items:center; gap:12px; width:100%;
  margin-bottom:10px; background:var(--olive); color:var(--g-pe-inchis);
  border:0; border-radius:14px; padding:14px 16px; cursor:pointer;
  font:inherit; text-align:left; touch-action:manipulation;
}
.g-fisa-banner svg{
  flex-shrink:0; width:22px; height:22px;
  stroke:currentColor; fill:none;
  stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round;
}
/* Inelul care pulseaza in jurul iconitei — cerut dupa un test pe telefon:
   bannerul static nu sarea suficient in ochi. Continuu, nu de cateva ori si
   gata (ca la usa): un oaspete care ajunge, se uita in alta parte o clipa
   si revine tot il gaseste miscandu-se, nu inghetat de mult.
   Un singur element animat pe acest ecran (iconita), nu tot bannerul —
   o pulsatie pe fond, text si icon deodata ar fi fost mai multa miscare
   decat ajuta, nu mai putina. Champagne, nu olive sau alb: e acelasi accent
   cald folosit la clipirea usii (rgba(200,177,138,...) de mai sus), deci
   „asta cere atentie" arata la fel in toata pagina. */
.g-fisa-banner-icon{
  position:relative; display:flex; flex-shrink:0;
}
.g-fisa-banner-icon::after{
  content:""; position:absolute; inset:-6px;
  border-radius:50%; border:2px solid var(--champagne);
  animation:g-fisa-puls 2s ease-out infinite;
}
@keyframes g-fisa-puls{
  0%{ transform:scale(.7); opacity:.9; }
  70%,100%{ transform:scale(1.55); opacity:0; }
}
@media (prefers-reduced-motion: reduce){
  .g-fisa-banner-icon::after{ animation:none; opacity:0; }
}
.g-fisa-banner-text{ display:block; min-width:0; }
.g-fisa-banner-titlu{ display:block; font-size:15px; font-weight:600; }
/* Opacitate, nu un jeton nou: --g-pe-inchis e fix in ambele teme (vezi
   comentariul lui din sectiunea de jetoane), iar textul de aici trebuie doar
   sa fie mai stins decat titlul de deasupra lui, nu alta culoare. */
.g-fisa-banner-sub{
  display:block; margin-top:2px; font-size:12.5px; opacity:.82;
}

/* ---------- cele patru butoane ---------- */
/* Doua pe rand, nu patru: pe un telefon de 320px patru coloane lasa sub
   65px de eticheta, iar „Bun venit" s-ar rupe in doua randuri. */
.g-scurtaturi{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.g-scurtatura{
  background:var(--g-card); border:1px solid var(--g-line);
  border-radius:14px; padding:13px 14px; cursor:pointer;
  font:inherit; color:var(--g-text); text-align:left;
  display:flex; align-items:center; gap:10px;
  touch-action:manipulation;
}
.g-scurtatura[aria-expanded="true"]{
  background:var(--beige); border-color:rgba(63,74,61,.35);
}
.g-scurtatura svg{
  width:21px; height:21px; flex-shrink:0;
  stroke:var(--olive); fill:none;
  stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round;
}
.g-scurtatura span{ font-size:14px; font-weight:500; }

/* ---------- carduri ---------- */
.g-card{
  background:var(--g-card); border:1px solid var(--g-line);
  border-radius:var(--g-radius); padding:17px 18px;
}
.g-card h2{
  font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  color:var(--g-faint); margin:0 0 12px;
}
.g-rand{
  display:flex; justify-content:space-between; gap:12px;
  padding:7px 0; border-top:1px solid var(--g-hair);
}
.g-rand:first-child{ border-top:0; padding-top:0; }
.g-rand dt{ color:var(--g-muted); font-size:14px; margin:0; }
.g-rand dd{ margin:0; font-weight:600; font-size:14px; text-align:right; }
.g-lista{ margin:0; }

/* Totalul, aliniat la dreapta sub datele rezervarii — acolo unde se citesc
   si sumele din dreptul randurilor de mai sus. Cifre tabulare, ca sa nu
   danseze latimea intre doua rezervari. */
.g-total{
  margin:11px 0 0;
  display:flex; align-items:baseline; justify-content:flex-end; gap:10px;
}
.g-total span{ font-size:14px; color:var(--g-muted); }
.g-total b{ font-size:17px; font-weight:600; font-variant-numeric:tabular-nums; }

.g-produs{
  display:flex; justify-content:space-between; align-items:baseline; gap:12px;
  padding:9px 0; border-top:1px solid var(--g-hair);
}
.g-produs:first-child{ border-top:0; padding-top:0; }
.g-produs-desc{ display:block; font-size:13px; color:var(--g-muted); }
.g-produs-pret{ white-space:nowrap; font-variant-numeric:tabular-nums; font-weight:600; }

.g-intro{
  margin:0 0 12px; font-family:var(--editorial); font-size:19px;
  line-height:1.4;
}
.g-puncte{ margin:0; padding:0; list-style:none; }
/* Linia de sus desparte doua subiecte si apare NUMAI in „Bun venit": pana la
   ea e vorba despre rezervare si despre bani, dupa ea despre sejur. In
   „Important" aceeasi lista urmeaza direct dupa titlul cardului, unde o linie
   in plus n-ar despartii nimic. */
.g-puncte-sub-date{
  margin-top:16px; padding-top:13px;
  border-top:1px solid var(--g-line);
}
/* Combinator de copil, nu descendent: punctele au acum liste imbricate —
   pasii de Wi-Fi si de instalare — iar un „.g-puncte li" le-ar fi prins si
   pe acelea, cu linie despartitoare intre fiecare pas si cu marimea de
   aici in locul celei scrise pentru ele. */
.g-puncte > li{
  padding:9px 0; border-top:1px solid var(--g-hair); font-size:14px;
}
.g-puncte > li:first-child{ border-top:0; padding-top:0; }
.g-puncte > li > b{ font-weight:600; }
/* Legaturile din puncte — pana acum una singura, numarul asistentei. Fara
   regula, browserul le da albastrul lui implicit, singura culoare din pagina
   care nu vine din paleta. Culoarea textului plus sublinierea subtire e
   acelasi tratament ca la .g-legatura, deci se citesc drept legaturi. */
.g-puncte a{
  color:inherit; text-decoration:underline; text-underline-offset:3px;
  text-decoration-color:var(--g-line);
}
/* Butoanele mici de sub punctele din „Bun venit" — Wi-Fi si adaugarea pe
   ecranul principal. Contur, nu plin: sunt unelte, iar pline ar fi concurat
   cu butonul mare de deschidere a usii, care trebuie sa ramana singurul
   lucru evident din pagina. */
.g-actiune-loc{ margin-top:9px; }
.g-actiune{
  display:inline-flex; align-items:center; gap:8px;
  min-height:40px; padding:9px 14px;
  border:1px solid var(--g-line); border-radius:11px;
  background:var(--g-card); color:var(--g-text);
  font:inherit; font-size:14px; font-weight:600; cursor:pointer;
}
.g-actiune svg{
  width:17px; height:17px; flex-shrink:0; display:block;
  fill:none; stroke:currentColor; stroke-width:1.7;
  stroke-linecap:round; stroke-linejoin:round;
}
/* Punctul de sub undele de Wi-Fi: linie de lungime zero, deci se vede numai
   prin grosimea ei si prin capatul rotund. */
.g-actiune svg .g-punct{ stroke-width:2.6; }

/* Codul QR al retelei. Sta pe acelasi rand cu explicatia lui cat incape, si
   trece sub ea pe ecranele foarte inguste. */
.g-qr{
  margin-top:11px; padding:11px;
  display:flex; align-items:center; flex-wrap:wrap; gap:11px 13px;
  border:1px solid var(--g-line); border-radius:12px;
}
.g-qr img{
  width:128px; height:128px; flex-shrink:0; display:block;
  border-radius:6px;
}
.g-qr p{
  margin:0; flex:1 1 150px;
  font-size:13.5px; line-height:1.5; color:var(--g-muted);
}
.g-qr b{ color:var(--g-text); font-weight:600; }

/* Numite g-instructiuni, nu g-pasi: acela e deja al ferestrei de acces catre
   camere, definit mai jos in fisier. Aceeasi clasa pe doua componente
   diferite se calca in tacere — regula de mai jos, fiind ultima, castiga, si
   pasii de aici primeau alta marime si alte distante decat cele scrise. */
.g-instructiuni-titlu{
  margin:13px 0 0; font-size:11px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase; color:var(--g-faint);
}
.g-instructiuni{
  margin:10px 0 0; padding-left:19px;
  display:flex; flex-direction:column; gap:6px;
  font-size:13.5px; line-height:1.5; color:var(--g-muted);
}
.g-instructiuni b{ color:var(--g-text); font-weight:600; }
.g-instructiuni-nota{ margin:9px 0 0; font-size:12.5px; line-height:1.5; color:var(--g-faint); }

/* Randul regulamentului: eticheta ingrosata plus legatura, in tiparul
   punctelor de deasupra. Distanta de sus a urcat de pe buton pe rand — pe
   buton ar fi impins doar butonul, lasand eticheta lipita de lista. */
.g-legatura-rand{ margin:13px 0 0; font-size:14px; }
.g-legatura-rand b{ font-weight:600; }
/* Legatura care deschide regulamentul. Subliniata, ca sa se citeasca drept
   legatura, dar buton in HTML — deschide o fereastra, nu duce nicaieri. */
.g-legatura{
  margin:0; padding:0; border:0; background:none;
  font:inherit; color:var(--g-text);
  text-decoration:underline; text-underline-offset:3px;
  text-decoration-color:var(--g-line); cursor:pointer;
}

/* ---------- fisa de cazare ---------- */
/* Fereastra proprie (Fereastra.jsx), deschisa din bannerul de deasupra celor
   patru butoane — nu mai e un card in curgerea paginii care ascunde restul
   pana la semnare. Vezi antetul din Fisa.jsx si docs/fisa-cazare.md 8.
   Fara „.g-fisa h2”: titlul „Fișă de cazare" il da acum Fereastra insasi,
   in stilul ei editorial, nu unul propriu de mica eticheta cu majuscule. */
.g-fisa-intro{ margin:0 0 10px; font-size:13.5px; color:var(--g-muted); }
.g-fisa-ajutor{
  margin:0 0 16px; padding:10px 12px; border-radius:10px;
  background:var(--ivory); font-size:13px; line-height:1.5;
}
.g-fisa-ajutor a{
  color:inherit; text-decoration:underline; text-underline-offset:3px;
  text-decoration-color:var(--g-line);
}
.g-camp{ display:block; margin-bottom:11px; }
.g-camp-eticheta{ display:block; font-size:13px; margin-bottom:4px; }
.g-camp-eticheta em{ color:var(--g-faint); font-style:normal; }
/* 16px pe campuri NU e o alegere de stil: sub atat, iOS mareste pagina la
   focus si oaspetele ramane cu ea marita, incercand sa iasa cu doua degete
   dintr-un formular pe care abia l-a inceput. */
.g-camp input, .g-camp select{
  width:100%; font:inherit; font-size:16px;
  padding:9px 11px; border:1px solid var(--g-line); border-radius:9px;
  background:var(--g-camp); color:var(--g-text);
}
/* Data nasterii: zi, luna, an, in randul asta. Latimile sunt proportionale
   cu ce se scrie in ele — 2, 2 si 4 cifre — ca sa se vada dintr-o privire
   care caseta ce cere, chiar inainte de a citi ce scrie in ea.
   Centrarea e deliberata fiindca doua cifre intr-o caseta aliniata la stanga
   plutesc intr-o parte si arata a camp neterminat. */
.g-data{ display:flex; gap:8px; }
.g-data-caseta{ text-align:center; }
.g-camp .g-data-zi, .g-camp .g-data-luna{ width:23%; }
.g-camp .g-data-an{ width:34%; }
.g-camp-eroare{ display:block; margin-top:4px; font-size:12.5px; color:#a13b2f; }
.g-fisa-mesaj{ margin:10px 0 0; font-size:13.5px; color:#a13b2f; }
/* Butonul de trimitere are propria clasa, nu .g-usa: acela e butonul usii,
   pe cardul inchis la culoare, si ar fi mostenit culorile de acolo. */
.g-fisa-trimit{
  display:block; width:100%; margin-top:16px; padding:14px;
  border:0; border-radius:12px; background:var(--olive); color:var(--g-pe-inchis);
  font:inherit; font-size:16px; font-weight:600; cursor:pointer;
}
.g-fisa-trimit:disabled{ opacity:.55; cursor:default; }

/* touch-action:none pe AMBELE, si nu e podoaba. Fara el, browserul ia
   tragerea drept derulare a paginii: pagina fuge sus si jos sub deget, iar
   cand se hotaraste ca e derulare trimite pointercancel si linia se rupe.
   Pe svg singur nu ajunge — Safari ignora regula pe elemente SVG, deci arata
   scrisa si nu face nimic; pe un div obisnuit o respecta. Nici asa nu e
   destul pe toate telefoanele: Semnatura.jsx taie in plus touchstart si
   touchmove, cu ascultatori nepasivi. Vezi antetul de acolo. */
.g-semnatura{ margin:10px 0 0; touch-action:none; }
/* aspect-ratio TREBUIE sa fie exact raportul viewBox-ului din lib/semnatura.js
   (600x300). Panza se intinde pe toata latimea, iar punctele se traduc din
   dreptunghiul ei in coordonatele viewBox-ului printr-o regula de trei; la alt
   raport, linia ar aparea in alta parte decat degetul. De aceea nu are nici
   min-height: ar rupe raportul tocmai pe telefoanele mici. Legatura e prinsa
   de un test in guest-stiluri.test.js. */
.g-semnatura-panza{
  display:block; width:100%; height:auto; aspect-ratio:2/1;
  background:var(--g-camp); border:1px solid var(--g-line);
  border-radius:10px; touch-action:none; cursor:crosshair;
}
.g-semnatura-linie{
  fill:none; stroke:var(--g-text); stroke-width:3;
  stroke-linecap:round; stroke-linejoin:round;
}
.g-semnatura-jos{
  display:flex; justify-content:space-between; align-items:center;
  margin-top:6px; font-size:12.5px; color:var(--g-muted);
}

.g-nota{ margin:12px 0 0; font-size:13px; color:var(--g-muted); }
.g-gol{ margin:0; font-size:14px; color:var(--g-muted); }

/* ---------- contact asistenta ---------- */
/* Linia de sus il desparte de restul panoului: e alt fel de continut decat
   datele sejurului de deasupra — o actiune, nu o informatie. */
.g-asistenta{ margin-top:16px; padding-top:14px; border-top:1px solid var(--g-line); }
/* Aceeasi eticheta mica si distantata ca titlurile de card, ca sa se citeasca
   drept sectiune, nu drept titlu nou de pagina. */
.g-asistenta h3,
.g-eticheta-sectiune{
  margin:0 0 3px; font-size:11px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:var(--g-faint);
}
/* Titlul de deasupra datelor rezervarii are nevoie de aer sub el, spre
   deosebire de cel din blocul de asistenta, care sta lipit de randul lui. */
.g-eticheta-sectiune{ margin:0 0 8px; }
.g-asistenta-cine{ margin:0 0 11px; font-size:14px; color:var(--g-muted); }
.g-asistenta-cine b{ color:var(--g-text); font-weight:600; }

/* Doua butoane egale, pe un rand. La nevoie se rup unul sub altul, si atunci
   fiecare ramane cat randul — un buton de contact ingust, la jumatate de
   ecran, e greu de nimerit cu degetul mare. */
.g-asistenta-butoane{ display:flex; flex-wrap:wrap; gap:9px; }
.g-contact{
  flex:1 1 130px; display:inline-flex; align-items:center; justify-content:center;
  gap:8px; min-height:46px; padding:11px 14px; border-radius:12px;
  background:var(--olive); color:var(--g-pe-inchis);
  font:inherit; font-size:15px; font-weight:600; text-decoration:none;
}
/* Sigla WhatsApp isi pastreaza culorile ei — e singurul strop de verde din
   pagina si tocmai de aceea se recunoaste dintr-o privire. Butonul insa
   ramane maslin, ca celalalt: doua butoane de culori diferite ar fi aratat
   ca unul e cel bun si celalalt o rezerva. */
.g-contact img{ width:18px; height:18px; display:block; flex-shrink:0; }
.g-contact svg{
  width:18px; height:18px; flex-shrink:0; display:block;
  fill:currentColor; stroke:none;
}

/* ---------- cum ajungi ---------- */
/* Text cu link, nu butoane. Randul avea nevoie de container queries si de
   marimi micsorate cat timp „Acces catre camere" statea si el aici, al
   treilea dupa Maps si Waze — mutat acum intr-un buton propriu deasupra
   hartii (mai jos). Ramase doar cele doua harti, incap pe un rand la
   marimea normala, pe orice telefon din masuratorile facute pana acum. */
.g-legaturi{
  margin:0; display:flex; flex-wrap:wrap; align-items:center;
  gap:6px; line-height:1.5; font-size:14px;
}
.g-leg{
  display:inline-flex; align-items:center; gap:.38em;
  font:inherit; font-size:inherit; font-weight:600;
  white-space:nowrap;
  color:var(--olive); background:none; border:0; padding:0;
  cursor:pointer; text-decoration:underline; text-underline-offset:3px;
  touch-action:manipulation;
}
.g-leg svg{
  width:1.2em; height:1.2em; flex-shrink:0; stroke:var(--olive); fill:none;
  stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round;
}
/* Marcile Google Maps si Waze: nerecolorate si neatinse de filtre, nici in
   tema intunecata. Amandoua companiile cer explicit sa nu li se modifice
   sigla, iar una recolorata nici nu s-ar mai recunoaste dintr-o privire —
   ceea ce e tot rostul ei aici. */
/* Colturile taiate, nu culorile schimbate: sigla Waze vine ca patrat opac,
   cu alb in colturi (masurat: cyanul incepe la 8px dintr-o latura de 48,
   adica 17%). Netaiate, colturile alea se vad ca patru pete albe pe cardul
   inchis din tema de noapte. Un procent, nu pixeli, ca sa ramana corect
   daca marimea se schimba. */
.g-leg img{ width:1.2em; height:1.2em; flex-shrink:0; display:block; border-radius:20%; }
.g-pereche{ display:inline-flex; align-items:center; gap:.7em; }

/* ---------- accesul catre camere, deasupra hartii ---------- */
/* Mutat dintr-un link de 12px, la coada randului cu Maps si Waze —
   proprietarul a semnalat ca traseul numerotat prin curte conteaza la fel
   de mult ca usa insasi pentru cine ajunge prima data. Contur, nu fond
   plin: cu olive plin ar fi concurat cu bannerul fisei de cazare pentru
   atentie, iar cu sampanie plin ar fi parut o a doua usa. Icon si contur pe
   „currentColor", nu pe olive direct, ca schimbarea in sampanie pentru
   tema de noapte (mai jos) sa se faca intr-un singur loc. */
.g-acces-buton{
  display:flex; align-items:center; gap:10px; width:100%;
  margin-bottom:12px; background:none; color:var(--olive);
  border:1.5px solid currentColor; border-radius:14px; padding:13px 14px;
  cursor:pointer; font:inherit; font-size:14px; font-weight:600;
  text-align:left; touch-action:manipulation;
}
.g-acces-buton svg{
  width:21px; height:21px; flex-shrink:0;
  stroke:currentColor; fill:none;
  stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round;
}

/* ---------- harta din cardul „cum ajungi la noi" ---------- */
/* Inaltimea e legata de ecran, nu fixa. Cerinta e ca TOT cardul sa incapa pe
   primul ecran al unui telefon, iar cat ramane pentru harta e exact ce nu
   ocupa deja restul paginii — care difera de la un telefon la altul.
   Unitatea e svh (small viewport height): inaltimea vizibila cu barele
   browserului AFISATE, adica cel mai putin spatiu pe care il are pagina.
   Cu vh, harta s-ar calcula pentru ecranul fara bare si ar impinge cardul sub
   pliu exact pe telefonul unde conteaza. Marginile clamp-ului o tin utila pe
   ecrane inalte si o strang, fara sa dispara, pe cele mici.
   Fundalul e pus ca sa nu clipeasca alb inainte sa vina imaginea de la
   Google — cardul e crem, un dreptunghi alb ar sari in ochi. */
.g-harta-cadru{
  margin-top:11px; height:clamp(104px, 19svh, 190px);
  border-radius:11px; overflow:hidden;
  border:1px solid var(--g-line); background:var(--beige);
}
.g-harta-rama{ display:block; width:100%; height:100%; border:0; }

/* ---------- fereastra suprapusa ---------- */
.g-fundal{
  position:fixed; inset:0; z-index:50;
  background:rgba(20,20,16,.55);
  display:flex; align-items:flex-end; justify-content:center;
  padding:16px;
  /* Pe telefon urca de jos, unde ajunge degetul; pe ecrane mari se
     centreaza (vezi mai jos). */
}
.g-fereastra{
  background:var(--g-card); border-radius:18px;
  width:100%; max-width:460px; max-height:88vh;
  display:flex; flex-direction:column; overflow:hidden;
  box-shadow:0 18px 50px rgba(0,0,0,.3);
}
.g-fereastra-cap{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:15px 16px 13px; border-bottom:1px solid var(--g-hair);
}
.g-fereastra-cap h2{
  margin:0; font-family:var(--editorial); font-weight:400; font-size:20px;
  letter-spacing:0; text-transform:none; color:var(--g-text);
}
.g-inchide{
  border:0; background:transparent; color:var(--g-muted);
  font-size:26px; line-height:1; cursor:pointer;
  width:38px; height:38px; border-radius:9px; flex-shrink:0;
  touch-action:manipulation;
}
.g-fereastra-corp{
  padding:16px; overflow-y:auto; -webkit-overflow-scrolling:touch;
}
/* Pozele traseului prin curte. Sunt portret, facute cu telefonul din locul
   in care sta omul — deci se limiteaza inaltimea, altfel una singura ar umple
   ecranul si nu s-ar vedea ca urmeaza altele. Taierea taie de sus
   si de jos, unde e cer si asfalt, si pastreaza mijlocul, unde e reperul. */
/* position:relative face din figure ancora pentru figcaption-ul
   suprapus — fara ea, position:absolute de mai jos s-ar pozitiona fata de
   cea mai apropiata ruda pozitionata, care e fereastra intreaga, nu poza. */
.g-acces-foto{ position:relative; margin:0 0 18px; }
.g-acces-foto img{
  display:block; width:100%; height:auto; max-height:64vh;
  object-fit:cover; border-radius:12px;
}
/* Indrumarea, SUPRAPUSA peste poza, sus. Fade-ul e ALB SI FIX (nu jeton, nu
   --ivory): pe o fotografie reala, un fundal care s-ar inversa in tema de
   noapte ar arata ca o pata gri peste cer, iar poza n-are alta versiune
   pentru noapte. pointer-events:none lasa zona de sus a pozei atingibila
   sub fade — pe telefon, degetul care deruleaza fereastra nu trebuie sa
   evite figcaption-ul. */
.g-acces-foto figcaption{
  position:absolute; inset:0 0 auto 0; z-index:1; pointer-events:none;
  display:flex; align-items:flex-start; gap:9px;
  padding:14px 14px 30px;
  background:linear-gradient(to bottom, rgba(255,255,255,.96) 0%,
    rgba(255,255,255,.85) 55%, rgba(255,255,255,0) 100%);
  border-radius:12px 12px 0 0;
  font-size:14.5px; line-height:1.4; font-weight:500;
  /* Fix, nu var(--g-text): textul sta pe alb in AMBELE teme, deci nu are
     voie sa devina aproape-alb cand jetonul se inverseaza noaptea — exact
     greseala reparata pe 10 septembrie 2026, acum pentru un fundal fix in
     loc de unul care se inversa cu el. */
  color:var(--charcoal);
}
/* Cifra insasi nu poarta niciun sens pentru cititorul de ecran — pasul se
   intelege din text, ordinea din DOM. De aceea e aria-hidden in JSX si de
   aceea aici e doar decor. Fundal FIX, din acelasi motiv ca mai sus: sta pe
   fade alb in ambele teme. */
.g-acces-numar{
  flex-shrink:0; display:flex; align-items:center; justify-content:center;
  width:22px; height:22px; margin-top:1px; border-radius:50%;
  background:var(--charcoal); color:#fff;
  font-size:12.5px; font-weight:700; font-variant-numeric:tabular-nums;
}
.g-pasi{ margin:0; padding-left:20px; }
.g-pasi li{ padding:5px 0; font-size:14px; }

/* Regulamentul. Antetul tine sigla in locul titlului scris, ca sa arate a
   document al casei, nu a mesaj de aplicatie. Sigla e SVG cu culoare proprie
   — nu se coloreaza de aici. */
.g-reg-antet{ min-width:0; }
.g-reg-antet img{ display:block; width:104px; height:auto; }
.g-reg-antet p{
  margin:5px 0 0; font-size:11px; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--g-faint);
}

.g-reg-intro{
  margin:0 0 14px; padding-bottom:13px;
  border-bottom:1px solid var(--g-hair);
  font-size:14px; line-height:1.55; color:var(--g-text); font-weight:600;
}
/* Liniuta in loc de bulina, ca in textul primit, si indentare agatata: al
   doilea rand al unei reguli lungi se aliniaza sub primul, nu sub liniuta.
   Aliniat la stanga, nu justify: pe o coloana de telefon, justify rupe
   randurile cu spatii cat un cuvant si textul ajunge sa arate a document
   prost cules — exact pe dos fata de ce trebuie sa transmita. */
.g-reg{ margin:0; padding:0; list-style:none; }
.g-reg li{
  position:relative; padding:0 0 11px 15px;
  font-size:13.5px; line-height:1.6; color:var(--g-muted);
}
.g-reg li::before{
  content:"–"; position:absolute; left:0; top:0; color:var(--g-faint);
}
.g-reg li:last-child{ padding-bottom:0; }

@media (min-height: 620px) and (min-width: 420px){
  .g-fundal{ align-items:center; }
}

/* ---------- atractii ---------- */
.g-atractii{ list-style:none; margin:0; padding:0; }
.g-atractie{ padding:16px 0 0; border-top:1px solid var(--g-hair); }
.g-atractie:first-child{ border-top:0; padding-top:0; }
.g-atractie h3{ margin:0; font-size:16px; font-weight:600; line-height:1.3; }
.g-atractie-drum{
  margin:3px 0 0; font-size:12.5px; color:var(--g-muted);
  font-variant-numeric:tabular-nums;
}
.g-atractie-text{ margin:8px 0 0; font-size:14px; }

.g-atractie-foto{ margin:0 0 11px; }
.g-atractie-foto img{
  display:block; width:100%; height:auto; border-radius:12px;
  /* Raportul e scris in atribute (720x450), deci browserul rezerva locul
     inainte sa vina imaginea si textul de dedesubt nu mai sare. */
  background:var(--beige);
}
.g-atractie-foto figcaption{
  margin:5px 2px 0; font-size:11px; color:var(--g-faint);
}
.g-atractie-foto figcaption a{ color:inherit; }

.g-harta{
  display:inline-flex; align-items:center; gap:6px; margin-top:10px;
  font-size:13.5px; font-weight:600; color:var(--olive); text-decoration:none;
}
.g-harta svg{
  width:15px; height:15px; stroke:currentColor; fill:none;
  stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round;
}

.g-paginatie{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-top:18px; padding-top:14px; border-top:1px solid var(--g-hair);
}
.g-paginatie span{
  font-size:12.5px; color:var(--g-muted); font-variant-numeric:tabular-nums;
}
.g-paginatie button{
  font:inherit; font-size:13.5px; font-weight:600;
  background:var(--beige); color:var(--g-text);
  border:1px solid var(--g-line); border-radius:10px;
  padding:9px 13px; cursor:pointer; touch-action:manipulation;
}
.g-paginatie button:disabled{ opacity:.4; cursor:default; }

/* ---------- ecranele de refuz ---------- */
.g-mesaj{ text-align:center; padding:28px 20px; }
.g-mesaj h1{
  font-family:var(--editorial); font-weight:400; font-size:26px; margin:0 0 8px;
}
.g-mesaj p{ margin:0 0 18px; color:var(--g-muted); }
/* Culoarea literei vine din jetonul care NU se inverseaza, desi blocul de
   noapte suprascrie oricum si fundalul, si litera, mai jos. Asa regula se
   citeste corect singura: pana acum parea stricata si scapa doar fiindca o
   repara ceva aflat la trei sute de randuri distanta. */
.g-buton{
  display:inline-block; background:var(--olive); color:var(--g-pe-inchis);
  text-decoration:none; padding:12px 22px; border-radius:12px;
  font-weight:600; font-size:15px;
}
.g-subsol{ text-align:center; font-size:13px; color:var(--g-faint); margin:2px 0 0; }
.g-subsol a{ color:var(--g-muted); }

@media (prefers-color-scheme: dark){
  :root{
    --ivory:#15170f; --beige:#2a2e22; --g-card:#1d2018;
    /* Caseta e mai inchisa decat cardul pe care sta, ca sa se citeasca drept
       adancitura, nu drept petec. Cu --g-text deasupra da un contrast de
       peste 15:1 — pana acum era 1.21, adica nimic. */
    --g-camp:#14170f;
    --g-text:#ece9e2;
    --g-muted:rgba(236,233,226,.66); --g-faint:rgba(236,233,226,.42);
    --g-line:rgba(236,233,226,.14); --g-hair:rgba(236,233,226,.09);
  }
  /* Cardul principal ramane inchis pe fond inchis — se desparte prin
     conturul de accent, nu prin contrast de luminozitate. */
  .g-hero{ background:#0e100a; border:1px solid rgba(200,177,138,.22); }
  .g-scurtatura svg,
  .g-vreme svg,
  .g-leg svg{ stroke:var(--champagne); }
  .g-leg,
  .g-harta,
  .g-acces-buton{ color:var(--champagne); }
  .g-buton{ background:var(--champagne); color:#15170f; }
  .g-fundal{ background:rgba(0,0,0,.68); }
}
`;
