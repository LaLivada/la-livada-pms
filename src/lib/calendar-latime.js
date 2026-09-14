// @ts-check
/* Latimea zilelor din calendar (faza 3, C3): trei trepte — zile inguste
 * (66px, multe zile deodata), „7 zile pe ecran" (cate incap in latimea
 * grilei: pe o tableta de 10" cam 135px pe zi, numele se citesc) si zile
 * late (190px, numele intreg). Butonul din bara le parcurge pe rand;
 * pe ecranele atinse cu degetul le schimba si un pinch pe grila. Coloana
 * cu numele camerei si randul cu zilele sunt lipicioase de dinainte
 * (.cal-roomcell, .cal-head in pms.css).
 *
 * Reguli pure; starea, masurarea latimii grilei (ResizeObserver) si
 * gesturile sunt in features/rezervari.jsx.
 */
export const LATIMI = ["ingust", "saptamana", "larg"];
export const ZI_INGUSTA_PX = 66;
export const ZI_LATA_PX = 190;
export const COLOANA_CAMERA_PX = 78;
export const ZILE_PE_ECRAN = 7;
export const CHEIE_LATIME = "pms:calendar:latime";

export const ETICHETA_LATIME = {
  ingust: "Zile înguste",
  saptamana: "7 zile pe ecran",
  larg: "Zile late — numele întreg",
};

/* Tableta = deget + ecran de la 700px in sus: acolo 7 zile pe ecran e
   implicitul. Telefonul ramane pe zile late (7 zile pe 360px ar fi 40px pe
   zi, nimic lizibil); desktopul la fel, ca pana acum. */
export function latimeImplicita({ tactil = false, latimeEcran = 0 } = {}) {
  return tactil && latimeEcran >= 700 ? "saptamana" : "larg";
}

/* Alegerea ramasa in browser, daca e una valida. */
export function latimeSalvata(stocare) {
  try {
    const v = stocare?.getItem?.(CHEIE_LATIME);
    return LATIMI.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/* Butonul: inguste → 7 zile → late → inguste. */
export function urmatoareaLatime(curenta) {
  const i = LATIMI.indexOf(curenta);
  return LATIMI[(i + 1) % LATIMI.length];
}

/* Pinch-ul: un pas spre lat (+1) sau spre ingust (−1), fara sa se
   invarta la capete — cine departeaza degetele pe zile late vrea „mai
   lat", nu sa sara la inguste. */
export function latimeDupaPinch(curenta, directie) {
  const i = Math.max(0, LATIMI.indexOf(curenta));
  const j = Math.min(LATIMI.length - 1, Math.max(0, i + directie));
  return LATIMI[j];
}

/* Cati pixeli are o zi. La „7 zile" se imparte latimea grilei fara coloana
   camerei; sub 66px nu se coboara — pe un ecran prea ingust e tot ce se
   poate face lizibil, si se deruleaza. */
export function latimeZiPx(mod, latimeGrila) {
  if (mod === "larg") return ZI_LATA_PX;
  if (mod === "saptamana") {
    const disponibil = (Number(latimeGrila) || 0) - COLOANA_CAMERA_PX;
    return Math.max(ZI_INGUSTA_PX, Math.floor(disponibil / ZILE_PE_ECRAN));
  }
  return ZI_INGUSTA_PX;
}

/* Antetul zilelor: numele intreg („miercuri", „duminică") cand coloana are
   loc, prescurtat („mie.") cand n-are. Cerut pe 14 septembrie 2026 pentru
   zilele late; pragul e in pixeli, nu pe treapta, ca „7 zile pe ecran" pe o
   tableta (~135px) sa-l primeasca si ea, iar pe un telefon (66px) nu. Cel
   mai lung nume are ~60px la 11px bold; 96 lasa loc si pentru margini. */
export const ZI_NUME_INTREG_PX = 96;
export function numeZiIntreg(ziPx) {
  return (Number(ziPx) || 0) >= ZI_NUME_INTREG_PX;
}

/* Pinch: raportul dintre distanta curenta a degetelor si cea de referinta.
   Pragul e larg (30%) ca un tremur al mainii sa nu schimbe nimic; dupa un
   pas, referinta devine distanta curenta, deci un pinch continuu face
   pasii pe rand. */
export const PRAG_PINCH = 1.3;
export function decidePinch(distantaReferinta, distantaCurenta) {
  if (!(distantaReferinta > 0) || !(distantaCurenta > 0)) return 0;
  const r = distantaCurenta / distantaReferinta;
  if (r >= PRAG_PINCH) return 1;
  if (r <= 1 / PRAG_PINCH) return -1;
  return 0;
}

export function distantaAtingeri(atingeri) {
  if (!atingeri || atingeri.length < 2) return 0;
  const a = atingeri[0], b = atingeri[1];
  return Math.hypot((a.clientX || 0) - (b.clientX || 0), (a.clientY || 0) - (b.clientY || 0));
}
