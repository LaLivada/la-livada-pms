/* Stiluri pentru pagina oaspetelui.
 *
 * Aceleasi jetoane ca la booking (src/booking/styles.js) si ca pe
 * lalivada.ro, ca sa fie evident ca e aceeasi casa. Diferenta de fond e ca
 * pagina asta se deschide aproape numai pe telefon, adesea in fata usii,
 * uneori pe intuneric: de-aceea codul de acces e mare, contrastat si
 * singur pe rand, iar restul sta in jurul lui.
 */
/* ATENTIE: tot ce urmeaza e un template literal. Fara backticks in
   comentariile CSS — inchid sirul, iar build-ul cade cu un mesaj despre
   punct si virgula lipsa, care nu trimite deloc la cauza reala. */
export const STILURI = `
:root{
  --g-ink:#22221f;
  --g-muted:rgba(34,34,31,.68);
  --g-faint:rgba(34,34,31,.45);
  --g-line:rgba(63,74,61,.2);
  --g-surface:#ffffff;
  --g-fundal:#f4f2ec;
  --g-accent:#3f4a3d;
  --g-accent-soft:rgba(63,74,61,.09);
  --g-danger:#a33a2f;
  --g-radius:10px;
}
*,*::before,*::after{ box-sizing:border-box; }
body{
  margin:0; background:var(--g-fundal); color:var(--g-ink);
  font-family:'Manrope',system-ui,-apple-system,sans-serif;
  line-height:1.55; -webkit-text-size-adjust:100%;
}
.g-pagina{
  max-width:520px; margin:0 auto;
  padding:24px 16px calc(40px + env(safe-area-inset-bottom));
  display:grid; gap:14px;
}

.g-cap{ text-align:center; margin-bottom:2px; }
.g-cap h1{
  font-family:'Instrument Serif',Georgia,serif; font-weight:400;
  font-size:30px; line-height:1.15; margin:0 0 4px;
}
.g-cap p{ margin:0; color:var(--g-muted); font-size:14px; }

.g-card{
  background:var(--g-surface); border:1px solid var(--g-line);
  border-radius:var(--g-radius); padding:18px;
}
.g-card h2{
  font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
  color:var(--g-faint); margin:0 0 12px;
}

/* Codul: singurul lucru de pe pagina care se citeste de la un metru, cu o
   mana pe clanta. Cifre monospatiate si distantate, ca 8 si 0 sa nu se
   confunde la lumina slaba a unei terase. */
.g-cod{
  /* Doar fonturi de sistem. Pagina incarca Instrument Serif si Manrope; un
     al treilea font, cerut pentru patru cifre, ar fi inca o descarcare
     inainte ca omul sa vada codul. Iar numit fara sa fie incarcat, ar fi
     aratat altfel pe calculatoarele care il au instalat local decat pe
     restul. */
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-size:44px; font-weight:600; letter-spacing:.14em;
  text-align:center; margin:2px 0 10px; color:var(--g-accent);
  /* Codul se tine minte sau se copiaza; nu e text de selectat din greseala
     la primul tap, dar trebuie sa poata fi selectat deliberat. */
  user-select:all; -webkit-user-select:all;
}
.g-cod-valabil{ text-align:center; font-size:13px; color:var(--g-muted); margin:0; }
.g-cod-valabil b{ color:var(--g-ink); font-weight:600; }
.g-cod-lipsa{
  text-align:center; color:var(--g-muted); font-size:14px; margin:0;
  padding:10px 0;
}

.g-rand{
  display:flex; justify-content:space-between; gap:12px;
  padding:7px 0; border-top:1px solid rgba(63,74,61,.1);
}
.g-rand:first-of-type{ border-top:0; padding-top:0; }
.g-rand dt{ color:var(--g-muted); font-size:14px; margin:0; }
.g-rand dd{ margin:0; font-weight:600; font-size:14px; text-align:right; }
.g-lista{ margin:0; }

.g-minibar{ display:grid; gap:0; }
.g-produs{
  display:flex; justify-content:space-between; align-items:baseline; gap:12px;
  padding:9px 0; border-top:1px solid rgba(63,74,61,.1);
}
.g-produs:first-child{ border-top:0; padding-top:0; }
.g-produs-nume{ font-weight:500; }
.g-produs-desc{ display:block; font-size:13px; color:var(--g-muted); font-weight:400; }
.g-produs-pret{ white-space:nowrap; font-variant-numeric:tabular-nums; font-weight:600; }

.g-gol{ color:var(--g-muted); font-size:14px; margin:0; }

/* Ecranele de refuz. Nu doar „eroare": fiecare spune ce s-a intamplat si
   ce are omul de facut mai departe, fiindca el sta undeva cu telefonul in
   mana si nu are de unde sti daca a gresit el ceva. */
.g-mesaj{ text-align:center; padding:26px 18px; }
.g-mesaj h1{
  font-family:'Instrument Serif',Georgia,serif; font-weight:400;
  font-size:26px; margin:0 0 8px;
}
.g-mesaj p{ margin:0 0 16px; color:var(--g-muted); }
.g-buton{
  display:inline-block; background:var(--g-accent); color:#fff;
  text-decoration:none; padding:12px 20px; border-radius:8px;
  font-weight:600; font-size:15px;
}
.g-subsol{
  text-align:center; font-size:13px; color:var(--g-faint); margin:4px 0 0;
}
.g-subsol a{ color:var(--g-muted); }

@media (prefers-color-scheme: dark){
  :root{
    --g-ink:#ece9e2; --g-muted:rgba(236,233,226,.7); --g-faint:rgba(236,233,226,.45);
    --g-line:rgba(236,233,226,.16); --g-surface:#1d211c; --g-fundal:#141712;
    --g-accent:#a9bfa1; --g-accent-soft:rgba(169,191,161,.12);
  }
  .g-buton{ color:#141712; }
}
`;
