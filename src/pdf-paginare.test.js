/* Unde se rupe un PDF mai lung decât o coală.
 *
 * Până pe 18 septembrie 2026 se tăia la înălțime fixă, adică oriunde. Pe lista
 * de cazare a unui grup de 15 camere, pagina a doua începea cu jumătatea de jos
 * a unui rând — jumătatea de sus rămăsese pe pagina precedentă — iar capul de
 * tabel („# Cameră Ocupant …") se vedea doar pe prima pagină, deci pe a doua nu
 * mai scria ce înseamnă coloanele.
 *
 * `taieturiPagina` e partea care se poate greși în liniște, deci e și partea
 * testată: geometria. Desenarea propriu-zisă (decupatul din canvas) n-are ce
 * face în vitest — jsdom n-are nici așezare, nici canvas.
 */
import { describe, it, expect } from "vitest";
import { taieturiPagina } from "./lib/pdf.js";

/* Un tabel cu rânduri de 90px, primul terminându-se la 100. */
const RANDURI = [100, 190, 280, 370, 460, 550, 640, 730, 820, 910, 1000];

describe("taieturiPagina", () => {
  it("un document cât o pagină rămâne o pagină, întreg", () => {
    expect(taieturiPagina(300, 400, RANDURI, 40))
      .toEqual([{ sus: 0, jos: 300, cap: 0 }]);
  });

  /* Miezul cererii: 400 ar cădea în mijlocul rândului care ține de la 370 la
     460, deci pagina se închide la 370 și a doua începe cu rândul întreg. */
  it("taie la marginea de jos a unui rând, nu la marginea paginii", () => {
    const pagini = taieturiPagina(1000, 400, RANDURI);
    expect(pagini.map((p) => [p.sus, p.jos]))
      .toEqual([[0, 370], [370, 730], [730, 1000]]);
  });

  /* Capul de tabel nu se desenează pe prima pagină — acolo e deja în document,
     la locul lui. Pe următoarele se lipește deasupra și mănâncă din spațiu. */
  it("capul se repetă de la a doua pagină și scade spațiul rămas", () => {
    const pagini = taieturiPagina(1000, 400, RANDURI, 40);
    expect(pagini.map((p) => p.cap)).toEqual([0, 40, 40]);
    /* Pagina 2 are acum doar 360 de spațiu, deci se oprește tot la 730. */
    expect(pagini[1]).toEqual({ sus: 370, jos: 730, cap: 40 });
  });

  it("niciun rând nu se pierde și niciunul nu se ia de două ori", () => {
    for (const [total, pagina, cap] of [[1000, 400, 40], [2500, 333, 0], [905, 400, 25]]) {
      const pagini = taieturiPagina(total, pagina, RANDURI, cap);
      expect(pagini[0].sus).toBe(0);
      expect(pagini[pagini.length - 1].jos).toBe(total);
      for (let i = 1; i < pagini.length; i++) expect(pagini[i].sus).toBe(pagini[i - 1].jos);
      for (const p of pagini) expect(p.cap + p.jos - p.sus).toBeLessThanOrEqual(pagina + 0.5);
    }
  });

  /* Un rând mai înalt decât o coală n-are unde să se rupă frumos. Se taie drept
     — altfel bucla n-ar avansa și am scrie pagini la infinit. */
  it("fără nicio oprire folosibilă taie drept, și se oprește", () => {
    expect(taieturiPagina(1000, 400, [], 0).map((p) => [p.sus, p.jos]))
      .toEqual([[0, 400], [400, 800], [800, 1000]]);
    expect(taieturiPagina(1000, 400, [950]).length).toBe(3);
  });

  /* Un cap care ar mânca jumătate de pagină ar umfla documentul în loc să-l
     facă de citit: mai bine o pagină fără cap decât douăzeci cu. */
  it("un cap prea înalt nu se mai repetă", () => {
    expect(taieturiPagina(1000, 400, RANDURI, 250).map((p) => p.cap)).toEqual([0, 0, 0]);
  });

  it("nu întoarce nimic pe măsuri lipsă", () => {
    expect(taieturiPagina(0, 400, RANDURI)).toEqual([]);
    expect(taieturiPagina(1000, 0, RANDURI)).toEqual([]);
    expect(taieturiPagina(NaN, 400, RANDURI)).toEqual([]);
  });
});
