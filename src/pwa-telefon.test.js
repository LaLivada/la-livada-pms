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

  it("bara de jos coboară sub bara de acasă doar puțin și lasă loc conținutului", () => {
    // „DESKTOP LAT" e pomenit și în capul fișierului — se caută de la bară încolo.
    const start = css.indexOf("--nav-jos-sub:");
    const bloc = css.slice(start, css.indexOf("DESKTOP LAT", start));
    /* Pe iPhone (zona sigură de jos: 34px) bara adaugă sub butoane câțiva
       pixeli, nu toată zona: cu toată, sub etichete rămâneau 51px goi
       („spațiul de dedesubt e prea mare", 25 septembrie 2026). */
    const m = bloc.match(/^--nav-jos-sub:max\(0px, calc\(env\(safe-area-inset-bottom\) - (\d+)px\)\);/);
    expect(m, "formula lui --nav-jos-sub").toBeTruthy();
    const adaosPeIphone = 34 - Number(m[1]);
    expect(adaosPeIphone).toBeGreaterThan(0);
    expect(adaosPeIphone).toBeLessThanOrEqual(10);
    expect(bloc).toMatch(/\.ui-noua \.nav-jos\{[^}]*padding:0 [^;]* var\(--nav-jos-sub\) /);
    expect(bloc).toContain(".nav-jos.cu-plus::before");
    expect(bloc).toContain("-webkit-mask-image");
    expect(bloc).toMatch(/\.ui-noua \.content\{ padding-bottom:calc\(\d+px \+ var\(--nav-jos-sub\)\)/);
    expect(bloc).toMatch(/\.ui-noua \.toast-host\{ bottom:calc\(\d+px \+ var\(--nav-jos-sub\)\)/);
  });
});
