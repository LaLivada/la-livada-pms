import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/* PMS-ul pus pe ecranul de start al telefonului (25 septembrie 2026): fara
   manifest si meta-urile Apple, pictograma deschidea Safari, cu bara lui
   peste meniul de jos. Testul tine la un loc cele trei piese care fac
   modul „aplicatie" sa mearga: viewport-fit=cover (altfel
   env(safe-area-inset-bottom) e 0 si bara de navigare intra sub bara de
   acasa a iPhone-ului), manifestul cu display: standalone si pictogramele
   pe disc, si bara de navigare (.nav-jos) asezata cu safe-area in calcul. */

const R = process.cwd();
const html = readFileSync(resolve(R, "index.html"), "utf8");
const css = readFileSync(resolve(R, "src/styles/pms.css"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(R, "public/manifest.webmanifest"), "utf8"));

describe("PMS ca aplicație pe ecranul de start", () => {
  it("pagina cere ecranul întreg și modul de aplicație", () => {
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<meta name="theme-color"');
  });

  it("manifestul deschide aplicația fără browser în jur, cu pictogramele pe disc", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const i of manifest.icons) {
      expect(existsSync(resolve(R, "public", "." + i.src)), i.src).toBe(true);
      expect(i.sizes).toMatch(/^\d+x\d+$/);
    }
  });

  it("bara de jos plutește deasupra barei de acasă și lasă loc conținutului", () => {
    // „DESKTOP LAT" e pomenit și în capul fișierului — se caută de la bară încolo.
    const start = css.indexOf(".ui-noua .nav-jos{");
    const bloc = css.slice(start, css.indexOf("DESKTOP LAT", start));
    expect(bloc).toMatch(/bottom:calc\(\d+px \+ env\(safe-area-inset-bottom\)\)/);
    expect(bloc).toContain(".nav-jos.cu-plus::before");
    expect(bloc).toContain("-webkit-mask-image");
    expect(bloc).toMatch(/\.ui-noua \.content\{ padding-bottom:calc\(\d+px \+ env\(safe-area-inset-bottom\)\)/);
    expect(bloc).toMatch(/\.ui-noua \.toast-host\{ bottom:calc\(\d+px \+ env\(safe-area-inset-bottom\)\)/);
  });
});
