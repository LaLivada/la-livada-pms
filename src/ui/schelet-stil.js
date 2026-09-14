/* Stilul scheletului de încărcare (ui/schelet.jsx, faza 3, C10), separat de
 * componentă ca să poată fi lipit de foile de stil ale site-ului și ale
 * aplicației de oaspete (amândouă șiruri) fără să tragă React acolo.
 * Culorile vin din jetoanele fiecărei aplicații prin --schelet-fond /
 * --schelet-linie / --schelet-text; fără ele, un gri neutru. */
export const STIL_SCHELET = `
.schelet{ position:relative; }
.schelet-eticheta{
  position:absolute; width:1px; height:1px; overflow:hidden;
  clip:rect(0 0 0 0); white-space:nowrap;
}
.schelet-rand{
  display:flex; align-items:center; gap:14px; padding:16px 12px;
  border-bottom:1px solid var(--schelet-linie, rgba(0,0,0,.08));
}
.schelet-rand:last-of-type{ border-bottom:none; }
.schelet-info{ flex:1; min-width:0; display:grid; gap:9px; }
.schelet-linie{
  height:12px; border-radius:6px; background:var(--schelet-fond, rgba(0,0,0,.09));
  animation:schelet-puls 1.4s ease-in-out infinite;
}
.schelet-titlu{ height:16px; width:42%; }
.schelet-text{ width:64%; }
.schelet-pret{ width:72px; height:22px; flex-shrink:0; }
.schelet-incet{ margin:14px 0 0; font-size:.94em; color:var(--schelet-text, inherit); opacity:.8; }
@keyframes schelet-puls{ 0%,100%{ opacity:.55; } 50%{ opacity:1; } }
@media (prefers-reduced-motion:reduce){ .schelet-linie{ animation:none; } }
`;
