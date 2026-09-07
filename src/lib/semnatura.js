/* Semnatura, ca traseu vectorial.
 *
 * DE CE SVG SI NU POZA. Trei motive, in ordinea importantei:
 *   1. sta in randul din baza, deci intra in acelasi backup ca restul
 *      fisei; o poza in Storage ar fi al doilea loc de salvat, iar
 *      backup-ul proiectului e inca pe planul gratuit, cu zero copii;
 *   2. fisa se TIPARESTE la A4, iar un traseu se tipareste curat la orice
 *      marime, spre deosebire de un bitmap de 600 de pixeli latime;
 *   3. ~3 KB in loc de ~25.
 *
 * Coordonatele sunt in sistemul panzei (600x200), nu in pixeli de ecran:
 * altfel aceeasi semnatura ar iesi de alta marime de pe fiecare telefon, si
 * ar arata altfel pe fisa tiparita.
 */

export const LATIME_PANZA = 600;
export const INALTIME_PANZA = 200;

/* Sub doi pixeli intre doua puncte, al doilea nu adauga nimic vizibil.
   Degetul tinut pe loc trimite zeci de evenimente in acelasi loc, iar la
   ~400 de puncte diferenta se vede in marimea randului, nu pe ecran. */
const PRAG_DISTANTA = 2;

/* Sub atat, n-a semnat nimeni — a atins panza din greseala sau a incercat
   sa deruleze pagina. Masurat ca lungime TOTALA a traseului, nu ca numar de
   puncte si nici pe cea mai lunga linie: un deget lent trimite multe puncte
   pe o distanta mica, iar un nume scris din trei bucati scurte e tot o
   semnatura. */
const LUNGIME_MINIMA = 60;

const r1 = (n) => Math.round(n * 10) / 10;

export function traseuSvg(linii) {
  if (!Array.isArray(linii)) return "";
  return linii.map((linie) => {
    if (!Array.isArray(linie) || linie.length === 0) return "";
    /* Primul punct se pastreaza mereu, oricat de scurta e linia: un punct pe
       „i" e o singura atingere, iar aruncat ar schimba semnatura. */
    const pastrate = [linie[0]];
    for (const p of linie.slice(1)) {
      const ultim = pastrate[pastrate.length - 1];
      if (Math.hypot(p.x - ultim.x, p.y - ultim.y) >= PRAG_DISTANTA) pastrate.push(p);
    }
    return pastrate
      .map((p, i) => `${i === 0 ? "M" : "L"}${r1(p.x)} ${r1(p.y)}`)
      .join("");
  }).join("");
}

export function esteGoala(linii) {
  if (!Array.isArray(linii) || linii.length === 0) return true;
  let lungime = 0;
  for (const linie of linii) {
    if (!Array.isArray(linie)) continue;
    for (let i = 1; i < linie.length; i++) {
      lungime += Math.hypot(linie[i].x - linie[i - 1].x, linie[i].y - linie[i - 1].y);
    }
  }
  return lungime < LUNGIME_MINIMA;
}
