/* Adaugarea paginii pe ecranul principal al telefonului.
 *
 * Doua sisteme, doua realitati, si diferenta nu se poate ascunde:
 *
 * Android/Chrome anunta prin `beforeinstallprompt` ca pagina se poate
 * instala. Evenimentul, oprit din drum si tinut deoparte, poate fi
 * redeschis mai tarziu dintr-un buton — deci acolo apasarea duce direct la
 * dialogul de instalare al sistemului.
 *
 * iOS nu are niciun echivalent. Safari nu-i da paginii niciun mijloc de
 * a-si pune singura iconul; singura cale e Partajare > Adauga la ecranul
 * principal, facuta de om. Acolo butonul nu poate decat sa arate pasii.
 *
 * Ascultatorul sta aici, la incarcarea modulului, nu in componenta:
 * evenimentul vine la cateva sute de milisecunde dupa deschiderea paginii,
 * cu mult inainte ca oaspetele sa apese pe „Bun venit". Pus in componenta,
 * ar fi ratat de fiecare data si butonul ar cadea inutil pe instructiuni.
 */

let evenimentul = null;
const abonati = new Set();

const anunta = () => { for (const f of abonati) f(); };

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Fara preventDefault, Chrome isi arata singur bannerul si ne ia
    // evenimentul din maini.
    e.preventDefault();
    evenimentul = e;
    anunta();
  });
  window.addEventListener("appinstalled", () => {
    evenimentul = null;
    anunta();
  });
}

export const promptDisponibil = () => evenimentul !== null;

export function asculta(f) {
  abonati.add(f);
  return () => abonati.delete(f);
}

/* Intoarce „accepted", „dismissed" sau „indisponibil". Evenimentul e de
   unica folosinta: dupa prompt() nu mai poate fi rechemat, deci se uita. */
export async function cheamaPrompt() {
  const e = evenimentul;
  if (!e) return "indisponibil";
  evenimentul = null;
  anunta();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}

/* Deja deschisa din icon: pe Android prin display-mode, pe iOS printr-o
   proprietate proprie pe care doar Safari o pune. */
export function esteInstalata() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || window.navigator.standalone === true;
}

export function esteIOS() {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return true;
  // iPadOS se prezinta drept Mac; ecranul tactil il da de gol.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/* Manifestul se scrie la rulare, nu ca fisier in public-guest/.
 *
 * Motivul e `start_url`: iconul instalat deschide adresa scrisa acolo, iar
 * ea trebuie sa pastreze codul sejurului. Un manifest static ar trimite la
 * guest.lalivada.ro fara fragment, adica direct in ecranul de link invalid
 * — un icon care nu duce nicaieri e mai rau decat lipsa lui.
 *
 * Blob, nu data:. Un blob: mosteneste originea documentului, deci trece
 * verificarea Chrome ca start_url e pe acelasi domeniu; un data: are
 * origine opaca. Adresele iconitelor sunt absolute fiindca baza de
 * rezolvare e adresa manifestului, nu a paginii.
 *
 * Daca ceva din toate astea nu tine, Chrome pur si simplu nu trimite
 * `beforeinstallprompt`, iar butonul cade pe instructiuni. Nu se strica
 * nimic — doar se pierde apasarea unica. */
export function pregatesteManifestul() {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[rel="manifest"]')) return;

  const baza = window.location.origin;
  const manifest = {
    name: "Sejurul tău — Complex La Livada",
    short_name: "La Livadă",
    lang: "ro",
    dir: "ltr",
    start_url: window.location.href,
    scope: `${baza}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f1e8",
    theme_color: "#3f4a3d",
    icons: [
      { src: `${baza}/brand/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${baza}/brand/favicon.png`, sizes: "512x512", type: "image/png" },
    ],
  };

  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
  );
  document.head.appendChild(link);
}
