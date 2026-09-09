/* Regenereaza cartonasul de previzualizare al paginii oaspetelui:
 * public-guest/brand/og-whatsapp.png
 *
 * DE CE EXISTA. Fara `og:image`, WhatsApp isi cauta singur o poza si alege
 * cel mai mare icon gasit — adica favicon.png, copacul singur, fara nume. In
 * previzualizarea unui link de cazare arata a icon de aplicatie, nu a sigla
 * de complex. Aici se compune sigla intreaga, cea cu „LA LIVADĂ" langa copac.
 *
 * DE CE NU SE FOLOSESTE logo.png DIRECT. Are fundal transparent, iar
 * previzualizarile il randeaza pe negru sau pe alb dupa client — auriul ar fi
 * iesit altfel pe fiecare telefon. Aici se aseaza pe fildesul paginii, opac,
 * si arata la fel peste tot.
 *
 * Uneltele nu stau in devDependencies, ca la scripts/wifi-qr.mjs: se
 * folosesc o data la cativa ani, se aduc pe loc.
 *
 *   npm i --no-save sharp
 *   node scripts/og-guest.mjs
 *
 * Scriptul isi verifica singur rezultatul — vezi capatul fisierului.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SIGLA = "public/logo.png";
const IESIRE = "public-guest/brand/og-whatsapp.png";

/* 1.91:1 e raportul pe care il asteapta Open Graph, si cel la care WhatsApp
   arata cartonasul MARE, cu poza deasupra, in loc de miniatura patrata de
   langa adresa. */
const LATIME = 1440;
const INALTIME = 754;

/* --g-ivory din src/guest/styles.js. Aceeasi hartie ca a paginii care se
   deschide dupa apasare: previzualizarea si pagina nu trebuie sa arate a
   doua branduri. */
const FILDES = { r: 0xf5, g: 0xf1, b: 0xe8, alpha: 1 };

const sigla = sharp(SIGLA);
const { width: ls, height: is } = await sigla.metadata();

/* Sigla se aseaza la marimea ei, fara redimensionare: e deja de 1200 de
   pixeli lati, iar orice reeșantionare ar fi inmuiat marginile literelor
   degeaba. Panza e mai mare decat ea, iar diferenta devine margine. */
const cartonas = await sharp({
  create: { width: LATIME, height: INALTIME, channels: 4, background: FILDES },
})
  .composite([{
    input: await sigla.png().toBuffer(),
    left: Math.round((LATIME - ls) / 2),
    top: Math.round((INALTIME - is) / 2),
  }])
  /* Fara canal alfa: un PNG cu transparenta e exact ce am vrut sa evitam.
     `flatten` arde transparenta pe fildes, dar LASA canalul — sharp scrie
     tot RGBA, cu alfa plina. Prins de verificarea de mai jos, la prima
     rulare. `removeAlpha` e cel care scoate canalul din fisier. */
  .flatten({ background: FILDES })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(IESIRE, cartonas);

/* ---- verificarea, pe fisierul scris, nu pe ce credem ca am scris ---- */
const scris = sharp(IESIRE);
const m = await scris.metadata();
const probleme = [];

if (m.width !== LATIME || m.height !== INALTIME) {
  probleme.push(`marime ${m.width}x${m.height}, asteptat ${LATIME}x${INALTIME}`);
}
/* Alfa ramasa inseamna ca previzualizarea o randeaza pe ce culoare vrea ea. */
if (m.hasAlpha) probleme.push("a ramas canal alfa");

/* Colturile trebuie sa fie fildes curat: daca sigla a fost asezata gresit,
   aici apare auriu sau transparenta. */
const brut = await scris.raw().toBuffer({ resolveWithObject: true });
const { data, info } = brut;
const pixel = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};
for (const [x, y] of [[0, 0], [LATIME - 1, 0], [0, INALTIME - 1], [LATIME - 1, INALTIME - 1]]) {
  const [r, g, b] = pixel(x, y);
  if (r !== FILDES.r || g !== FILDES.g || b !== FILDES.b) {
    probleme.push(`coltul ${x},${y} e ${r},${g},${b}, nu fildes`);
  }
}
/* Mijlocul TREBUIE sa fie auriu: altfel sigla n-a intrat deloc, iar
   cartonasul ar fi o pagina goala pe care nimeni n-o observa lipsind. */
const [mr, mg, mb] = pixel(Math.round(LATIME / 2), Math.round(INALTIME / 2));
if (mr === FILDES.r && mg === FILDES.g && mb === FILDES.b) {
  probleme.push("mijlocul e gol — sigla n-a fost compusa");
}
/* WhatsApp sare peste pozele mari; sub 300 KB nu se pune problema. */
const kb = cartonas.length / 1024;
if (kb > 300) probleme.push(`${kb.toFixed(0)} KB, prea mare pentru previzualizare`);

if (probleme.length) {
  console.error("Cartonasul NU e bun:\n  " + probleme.join("\n  "));
  process.exit(1);
}
console.log(`${IESIRE}: ${m.width}x${m.height}, ${kb.toFixed(0)} KB, opac, sigla in mijloc.`);
