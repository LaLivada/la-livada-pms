/* Stiluri pentru motorul de rezervări.
 *
 * Principiul: neutru și adaptabil. Fonturile se moștenesc de la pagina
 * gazdă (`font: inherit` peste tot), culorile sunt sobre, iar tot ce e
 * decorativ lipsește. Rezultatul se integrează într-o temă WordPress
 * fără să pară corp străin, dar arată curat și de sine stătător pe
 * subdomeniu.
 *
 * Totul e prefixat cu .ldv- ca să nu existe coliziune cu stilurile temei
 * atunci când componenta e încorporată.
 */
/* ATENȚIE: tot ce urmează e un template literal. Fără backticks în
   comentariile CSS de mai jos — închid șirul și build-ul cade cu un mesaj
   despre punct și virgulă lipsă, care nu trimite deloc la cauza reală.
   S-a întâmplat de trei ori; scrie numele proprietăților fără ele. */
export const STILURI = `
.ldv{
  /* Aceleași jetoane ca lalivada.ro (vezi booking/brand.css) — cerute aici
     din nou, cu valori de rezervă, ca formularul să rămână arătos și
     folosit ca simplă componentă, fără brand.css alături. */
  --ldv-ink:var(--charcoal, #22221f);
  --ldv-muted:rgba(34,34,31,.68);
  --ldv-faint:rgba(34,34,31,.45);
  --ldv-line:rgba(63,74,61,.2);
  --ldv-line-soft:rgba(63,74,61,.12);
  --ldv-surface:#ffffff;
  --ldv-surface-2:var(--beige, #e7dfd1);
  --ldv-accent:var(--olive, #3f4a3d);
  --ldv-accent-ink:var(--ivory, #f5f1e8);
  --ldv-accent-soft:rgba(63,74,61,.1);
  --ldv-danger:#a33a2f;
  --ldv-danger-soft:#fbeae7;
  --ldv-radius:6px;
  --ldv-gap:16px;

  color:var(--ldv-ink);
  font: inherit;
  line-height:1.55;
  max-width:760px;
  margin:0 auto;
  box-sizing:border-box;
  /* La schimbarea pasului (vezi App.jsx), cardul e adus la vedere cu
     scrollIntoView — fără marja asta ar ateriza chiar sub bara fixă. */
  scroll-margin-top:calc(var(--hdr-h, 4.25rem) + 1rem);
}
.ldv *,.ldv *::before,.ldv *::after{ box-sizing:border-box; }

.ldv-card{
  background:var(--ldv-surface);
  border:1px solid var(--ldv-line);
  border-radius:var(--ldv-radius);
  padding:20px;
  /* Aceeasi marja ca la .ldv: cardul pasului e adus la vedere cu
     scrollIntoView, iar fara ea ar ateriza chiar sub bara fixa. */
  scroll-margin-top:calc(var(--hdr-h, 4.25rem) + 1rem);
}
.ldv-card + .ldv-card{ margin-top:14px; }

/* Titlu editorial, ca pe site — nu un sub-cap bold din temele obișnuite. */
.ldv h2{
  font-family:var(--role-editorial, Georgia, serif); font-size:1.7em;
  margin:0 0 8px; font-weight:400; letter-spacing:-.014em; line-height:1.1;
}
.ldv h3{
  font-family:var(--role-editorial, Georgia, serif); font-size:1.2em;
  margin:0 0 3px; font-weight:400; letter-spacing:-.01em;
}
.ldv p{ margin:0 0 10px; }
.ldv-sub{ color:var(--ldv-muted); font-size:.92em; margin:0 0 16px; }
.ldv-mic{ color:var(--ldv-faint); font-size:.86em; }

/* ---------- formular ---------- */
.ldv-randuri{ display:grid; gap:12px; }
.ldv-rand-2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.ldv-rand-3{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }

.ldv-camp{ display:flex; flex-direction:column; gap:5px; min-width:0; }
.ldv-camp > span{ font-size:.85em; color:var(--ldv-muted); font-weight:600; }
.ldv-camp input,.ldv-camp select,.ldv-camp textarea{
  font:inherit; font-size:1em; color:var(--ldv-ink);
  background:var(--ldv-surface);
  border:1px solid var(--ldv-line); border-radius:8px;
  padding:11px 12px; width:100%;
  /* Fără astea, un control cu lățime intrinsecă mare (câmpul de dată pe
     iOS) refuză să se strângă în coloana lui și iese din grilă. Nu e
     suficient singur — vezi media query-ul de la final — dar previne
     cazul în care textul dinăuntru crește neașteptat. */
  min-width:0; max-width:100%;
  /* 16px minim pe iOS, altfel Safari face zoom la focus */
  min-height:44px;
  transition:border-color .15s, box-shadow .15s;
}
/* Câmpul de dată pe iOS.
 *
 * Safari îl randează cu stilizarea nativă, care îi impune o lățime
 * proprie si ignora width:100% — caseta iese din card, in timp ce
 * selectoarele de langa ea se opresc corect. Se vede si dupa faptul ca
 * valoarea apare centrata: asta e afisarea nativa, nu a noastra.
 * Doar appearance:none il face sa se comporte ca un camp obisnuit.
 *
 * display:block conteaza si el: ca inline-block, controlul isi pastreaza
 * dimensionarea intrinseca chiar si dupa appearance:none.
 *
 * text-align:left readuce data la stanga, aliniata cu restul campurilor
 * — pe iOS era centrata, singurul camp din formular care arata asa. */
.ldv-camp input[type="date"]{
  -webkit-appearance:none; appearance:none;
  display:block; text-align:left;
}

/* Telefonul: prefixul si numarul, unul langa altul.
   Prefixul primeste o latime fixa, nu o fractiune din grila: numele unei
   tari poate fi lung, iar o coloana elastica s-ar intinde dupa el si ar
   lasa numarul fara loc pentru noua cifre. Coloana numarului e
   minmax(0,1fr), ca sa se stranga in loc sa iasa din card. */
.ldv-tel{ display:grid; grid-template-columns:118px minmax(0,1fr); gap:8px; }
.ldv-tel-3{ grid-template-columns:118px 78px minmax(0,1fr); }
.ldv-tel-numar{ font-variant-numeric:tabular-nums; }

/* ---------- calendarul de perioada ---------- */
.ldv-cal{ border:1px solid var(--ldv-line); border-radius:12px; padding:10px 10px 4px; }
.ldv-cal-bara{ display:flex; align-items:center; gap:8px; }
.ldv-cal-titluri{ flex:1; display:grid; grid-template-columns:1fr; text-align:center; }
.ldv-cal-titlu{ font-weight:600; font-size:.95em; text-transform:capitalize; }
/* A doua luna si al doilea titlu apar doar cand e loc pentru ele. */
.ldv-cal-titlu:nth-child(2), .ldv-cal-luna:nth-child(2){ display:none; }
.ldv-cal-nav{
  flex:0 0 auto; width:38px; height:38px; border-radius:9px;
  border:1px solid var(--ldv-line); background:var(--ldv-surface);
  color:var(--ldv-ink); font:inherit; font-size:20px; line-height:1;
  cursor:pointer;
}
.ldv-cal-nav:disabled{ opacity:.35; cursor:not-allowed; }
.ldv-cal-nav:hover:not(:disabled){ border-color:var(--ldv-accent); }

.ldv-cal-luni{ display:grid; grid-template-columns:1fr; gap:18px; margin-top:8px; }
.ldv-cal-luna{ width:100%; border-collapse:collapse; table-layout:fixed; }
.ldv-cal-luna th{
  font-size:11px; font-weight:600; color:var(--ldv-muted);
  text-transform:uppercase; padding-bottom:4px;
}
.ldv-cal-luna td{ padding:1px; }

/* Inaltime fixa si centrare prin line-height, NU aspect-ratio cu flex.
   Combinatia aceea, intr-o celula de tabel, lasa WebKit-ul de pe telefon sa
   amane redesenarea: apasai ziua plecarii, starea se schimba, dar culoarea
   aparea abia dupa un scroll, cand compozitorul primea oricum un cadru.
   Tot de aceea nu mai exista tranzitie pe fundal: o animatie de 120ms care
   nu primeste niciun cadru arata exact ca o apasare pierduta. */
.ldv-zi{
  width:100%; height:38px; padding:0;
  display:block; text-align:center; line-height:38px;
  border:0; border-radius:9px; background:transparent;
  font:inherit; font-size:.95em; color:var(--ldv-ink);
  cursor:pointer;
  /* Fara asta, o apasare repetata pe aceeasi zi selecteaza textul cifrei
     in loc sa reia alegerea. */
  -webkit-user-select:none; user-select:none;
  /* Taie intarzierea de 300ms de pe unele browsere mobile. */
  touch-action:manipulation;
}
/* Hover doar unde exista cu adevarat un cursor, si niciodata peste capetele
   alese. Doua motive, amandoua vazute:

   Pe iPhone, Safari lasa ultimul element atins in :hover pana la urmatoarea
   atingere sau pana la un scroll. Ziua plecarii e mereu ultima atinsa, deci
   ramanea agatata in hover: fundal palid in loc de verde, cu cifra alba pe
   el — de aici si „apare apasat abia dupa ce dau scroll".

   Iar regula veche .ldv-zi:hover:not(:disabled) are specificitatea (0,3,0),
   fiindca argumentul lui :not() se numara. Batea (0,2,0) al capetelor, care
   exista tocmai ca s-o anuleze. Excluderea capetelor direct in selector nu
   mai lasa loc de asemenea intrecere. */
@media (hover:hover) and (pointer:fine){
  .ldv-zi:hover:not(:disabled):not(.ldv-zi-sosire):not(.ldv-zi-plecare){
    background:var(--ldv-accent-soft);
  }
}
.ldv-zi:disabled{ color:var(--ldv-muted); opacity:.4; cursor:not-allowed; }
.ldv-zi:focus-visible{ outline:2px solid var(--ldv-accent); outline-offset:1px; }
/* Zilele dintre capete: fundal continuu, colturi drepte, ca sa arate a
   interval, nu a sir de patratele. Capetele isi pastreaza rotunjirea. */
.ldv-zi-intre{ background:var(--ldv-accent-soft); border-radius:0; }
.ldv-zi-sosire, .ldv-zi-plecare{
  background:var(--ldv-accent); color:#fff; font-weight:600;
}
.ldv-cal-indiciu{ margin:6px 2px 4px; text-align:center; }

/* Doar pentru cititoarele de ecran: numele lunii ca legenda a tabelului.
   Vizual el e deja in bara de sus, deci ar fi aparut de doua ori. */
.ldv-doar-citit{
  position:absolute; width:1px; height:1px; overflow:hidden;
  clip-path:inset(50%); white-space:nowrap;
}

@media (min-width:620px){
  .ldv-cal-titluri{ grid-template-columns:1fr 1fr; }
  .ldv-cal-luni{ grid-template-columns:1fr 1fr; gap:22px; }
  .ldv-cal-titlu:nth-child(2), .ldv-cal-luna:nth-child(2){ display:revert; }
  .ldv-cal-luna:nth-child(2){ display:table; }
}

/* Galeria tipului ales, la pasul de alegere a camerei.
   Acelasi idiom ca galeria din subsolul paginii: fasie orizontala cu
   scroll-snap, nu grila. O grila ar fi impins butonul de continuare sub
   ecran tocmai cand omul a ales si vrea sa mearga mai departe. */
.ldv-foto{ margin-top:14px; }
.ldv-foto-sir{
  margin:0; padding:0; list-style:none;
  display:flex; gap:10px;
  overflow-x:auto; overscroll-behavior-x:contain;
  scroll-snap-type:x mandatory;
  scrollbar-width:thin;
  scrollbar-color:rgba(63,74,61,.35) transparent;
  /* Fara asta, ultima poza s-ar lipi de muchie in loc sa se opreasca la
     aceeasi distanta ca prima. */
  scroll-padding-inline:0;
}
.ldv-foto-sir::-webkit-scrollbar{ height:6px; }
.ldv-foto-sir::-webkit-scrollbar-thumb{
  border-radius:99px; background:rgba(63,74,61,.32);
}
.ldv-foto-sir > li{
  flex:0 0 auto; scroll-snap-align:start;
  width:clamp(11rem, 62vw, 17rem);
}
.ldv-foto-sir img{
  display:block; width:100%; height:auto;
  aspect-ratio:3/2; object-fit:cover;
  border-radius:8px; background:var(--ldv-line);
}

/* Nota despre campurile obligatorii: sta intre grupul de campuri si
   cerintele speciale, deci are nevoie de aer deasupra, nu si dedesubt —
   randurile formularului isi aduc propriul spatiu prin gap. */
.ldv-obligatorii{ margin:2px 0 0; }

/* Widgetul Turnstile isi aduce propriile dimensiuni intr-un iframe; noi
   ii dam doar loc si il centram pe latimea cardului. */
.ldv-turnstile{ margin-top:14px; display:flex; justify-content:center; min-height:0; }

.ldv-camp textarea{ min-height:76px; resize:vertical; }
.ldv-camp input:focus,.ldv-camp select:focus,.ldv-camp textarea:focus{
  outline:none; border-color:var(--ldv-accent);
  box-shadow:0 0 0 3px var(--ldv-accent-soft);
}
.ldv-camp input[aria-invalid="true"]{ border-color:var(--ldv-danger); }

/* ---------- butoane ----------
   Colț drept, majuscule spațiate, umplere care se desface de la stânga —
   același buton ca pe lalivada.ro (.btn din globals.css), nu pilula
   rotunjită obișnuită a formularelor. */
.ldv-btn{
  position:relative; font:inherit; font-size:.78em; font-weight:500;
  letter-spacing:.14em; text-transform:uppercase;
  border-radius:3px; padding:0 1.5rem; min-height:3.1rem;
  border:1px solid transparent; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  overflow:hidden; isolation:isolate;
  transition:color .2s, border-color .2s;
}
.ldv-btn::before{
  content:""; position:absolute; inset:0; z-index:-1;
  transform:scaleX(0); transform-origin:left;
  transition:transform .4s cubic-bezier(.16,1,.3,1);
}
.ldv-btn:not(:disabled):hover::before{ transform:scaleX(1); }
.ldv-btn:disabled{ opacity:.55; cursor:not-allowed; }
.ldv-btn-principal{
  background:var(--ldv-accent); color:var(--ldv-accent-ink); border-color:var(--ldv-accent);
}
.ldv-btn-principal::before{ background:var(--ldv-ink); }
.ldv-btn-principal:not(:disabled):hover{ border-color:var(--ldv-ink); }
.ldv-btn-simplu{ background:transparent; color:var(--ldv-ink); border-color:var(--ldv-line); }
.ldv-btn-simplu::before{ background:var(--ldv-ink); }
.ldv-btn-simplu:not(:disabled):hover{ color:var(--ldv-accent-ink); border-color:var(--ldv-ink); }
.ldv-btn:focus-visible{ outline:2px solid var(--ldv-accent); outline-offset:2px; }
.ldv-actiuni{ display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }
.ldv-creste{ flex:1; }

/* ---------- rezultate ---------- */
.ldv-tip{
  display:flex; align-items:center; gap:14px; flex-wrap:wrap;
  padding:16px 0; border-bottom:1px solid var(--ldv-line-soft);
}
.ldv-tip:last-child{ border-bottom:none; }

/* Variantele de cazare sunt butoane: fiecare e o propunere completa pentru
   tot grupul, iar alegerea uneia e o actiune, nu o bifa decorativa.
   Resetam aspectul de buton, pastram doar comportamentul. */
.ldv-optiune{
  width:100%; font:inherit; color:inherit; text-align:left;
  background:transparent; border:none; cursor:pointer;
  border-bottom:1px solid var(--ldv-line-soft);
  padding:16px 12px; border-radius:8px;
  transition:background .15s, box-shadow .15s;
}
.ldv-optiune:hover{ background:var(--ldv-surface-2); }
.ldv-optiune:focus-visible{
  outline:none; box-shadow:0 0 0 3px var(--ldv-accent-soft);
}
.ldv-optiune-aleasa{
  background:var(--ldv-accent-soft);
  box-shadow:inset 0 0 0 2px var(--ldv-accent);
}
.ldv-tip-info{ flex:1; min-width:180px; }
.ldv-pret{ font-size:1.18em; font-weight:670; white-space:nowrap; }
.ldv-pret small{ display:block; font-size:.62em; font-weight:400; color:var(--ldv-faint); }

.ldv-numar{ display:flex; align-items:center; gap:6px; }
.ldv-numar button{
  font:inherit; width:38px; height:38px; border-radius:8px;
  border:1px solid var(--ldv-line); background:var(--ldv-surface);
  cursor:pointer; font-size:1.15em; line-height:1;
}
.ldv-numar button:disabled{ opacity:.4; cursor:not-allowed; }
.ldv-numar span{ min-width:26px; text-align:center; font-weight:650;
  font-variant-numeric:tabular-nums; }

/* ---------- stări ---------- */
.ldv-alerta{
  border-radius:8px; padding:12px 14px; margin-bottom:16px; font-size:.94em;
  border:1px solid;
}
.ldv-alerta-eroare{
  background:var(--ldv-danger-soft); border-color:#eecac3; color:var(--ldv-danger);
}
.ldv-alerta-info{
  background:var(--ldv-accent-soft); border-color:#c9e0d6; color:#245240;
}
.ldv-gol{ text-align:center; padding:26px 10px; color:var(--ldv-muted); }

.ldv-sumar{
  background:var(--ldv-surface-2); border-radius:8px;
  padding:14px 16px; margin-bottom:18px; font-size:.94em;
}
.ldv-sumar-linie{ display:flex; justify-content:space-between; gap:12px; padding:3px 0; }
.ldv-sumar-total{
  border-top:1px solid var(--ldv-line); margin-top:8px; padding-top:9px;
  font-weight:670; font-size:1.06em;
}

.ldv-pasi{
  display:flex; gap:6px; margin-bottom:18px; font-size:.8em;
  color:var(--ldv-faint); flex-wrap:wrap;
}
.ldv-pasi span{ display:flex; align-items:center; gap:6px; }
.ldv-pasi span::after{ content:"›"; color:var(--ldv-line); }
.ldv-pasi span:last-child::after{ content:""; }
.ldv-pas-activ{ color:var(--ldv-accent); font-weight:650; }

.ldv-confirmare{ text-align:center; padding:12px 0 4px; }
.ldv-numar-confirmare{
  font-size:1.5em; font-weight:700; letter-spacing:.04em;
  margin:10px 0 4px; font-variant-numeric:tabular-nums;
}

/* Rândul de trei (Sosire · Nopți · Plecare) se desface mai devreme decât
   cel de două, fiindcă doi dintre cei trei sunt câmpuri de tip date.
   Pe iOS acela e un control nativ cu lățime intrinsecă de ~175px — data
   plus glifa de calendar — sub care Safari NU coboară, oricât i-ai da
   width:100% sau min-width:0. La 561px coloanele ies de 154px, deci
   fiecare câmp împinge pagina în lateral cu ~20px.
   La 720px coloana ajunge la ~207px, cu marjă confortabilă. */
@media (max-width:720px){
  .ldv-rand-3{ grid-template-columns:1fr; }
}
@media (max-width:560px){
  .ldv-rand-2{ grid-template-columns:1fr; }
  .ldv-card{ padding:16px; }
  .ldv-actiuni .ldv-btn{ width:100%; }
}
@media (prefers-reduced-motion:reduce){
  .ldv *{ transition:none !important; }
}
`;
