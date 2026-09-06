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
.g-salut{ display:flex; align-items:center; gap:10px; }
.g-salut-text{ min-width:0; flex:1; }
.g-salut-ora{ margin:0; font-size:15px; color:var(--g-muted); }
.g-salut-nume{
  margin:1px 0 0; font-family:var(--editorial); font-weight:400;
  font-size:25px; line-height:1.15;
  /* Numele unui grup poate fi lung. Se rupe pe doua randuri si abia apoi
     se taie — pe langa vreme si emblema a mai ramas putina latime, iar un
     nume taiat la jumatate de cuvant e mai rau decat unul pe doua randuri. */
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; overflow-wrap:anywhere;
}
.g-mana{ font-family:var(--ui); font-size:19px; }

/* Emblema: imaginea are deja inelul ei auriu, deci umple tot cercul, fara
   chenar sau fundal in plus care ar dubla conturul. */
.g-emblema{
  width:52px; height:52px; border-radius:50%; flex-shrink:0;
  display:block; overflow:hidden; background:#fff;
}
.g-emblema img{ width:100%; height:100%; object-fit:cover; display:block; }

/* ---------- vremea ---------- */
.g-vreme{ flex-shrink:0; text-align:right; line-height:1.25; }
.g-vreme-loc{
  margin:0; font-size:10.5px; letter-spacing:.04em; text-transform:uppercase;
  color:var(--g-faint); white-space:nowrap;
}
.g-vreme-grade{
  margin:2px 0 0; display:flex; align-items:center; justify-content:flex-end; gap:4px;
  font-size:16px; font-weight:600; font-variant-numeric:tabular-nums;
}
.g-vreme-grade svg{
  width:17px; height:17px; stroke:var(--olive); fill:none;
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
.g-hero-camera{
  margin:0 0 14px; font-size:13.5px; color:rgba(245,241,232,.66);
}
.g-eticheta{
  margin:0; font-size:11px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:rgba(245,241,232,.55);
}
/* Codul: singurul lucru de pe pagina care se citeste de la un metru, cu o
   mana pe clanta. Cifre monospatiate si distantate, ca 8 si 0 sa nu se
   confunde la lumina slaba a unei terase. Doar fonturi de sistem — un al
   treilea font, cerut pentru patru cifre, ar fi inca o descarcare inainte
   ca omul sa vada codul. */
.g-cod{
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-size:46px; font-weight:600; letter-spacing:.16em;
  margin:6px 0 5px; line-height:1.1;
  user-select:all; -webkit-user-select:all;
}
/* Diezul e ce se apasa dupa cifre pe tastatura yalei. Ceva mai stins decat
   ele, fiindca nu e parte din secret — dar prezent, fiindca fara el usa nu
   se deschide, iar asta nu se tine minte in fata usii. */
.g-diez{ color:rgba(245,241,232,.5); margin-left:.06em; }
.g-valabil{ margin:0; font-size:13px; color:rgba(245,241,232,.62); }
.g-valabil b{ color:var(--ivory); font-weight:600; }
.g-cod-lipsa{ margin:8px 0 0; font-size:14px; color:rgba(245,241,232,.75); }

.g-usa{
  margin-top:18px; width:100%; border:0; border-radius:12px;
  background:var(--champagne); color:var(--charcoal);
  font:inherit; font-size:16px; font-weight:600;
  padding:15px 18px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:9px;
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
.g-usa svg{ width:19px; height:19px; stroke:currentColor; fill:none;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.g-usa-stare{
  margin:10px 0 0; font-size:13.5px; text-align:center;
  color:rgba(245,241,232,.72); min-height:1.3em;
}
.g-usa-stare[data-fel="bine"]{ color:var(--champagne); font-weight:600; }
.g-usa-stare[data-fel="rau"]{ color:#eeb0a4; }

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
.g-puncte li{
  padding:9px 0; border-top:1px solid var(--g-hair); font-size:14px;
}
.g-puncte li:first-child{ border-top:0; padding-top:0; }
.g-puncte b{ font-weight:600; }
.g-nota{ margin:12px 0 0; font-size:13px; color:var(--g-muted); }
.g-gol{ margin:0; font-size:14px; color:var(--g-muted); }

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
.g-buton{
  display:inline-block; background:var(--olive); color:var(--ivory);
  text-decoration:none; padding:12px 22px; border-radius:12px;
  font-weight:600; font-size:15px;
}
.g-subsol{ text-align:center; font-size:13px; color:var(--g-faint); margin:2px 0 0; }
.g-subsol a{ color:var(--g-muted); }

@media (prefers-color-scheme: dark){
  :root{
    --ivory:#15170f; --beige:#2a2e22; --g-card:#1d2018;
    --g-text:#ece9e2;
    --g-muted:rgba(236,233,226,.66); --g-faint:rgba(236,233,226,.42);
    --g-line:rgba(236,233,226,.14); --g-hair:rgba(236,233,226,.09);
  }
  /* Cardul principal ramane inchis pe fond inchis — se desparte prin
     conturul de accent, nu prin contrast de luminozitate. */
  .g-hero{ background:#0e100a; border:1px solid rgba(200,177,138,.22); }
  .g-scurtatura svg,
  .g-vreme-grade svg{ stroke:var(--champagne); }
  .g-harta{ color:var(--champagne); }
  .g-buton{ background:var(--champagne); color:#15170f; }
}
`;
