/* Regenereaza codul QR al retelei de oaspeti: public-guest/wifi-qr.svg
 *
 * De rulat numai cand se schimba numele retelei din src/guest/continut.js.
 * Uneltele nu stau in devDependencies fiindca se folosesc o data la cativa
 * ani; se aduc pe loc:
 *
 *   npm i --no-save qrcode jsqr sharp
 *   node scripts/wifi-qr.mjs
 *
 * Scriptul isi verifica singur rezultatul: rasterizeaza SVG-ul si il
 * decodeaza inapoi. Un QR gresit e mai rau decat niciunul — oaspetele il
 * scaneaza, nu se intampla nimic si conchide ca reteaua e cazuta.
 */
import QRCode from "qrcode";
import jsQR from "jsqr";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { WIFI } from "../src/guest/continut.js";

/* Formatul standard, recunoscut de camera pe iOS si pe Android. „T:nopass"
   e ce spune ca reteaua e deschisa; „P:" gol ramane fiindca unele scannere
   mai vechi il asteapta prezent. */
const PAYLOAD = `WIFI:S:${WIFI.retea};T:nopass;P:;;`;

const svg = await QRCode.toString(PAYLOAD, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 1,
  // Culorile paginii: --g-text pe --g-card. Contrastul ramane cel al unui
  // QR alb-negru, deci scanarea nu are de suferit.
  color: { dark: "#22221f", light: "#fffdf8" },
});

const lat = 512;
const { data } = await sharp(Buffer.from(svg))
  .resize(lat, lat, { kernel: "nearest" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const citit = jsQR(new Uint8ClampedArray(data), lat, lat);
if (citit?.data !== PAYLOAD) {
  console.error("QR-ul nu se decodeaza inapoi la ce s-a scris.");
  console.error("  scris:  ", JSON.stringify(PAYLOAD));
  console.error("  decodat:", JSON.stringify(citit?.data ?? null));
  process.exit(1);
}

writeFileSync(new URL("../public-guest/wifi-qr.svg", import.meta.url), svg);
console.log(`public-guest/wifi-qr.svg scris si verificat — ${JSON.stringify(PAYLOAD)}`);
