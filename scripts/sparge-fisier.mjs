/* Sparge un fisier mare in cate un fisier per componenta (faza 4, D1 din
 * docs/audit-2026-09.md): fiecare declaratie de nivel superior pleaca cu
 * comentariul ei, importurile se recalculeaza (doar ce foloseste fiecare
 * fisier nou), caile relative coboara un nivel, iar fisierul vechi devine
 * poarta de re-export, cu aceleasi nume — cine importa de acolo nu se schimba.
 * Nicio linie de cod nu e rescrisa.
 *
 * Folosire: node scripts/sparge-fisier.mjs <config.json>, unde config.json e
 *   { "sursa": "src/features/rezervari.jsx",
 *     "dosar": "src/features/rezervari",
 *     "grupuri": [ { "fisier": "calendar.jsx", "bucati": ["CalendarView"],
 *                    "titlu": "REZERVARI / CALENDARUL — ..." }, ... ],
 *     "antetPoarta": "/* comentariul de sus al portii *\/",
 *     "suprascrie": false }
 * „bucati" sunt numele declaratiilor de nivel superior (function/const/class);
 * toate trebuie sa apara intr-un grup. Dupa rulare: lint (no-undef prinde un
 * import lipsa), teste, build. Un nume pomenit doar in text JSX sau intr-un
 * sir poate ramane importat degeaba — se vede ca avertisment no-unused-vars. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const cfg = JSON.parse(readFileSync(process.argv[2], "utf8"));
const linii = readFileSync(cfg.sursa, "utf8").replace(/\r\n/g, "\n").split("\n");
const RE = /^(export )?(default )?(async )?(function|const|let|class) ([A-Za-z_$][\w$]*)/;

const starturi = [];
linii.forEach((l, i) => { const m = l.match(RE); if (m) starturi.push({ i, nume: m[5], exportat: !!m[1] }); });

/* Toate comentariile lipite deasupra unei declaratii (oricate blocuri, unul
   sub altul) ii apartin. */
function inceputCuComentariu(i) {
  let k = i;
  for (;;) {
    let j = k - 1;
    while (j >= 0 && linii[j].trim() === "") j--;
    if (j < 0) break;
    if (linii[j].trim().endsWith("*/")) {
      let s = j;
      while (s >= 0 && !linii[s].includes("/*")) s--;
      if (s < 0) break;
      k = s;
      continue;
    }
    if (linii[j].trim().startsWith("//")) {
      let s = j;
      while (s - 1 >= 0 && linii[s - 1].trim().startsWith("//")) s--;
      k = s;
      continue;
    }
    break;
  }
  return k;
}

/* Bannerele de sectiune (/* ------ TITLU ------ *\/) sunt ramase de pe vremea
   cand toata aplicatia era un singur fisier si nu mai descriu ce urmeaza;
   fiecare fisier nou are antetul lui. */
const faraBannere = (text) => text.replace(/\/\*\s*-{10,}\n[\s\S]*?-{10,}\*\/\n*/g, "");

const bucati = starturi.map((s, n) => {
  const de = inceputCuComentariu(s.i);
  const pana = n + 1 < starturi.length ? inceputCuComentariu(starturi[n + 1].i) - 1 : linii.length - 1;
  const text = faraBannere(linii.slice(de, pana + 1).join("\n")).replace(/\s+$/, "").replace(/^\n+/, "");
  return { ...s, de, pana, text };
});
const dupaNume = new Map(bucati.map((b) => [b.nume, b]));

/* Antetul: comentariul de inceput si importurile. */
const antet = linii.slice(0, bucati[0].de).join("\n");
const importuri = [];
const reImport = /import\s+([\s\S]*?)\s+from\s+"([^"]+)";/g;
let m;
while ((m = reImport.exec(antet))) {
  const clauza = m[1].trim();
  const sursa = m[2];
  const imp = { sursa, implicit: null, spatiu: null, nume: [] };
  const acolada = clauza.indexOf("{");
  let inainte = acolada >= 0 ? clauza.slice(0, acolada) : clauza;
  inainte = inainte.replace(/,\s*$/, "").trim();
  if (inainte.startsWith("* as ")) imp.spatiu = inainte.slice(5).trim();
  else if (inainte) imp.implicit = inainte;
  if (acolada >= 0) {
    const interior = clauza.slice(acolada + 1, clauza.lastIndexOf("}"));
    imp.nume = interior.split(",").map((s) => s.trim()).filter(Boolean).map((spec) => {
      const p = spec.split(/\s+as\s+/);
      return { spec, local: (p[1] || p[0]).trim() };
    });
  }
  importuri.push(imp);
}

/* Inainte de test: comentariile ies (un nume pomenit intr-un comentariu nu e
   o folosire), iar `...nume` (spread) nu e acces la membru. */
const curat = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\.\.\./g, " ");
const foloseste = (text, nume) => new RegExp(`(?<![\\w$.])${nume.replace(/\$/g, "\\$")}(?![\\w$])`).test(curat(text));
const folosesteMembru = (text, nume) => new RegExp(`(?<![\\w$.])${nume}\\.`).test(curat(text));
const cale = (sursa) => (sursa.startsWith("../") ? "../" + sursa : sursa.startsWith("./") ? "." + sursa : sursa);

/* Lista de nume, rupta pe randuri de cel mult ~100 de caractere. */
function listaImport(nume) {
  const lista = nume.join(", ");
  if (lista.length <= 96) return "{ " + lista + " }";
  const randuri = [];
  let rand = "";
  for (const n of nume) {
    if (rand && (rand + ", " + n).length > 96) { randuri.push(rand + ","); rand = n; }
    else rand = rand ? rand + ", " + n : n;
  }
  if (rand) randuri.push(rand + ",");
  return "{\n  " + randuri.join("\n  ") + "\n}";
}

mkdirSync(cfg.dosar, { recursive: true });
const grupulLui = new Map();
for (const g of cfg.grupuri) for (const n of g.bucati) grupulLui.set(n, g);
for (const b of bucati) if (!grupulLui.has(b.nume)) throw new Error("bucata fara grup: " + b.nume);

for (const g of cfg.grupuri) {
  const ale = g.bucati.map((n) => { const b = dupaNume.get(n); if (!b) throw new Error("bucata necunoscuta " + n); return b; });
  const text = ale.map((b) => b.text).join("\n\n");
  const randuri = [];
  for (const imp of importuri) {
    const nume = imp.nume.filter((x) => foloseste(text, x.local)).map((x) => x.spec);
    const implicit = imp.implicit && (folosesteMembru(text, imp.implicit) || (imp.implicit !== "React" && foloseste(text, imp.implicit))) ? imp.implicit : null;
    const spatiu = imp.spatiu && folosesteMembru(text, imp.spatiu) ? imp.spatiu : null;
    if (!nume.length && !implicit && !spatiu) continue;
    const parti = [];
    if (implicit) parti.push(implicit);
    if (spatiu) parti.push("* as " + spatiu);
    if (nume.length) parti.push(listaImport(nume));
    randuri.push(`import ${parti.join(", ")} from "${cale(imp.sursa)}";`);
  }
  /* Ce vine din celelalte fisiere ale dosarului. */
  const locale = new Map();
  for (const b of bucati) {
    if (g.bucati.includes(b.nume)) continue;
    if (!foloseste(text, b.nume)) continue;
    const alt = grupulLui.get(b.nume);
    if (!b.exportat) throw new Error(`${b.nume} e folosit de ${g.fisier} dar nu e exportat`);
    if (!locale.has(alt.fisier)) locale.set(alt.fisier, []);
    locale.get(alt.fisier).push(b.nume);
  }
  for (const [fisier, nume] of locale) randuri.push(`import { ${nume.join(", ")} } from "./${fisier}";`);
  const numeSursa = cfg.sursa.replace(/^src\//, "");
  const continut = `/* ${g.titlu}\n *\n * Desprins din ${numeSursa} (faza 4, D1 din docs/audit-2026-09.md):\n * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.\n */\n\n${randuri.join("\n")}\n\n${text}\n`;
  const tinta = join(cfg.dosar, g.fisier);
  if (existsSync(tinta) && !cfg.suprascrie) throw new Error("exista deja " + tinta);
  writeFileSync(tinta, continut);
  console.log("scris", tinta, `(${continut.split("\n").length} linii)`);
}

/* Poarta de re-export. */
const exportate = bucati.filter((b) => b.exportat);
const peFisier = new Map();
for (const b of exportate) {
  const g = grupulLui.get(b.nume);
  if (!peFisier.has(g.fisier)) peFisier.set(g.fisier, []);
  peFisier.get(g.fisier).push(b.nume);
}
const dosarRelativ = cfg.dosar.replace(/^src\/features\//, "./");
const poarta = cfg.antetPoarta + "\n" + [...peFisier].map(([f, nume]) => `export { ${nume.join(", ")} } from "${dosarRelativ}/${f}";`).join("\n") + "\n";
writeFileSync(cfg.sursa, poarta);
console.log("scris poarta", cfg.sursa, `(${poarta.split("\n").length} linii)`);
