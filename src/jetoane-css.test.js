/* Jetoanele CSS chemate trebuie să existe.
 *
 * `color: var(--muted)`, cu un jeton pe care nu-l definește nimeni, nu e o
 * eroare pe care s-o vezi: regula nu pică zgomotos, ci devine „invalidă la
 * calcul", iar proprietatea se întoarce la valoarea moștenită. Textul care
 * trebuia stins arată ca textul din jur și nimeni nu observă ani de zile.
 * Exact asta s-a întâmplat cu `--muted` în fișa de cazare și în ecranul de
 * acces (găsit la migrarea D2, corectat pe 16 septembrie 2026).
 *
 * Testul citește foile de stil, aruncă comentariile și cere ca fiecare
 * `var(--x)` FĂRĂ rezervă să fie definit undeva în aceeași foaie. Scrierea
 * cu rezervă (`var(--beige, #e7dfd1)`) e lăsată în pace intenționat: așa e
 * scris motorul de rezervări, care se poate lipi într-un site care-i dă
 * jetoanele lui, și care arată corect și fără ele.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FOI = [
  "src/styles/pms.css",
  "src/booking/styles.js",
  "src/guest/styles.js",
  "src/ui/schelet-stil.js",
];

/* Jetoane scrise din JS la rulare, deci absente din foaia de stil.
   Fiecare are nevoie de locul care i-l scrie, altfel lista asta devine
   groapa în care se ascund greșelile pe care testul trebuie să le prindă. */
const SCRISE_DIN_JS = {
  "--days": "features/rezervari/calendar.jsx: numărul de zile din grila calendarului",
};

const faraComentarii = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const unice = (v) => [...new Set(v)];

describe("jetoanele CSS chemate exista", () => {
  for (const cale of FOI) {
    it(`${cale}: fiecare var(--x) fara rezerva e definit`, () => {
      const text = faraComentarii(readFileSync(cale, "utf8"));
      /* Fără virgulă înainte de paranteza închisă = fără rezervă. */
      const chemate = unice([...text.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
      const definite = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
      const lipsa = chemate.filter((j) => !definite.has(j) && !(j in SCRISE_DIN_JS));
      expect(lipsa, `jetoane chemate dar nedefinite in ${cale}: ${lipsa.join(", ")}`).toEqual([]);
    });
  }

  it("lista jetoanelor scrise din JS nu creste pe furis", () => {
    /* Dacă adaugi aici ceva, scrie și de unde vine — vezi comentariul. */
    expect(Object.keys(SCRISE_DIN_JS)).toEqual(["--days"]);
  });
});
