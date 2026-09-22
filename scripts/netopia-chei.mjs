/* Verifica local perechea de chei NETOPIA, fara sa trimita nimic nicaieri.
 *
 * DE CE EXISTA. „Decriptarea datelor a esuat!" pe pagina NETOPIA inseamna un
 * singur lucru: plicul nostru a ajuns la ei, dar nu l-au putut deschide. Deci
 * certificatul cu care criptam NU e cel al punctului de vanzare catre care
 * trimitem. Din afara nu se vede care din cele trei secrete e de vina, iar
 * incercarile pe viu costa cate o rezervare de proba de fiecare data.
 *
 * Scriptul face EXACT ce face `cripteazaPentruNetopia` din src/lib/netopia.js
 * (X509 -> cheie publica exportata ca SPKI -> RSA PKCS#1) si apoi descifreaza
 * cu cheia privata, adica rolul lui NETOPIA. Daca proba trece, cele doua
 * fisiere sunt o pereche adevarata; daca pica, sunt din puncte de vanzare sau
 * din medii diferite si nicio repostare nu le impaca.
 *
 * NU AFISEAZA NICIODATA material de cheie — doar verdicte, subiectul
 * certificatului si valabilitatea lui.
 *
 * Folosire:
 *   node scripts/netopia-chei.mjs <public.cer> [<private.key>]
 *
 * Fisierele sunt cele descarcate din admin.netopia-payments.com, de la
 * punctul de vanzare: `*.public.cer` si `*.private.key`. Trebuie sa fie
 * ale ACELUIASI punct si ale aceluiasi mediu (sandbox sau live) — vezi
 * docs/netopia-plan.md, sectiunea Configurarea, pasul 4.
 */
import { readFileSync } from "node:fs";
import {
  X509Certificate, publicEncrypt, privateDecrypt, randomBytes, constants,
} from "node:crypto";

const [, , caleCert, caleCheie] = process.argv;

if (!caleCert) {
  console.error("Folosire: node scripts/netopia-chei.mjs <public.cer> [<private.key>]");
  process.exit(2);
}

/* Cum arata PEM-ul ca text. Un certificat lipit prin campuri de formular
   ajunge uneori cu „\\n" scris pe litere in loc de rand nou — atunci parserul
   pica, iar mesajul lui („unsupported", „ASN.1 error") nu spune de ce. */
function formaPem(text) {
  if (/\\n/.test(text)) return "are „\\n\" scris pe litere, nu randuri adevarate";
  if (!/\r?\n/.test(text.trim())) return "e pe un singur rand, fara randuri noi";
  if (/\r\n/.test(text)) return "are randuri CRLF (acceptabil)";
  return "arata normal";
}

function citeste(cale) {
  try { return readFileSync(cale, "utf8"); }
  catch (e) { console.error(`Nu pot citi ${cale}: ${e.message}`); process.exit(2); }
}

const certText = citeste(caleCert);
console.log(`Certificat: ${caleCert}`);
console.log(`  forma fisierului: ${formaPem(certText)}`);

let cert;
try {
  cert = new X509Certificate(certText);
} catch (e) {
  console.error(`  ✗ nu e un certificat X.509 valid: ${e.message}`);
  console.error("    (daca e un fisier „PUBLIC KEY\", nu „CERTIFICATE\", ia-l din nou din admin)");
  process.exit(1);
}

/* Un certificat poate veni fara subiect (`undefined`, nu sir gol) — nu e o
   eroare in sine, dar atunci nu se poate compara cu semnatura. */
const camp = (v) => (v ? String(v).replace(/\n/g, " · ") : "(gol)");
console.log(`  subiect:   ${camp(cert.subject)}`);
console.log(`  emitent:   ${camp(cert.issuer)}`);
console.log(`  valabil:   ${cert.validFrom} → ${cert.validTo}`);

const acum = Date.now();
if (new Date(cert.validTo).getTime() < acum) {
  console.log("  ✗ EXPIRAT — genereaza altul din punctul de vanzare");
} else if (new Date(cert.validFrom).getTime() > acum) {
  console.log("  ✗ inca nu e valabil (data de start e in viitor)");
} else {
  console.log("  ✓ in termen");
}

/* Exportul explicit ca SPKI e pasul pe care Deno il cere si Node nu —
   il facem si aici, ca proba sa treaca prin acelasi drum ca productia. */
let cheiePublica;
try {
  cheiePublica = cert.publicKey.export({ type: "spki", format: "pem" });
} catch (e) {
  console.error(`  ✗ nu pot exporta cheia publica din certificat: ${e.message}`);
  process.exit(1);
}

if (!caleCheie) {
  console.log("\nCheia privata nu a fost data — am verificat doar certificatul.");
  console.log("Pentru proba de pereche: node scripts/netopia-chei.mjs <public.cer> <private.key>");
  process.exit(0);
}

const cheieText = citeste(caleCheie);
console.log(`\nCheie privata: ${caleCheie}`);
console.log(`  forma fisierului: ${formaPem(cheieText)}`);

/* Proba: criptam un nimic cu certificatul si incercam sa-l descifram cu cheia
   privata. E fix schimbul dintre noi si NETOPIA, jucat in doua roluri. */
const proba = randomBytes(32);
let inapoi;
try {
  const plic = publicEncrypt(
    { key: cheiePublica, padding: constants.RSA_PKCS1_PADDING }, proba);
  inapoi = privateDecrypt(
    { key: cheieText, padding: constants.RSA_PKCS1_PADDING }, plic);
} catch (e) {
  console.log(`  ✗ proba a picat: ${e.message}`);
  console.log("\nVERDICT: cele doua fisiere NU sunt o pereche.");
  console.log("Descarca-le din nou, pe amandoua, de la ACELASI punct de vanzare.");
  process.exit(1);
}

if (!inapoi.equals(proba)) {
  console.log("\nVERDICT: descifrarea a mers, dar a iesit altceva — pereche gresita.");
  process.exit(1);
}

console.log("  ✓ proba a trecut");
console.log("\nVERDICT: certificatul si cheia privata sunt o pereche adevarata.");
console.log("Daca NETOPIA tot spune „Decriptarea datelor a esuat!\", atunci perechea");
console.log("e buna, dar e a ALTUI punct de vanzare sau a altui mediu decat cel catre");
console.log("care trimitem — compara subiectul de mai sus cu NETOPIA_SIGNATURE si");
console.log("verifica NETOPIA_LIVE (doar `true` trimite la secure.mobilpay.ro).");
