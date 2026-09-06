/* Sarma intinsa peste codul QR al retelei.
 *
 * QR-ul e fisier static, generat o data (scripts/wifi-qr.mjs) pentru un nume
 * de retea anume. Daca se schimba numele in continut.js si nu se regenereaza
 * fisierul, nimic nu se strica vizibil: butonul se deschide, imaginea apare,
 * doar ca telefonul care o scaneaza cauta o retea care nu mai exista.
 *
 * De aceea numele e scris si aici. Testul nu verifica desenul — il verifica
 * scriptul, la generare, decodand inapoi ce a scris — ci faptul ca nimeni
 * n-a schimbat reteaua uitand de imagine. */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WIFI } from "./guest/continut.js";

/* Calea se face din cwd, nu din `new URL(..., import.meta.url)`.
   Tiparul acela e recunoscut de Vite drept referinta la un asset: il
   rezolva la build si il inlocuieste cu continutul fisierului ca `data:`,
   deci testul ar fi primit imaginea in loc de o cale. Vitest ruleaza cu
   radacina proiectului drept cwd. */
const CALE = join(process.cwd(), "public-guest", "wifi-qr.svg");

describe("codul QR al retelei", () => {
  it("e generat pentru reteaua din continut.js", () => {
    // S-a schimbat numele retelei? Atunci ruleaza:
    //   npm i --no-save qrcode jsqr sharp && node scripts/wifi-qr.mjs
    // si adu numele nou aici.
    expect(WIFI.retea).toBe("La Livada WiFi");
  });

  it("fisierul exista si e un SVG", () => {
    expect(existsSync(CALE)).toBe(true);
    const svg = readFileSync(CALE, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    // Un QR are o matrice patrata; viewBox-ul trebuie sa fie patrat.
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) || [];
    expect(w).toBe(h);
  });

  it("nu are camp de parola nicaieri", () => {
    // Reteaua e deschisa. Daca vreodata capata parola, ea nu are ce cauta
    // intr-un bundle public — nici in continut.js, nici in QR.
    expect(WIFI.parola).toBeUndefined();
  });
});
