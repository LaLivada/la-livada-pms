/* D6 (faza 4): fiecare fisier din src/lib si src/data incepe cu
 * `// @ts-check`, ca `npm run typecheck` (jsconfig.json, checkJs: false) sa-l
 * verifice. Un fisier nou fara pragma ar ramane tacut neverificat — exact
 * felul de gaura care nu se vede pana nu doare. Testul spune care lipsesc.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DOSARE = ["src/lib", "src/data"];

describe("@ts-check pe modulele pure", () => {
  it("toate fisierele din src/lib si src/data au pragma pe prima linie", () => {
    const fara = [];
    for (const d of DOSARE) {
      for (const f of readdirSync(d).filter((n) => n.endsWith(".js"))) {
        if (!readFileSync(join(d, f), "utf8").startsWith("// @ts-check")) fara.push(`${d}/${f}`);
      }
    }
    expect(fara, "fisiere fara `// @ts-check` pe prima linie").toEqual([]);
  });
});
