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
}
.ldv *,.ldv *::before,.ldv *::after{ box-sizing:border-box; }

.ldv-card{
  background:var(--ldv-surface);
  border:1px solid var(--ldv-line);
  border-radius:var(--ldv-radius);
  padding:20px;
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
