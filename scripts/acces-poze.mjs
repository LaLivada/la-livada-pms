/* Pregateste pozele traseului prin curte: public-guest/acces/
 *
 * DE CE EXISTA. Pozele vin direct din telefon, cu 3-4 MB bucata. Puse asa,
 * panoul „Acces camere" ar trage vreo 15 MB — pe date mobile, seara, cu omul
 * stand in masina la poarta. Pozele atractiilor din aceeasi pagina au intre
 * 25 si 115 KB; astea trebuie sa fie in aceeasi liga.
 *
 * Se pastreaza raportul PORTRET al originalelor, nu se taie la 16:10 ca la
 * atractii: acolo poza e decor, aici e reper. Taiata, ar disparea exact
 * indicatorul sau poarta dupa care se orienteaza omul. Inaltimea pe ecran o
 * limiteaza CSS-ul, nu fisierul.
 *
 * Uneltele nu stau in devDependencies, ca la wifi-qr.mjs si og-guest.mjs.
 *
 *   npm i --no-save sharp
 *   node scripts/acces-poze.mjs
 *
 * Intrarea: poze-acces/1.jpg, 2.jpg, 3.jpg, 4.jpg — numerotate in ORDINEA
 * in care le vede oaspetele mergand spre camera. Numerele sunt singurul
 * lucru care stabileste ordinea; numele de fisier al telefonului nu spune
 * nimic despre ea.
 *
 * Scriptul isi verifica singur rezultatul si tipareste la final lista de
 * pus in ACCES_CAMERE.poze din src/guest/continut.js.
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";

const INTRARE = "poze-acces";
const IESIRE = "public-guest/acces";

/* Latimea pozelor din pagina, aceeasi ca la atractii: peste atat nu se mai
   vede nimic in plus pe un telefon, dar se plateste in kilobytes. */
const LATIME = 720;
/* Peste atat, o poza singura cantareste cat tot restul paginii. */
const KB_MAXIM = 220;

/* Ordinea drumului, si numele sub care ajung in pagina. Un nume care spune
   ce e in poza, nu „img_4471": peste un an, cine schimba una trebuie sa stie
   pe care o schimba fara sa le deschida pe toate. */
const DRUMUL = [
  { nr: 1, nume: "1-intrarea.jpg" },
  { nr: 2, nume: "2-aleea.jpg" },
  { nr: 3, nume: "3-parcarea.jpg" },
  { nr: 4, nume: "4-poteca.jpg" },
];

const CITIBILE = [".jpg", ".jpeg", ".png", ".webp"];

if (!existsSync(INTRARE)) {
  console.error(`Lipseste folderul ${INTRARE}/. Pune acolo pozele, numerotate 1..${DRUMUL.length}.`);
  process.exit(1);
}
mkdirSync(IESIRE, { recursive: true });

const dinFolder = readdirSync(INTRARE);
const gaseste = (nr) => dinFolder.find((f) => {
  const punct = f.lastIndexOf(".");
  return f.slice(0, punct) === String(nr) && CITIBILE.includes(f.slice(punct).toLowerCase());
});

const lipsa = DRUMUL.filter((d) => !gaseste(d.nr));
if (lipsa.length) {
  const gasite = dinFolder.join(", ") || "nimic";
  console.error(
    `Nu gasesc pozele ${lipsa.map((d) => d.nr).join(", ")} in ${INTRARE}/.\n` +
    `  gasit acolo: ${gasite}\n` +
    `  asteptat:    ${DRUMUL.map((d) => d.nr + ".jpg").join(", ")}\n` +
    `  (HEIC-ul de pe iPhone nu se poate citi — exporta ca JPEG.)`);
  process.exit(1);
}

const facute = [];
for (const d of DRUMUL) {
  const sursa = `${INTRARE}/${gaseste(d.nr)}`;
  const tinta = `${IESIRE}/${d.nume}`;
  const m = await sharp(sursa).metadata();
  await sharp(sursa)
    /* `withoutEnlargement` ca o poza deja mica sa nu fie intinsa si innegurata. */
    .resize({ width: LATIME, withoutEnlargement: true })
    /* Rotatia din EXIF se aplica acum: fara ea, o poza facuta cu telefonul
       intors ajunge culcata in pagina, desi in galerie arata drept. */
    .rotate()
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(tinta);
  const dupa = await sharp(tinta).metadata();
  facute.push({ ...d, sursa, tinta, latime: dupa.width, inaltime: dupa.height,
                kb: statSync(tinta).size / 1024, kbInainte: statSync(sursa).size / 1024,
                rotitDinExif: m.orientation && m.orientation > 1 });
}

/* ---- verificarea, pe fisierele scrise ---- */
const probleme = [];
for (const f of facute) {
  if (f.latime > LATIME) probleme.push(`${f.nume}: ${f.latime}px lat, peste ${LATIME}`);
  if (f.kb > KB_MAXIM) probleme.push(`${f.nume}: ${f.kb.toFixed(0)} KB, peste ${KB_MAXIM}`);
  /* O poza culcata inseamna aproape sigur ca a scapat rotatia din EXIF, iar
     un reper intors pe o parte nu ajuta pe nimeni sa gaseasca poarta. */
  if (f.latime > f.inaltime) probleme.push(`${f.nume}: iesita culcata (${f.latime}x${f.inaltime})`);
}
if (probleme.length) {
  console.error("Pozele NU sunt bune:\n  " + probleme.join("\n  "));
  process.exit(1);
}

const total = facute.reduce((s, f) => s + f.kb, 0);
for (const f of facute) {
  console.log(`${f.nume.padEnd(16)} ${f.latime}x${f.inaltime}  ` +
              `${f.kbInainte.toFixed(0)} KB -> ${f.kb.toFixed(0)} KB` +
              (f.rotitDinExif ? "  (rotita din EXIF)" : ""));
}
console.log(`\ntotal ${total.toFixed(0)} KB, si se descarca doar cand se deschide panoul.`);
console.log(`\nDe pus in ACCES_CAMERE.poze din src/guest/continut.js:\n`);
console.log("  poze: [");
for (const f of facute) console.log(`    { fisier: "${f.nume}", descriere: "" },`);
console.log("  ],");
