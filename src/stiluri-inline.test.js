/* D2 (faza 4): stilurile inline nu mai cresc. oxlint n-are o regula pentru
 * `style={{ ... }}`, asa ca plafonul e un test: numara aparitiile in toate
 * fisierele .jsx din src (fara teste) si cade daca sunt mai multe decat
 * PLAFON. Cand scoti stiluri inline dintr-un ecran, cobori PLAFON la noul
 * numar — asa numarul merge doar in jos.
 *
 * Din 16 septembrie 2026 migrarea e terminata: din 366 au ramas 12, si toate
 * sunt CALCULATE la rulare — pozitiile barelor din calendar (left, width,
 * --zi-w, --days), scalarea colilor A4 (factura, rooming list), procentele
 * din rapoarte si glisorul de usa. Un stil calculat n-are cum sa fie clasa,
 * deci plafonul asta nu mai are unde sa coboare: daca scrii un `style={{ }}`
 * nou cu valori constante, testul cade, si asta e treaba lui.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PLAFON = 12;

function fisiereJsx(d, acc = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) fisiereJsx(p, acc);
    else if (n.endsWith(".jsx") && !n.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("stiluri inline (D2)", () => {
  it(`nu sunt mai multe de ${PLAFON} style={{ }} in src/**/*.jsx`, () => {
    const pe = fisiereJsx("src")
      .map((f) => [f.replace(/\\/g, "/"), (readFileSync(f, "utf8").match(/style=\{\{/g) || []).length])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = pe.reduce((s, [, n]) => s + n, 0);
    console.log(`stiluri inline: ${total} (plafon ${PLAFON})`);
    const top = pe.slice(0, 5).map(([f, n]) => `${n} ${f}`).join("\n");
    expect(total, `stiluri inline: ${total}, peste plafonul ${PLAFON}; cele mai multe:\n${top}`).toBeLessThanOrEqual(PLAFON);
  });
});
