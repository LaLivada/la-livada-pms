// @ts-check
/// <reference path="./node-crypto.d.ts" />
/* Tot ce ține de NETOPIA (API v1, redirect) fără rețea și fără bază de
   date — testabil singur, importat neschimbat din funcțiile edge
   `netopia-start`/`netopia-ipn` (Deno înțelege `node:crypto` la fel ca
   Node, exact ca aici la testare — vezi și src/lib/ip.js pentru
   precedentul de import direct dintr-o funcție edge).

   `Buffer`, spre deosebire de `node:crypto`, NU e global în runtime-ul
   real al funcțiilor Supabase (doar în Node/Vitest) — verificat direct
   pe rezervari.lalivada.ro: fără acest import, `cripteazaPentruNetopia`
   arunca `ReferenceError: Buffer is not defined`, necaptat, exact la
   primul plic real (n-a fost prins de teste, care rulează sub Node). */

import {
  randomBytes, publicEncrypt, privateDecrypt,
  createCipheriv, createDecipheriv, constants, X509Certificate,
} from "node:crypto";
import { Buffer } from "node:buffer";

export function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* XML-ul cererii de plată, versiunea 1 a API-ului NETOPIA — vezi
   docs/netopia-plan.md pentru de ce v1, nu v2. Structura e cea din
   documentația lor (Payment Request Structure); timestamp-ul e ora UTC
   a serverului, formatul YYYYMMDDHHiiss cerut de ei.

   `<ipn_cipher>` spune lui NETOPIA cu ce cifrează RĂSPUNSUL (IPN-ul) —
   fără el, alege singur `rc4`, pe care `decripteazaDeLaNetopia` îl respinge
   corect (nu l-am implementat niciodată). Găsit direct la primul test real
   în sandbox: IPN-ul a ajuns, dar decriptarea a picat cu exact cifrul
   nesolicitat. Nu are legătură cu cifrul din `cripteazaPentruNetopia`
   (ăla e mereu aes-256-cbc, ales de noi, pentru plicul CERERII). */
export function construiesteXmlPlata({
  orderId, semnatura, suma, descriere, notifyUrl, returnUrl,
  client: { email, telefon, prenume, nume }, moneda = "RON",
}) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `<?xml version="1.0" encoding="utf-8"?>
<order type="card" id="${escXml(orderId)}" timestamp="${timestamp}">
<signature>${escXml(semnatura)}</signature>
<invoice currency="${escXml(moneda)}" amount="${Number(suma).toFixed(2)}">
<details>${escXml(descriere)}</details>
<contact_info>
<billing type="person">
<first_name>${escXml(prenume)}</first_name>
<last_name>${escXml(nume)}</last_name>
<email>${escXml(email)}</email>
<mobile_phone>${escXml(telefon)}</mobile_phone>
</billing>
</contact_info>
</invoice>
<ipn_cipher>aes-256-cbc</ipn_cipher>
<url>
<confirm>${escXml(notifyUrl)}</confirm>
<return>${escXml(returnUrl)}</return>
</url>
</order>`;
}

/* PKCS1, nu OAEP: e formatul cerut de API-ul v1 NETOPIA (moștenit din
   mobilpay), nu o alegere a noastră — SubtleCrypto din browser nu suportă
   deloc acest padding pentru criptare, de-asta tot fluxul trăiește pe
   server (node:crypto), niciodată în browser.

   `certificatPem` e certificatul X.509 dat de NETOPIA (etichetă
   „CERTIFICATE"), nu o cheie publică („PUBLIC KEY") — trebuie extrasă
   explicit, altfel `publicEncrypt` refuză PEM-ul. Trei încercări reale,
   direct pe rezervari.lalivada.ro, ca să ajungem aici:
     1. certificatul dat neschimbat la `publicEncrypt` — Node îl acceptă
        (OpenSSL extrage singur cheia), Deno nu: „ASN.1 error: ... expecting
        \"PUBLIC KEY\"";
     2. `new X509Certificate(certificatPem).publicKey` dat neschimbat la
        `publicEncrypt` — Node îl acceptă ca KeyObject, Deno nu:
        „TypeError: Invalid key type";
     3. (cea de-aici) acelaşi KeyObject, dar EXPORTAT explicit ca PEM
        („PUBLIC KEY") înainte de a-l da la `publicEncrypt` — singura formă
        pe care ambele rulaje o accept la fel. */
export function cripteazaPentruNetopia(xml, certificatPem) {
  const cheieAes = randomBytes(32);
  const iv = randomBytes(16);
  const cifru = createCipheriv("aes-256-cbc", cheieAes, iv);
  const data = Buffer.concat([cifru.update(xml, "utf8"), cifru.final()]);

  const cheiePublica = certificatPem.includes("BEGIN CERTIFICATE")
    ? new X509Certificate(certificatPem).publicKey.export({ type: "spki", format: "pem" })
    : certificatPem;
  const envKey = publicEncrypt(
    { key: cheiePublica, padding: constants.RSA_PKCS1_PADDING },
    cheieAes,
  );

  return {
    envKey: envKey.toString("base64"),
    data: data.toString("base64"),
    cipher: "aes-256-cbc",
    iv: iv.toString("base64"),
  };
}

/* ---------- cheia privată, în forma pe care o acceptă și Deno ---------- */

/* NETOPIA dă cheia privată a punctului de vânzare în PKCS#1 — antetul
   „BEGIN RSA PRIVATE KEY". Node o primește așa, direct; Deno NU: acolo
   `privateDecrypt` citește doar PKCS#8 și răspunde
   `PKCS#8 ASN.1 error: PEM error: unexpected PEM type label: expecting
   "PRIVATE KEY"`. E exact aceeași asimetrie ca la certificat (vezi
   `cripteazaPentruNetopia` mai sus), doar pe celălalt capăt al plicului.

   A costat o plată reală: 22 septembrie 2026, punct de vânzare nou, cheia
   nouă lipită în PKCS#1 — clientul a plătit, IPN-ul a ajuns, dar n-a putut
   fi descifrat, iar rezervarea a rămas „așteaptă" (netopia_ipn_log id 6).
   Cheia dinainte era din întâmplare PKCS#8, de-aia mersese până atunci.

   Conversia se face pe octeți, nu prin `createPrivateKey`: acela ar cere
   ca runtime-ul să știe deja să citească PKCS#1 — fix ce nu știe Deno.
   PKCS#8 e doar un plic în jurul aceluiași RSAPrivateKey:
     SEQUENCE { INTEGER 0, AlgorithmIdentifier(rsaEncryption), OCTET STRING } */
const ALGORITM_RSA = Buffer.from("300d06092a864886f70d0101010500", "hex");
const VERSIUNE_PKCS8 = Buffer.from([0x02, 0x01, 0x00]);

/* Lungime DER: sub 128 pe un octet, peste — un octet de număr, apoi cifrele. */
function lungimeDer(n) {
  if (n < 0x80) return Buffer.from([n]);
  const octeti = [];
  for (let x = n; x > 0; x >>>= 8) octeti.unshift(x & 0xff);
  return Buffer.from([0x80 | octeti.length, ...octeti]);
}

const derDinPem = (pem) =>
  Buffer.from(String(pem).replace(/-----[^-]*-----/g, "").replace(/\s+/g, ""), "base64");

const pemDinDer = (der, eticheta) =>
  `-----BEGIN ${eticheta}-----\n${
    (der.toString("base64").match(/.{1,64}/g) || []).join("\n")
  }\n-----END ${eticheta}-----\n`;

export function cheiePrivataPkcs8(pem) {
  const text = String(pem ?? "");
  /* Deja PKCS#8, sau criptată cu parolă (antetele `Proc-Type`/`DEK-Info` nu
     se pot desface aici) — o lăsăm neatinsă, să vorbească runtime-ul. */
  if (!/BEGIN RSA PRIVATE KEY/.test(text) || /ENCRYPTED|DEK-Info/.test(text)) return text;
  const interior = derDinPem(text);
  const octetString = Buffer.concat([
    Buffer.from([0x04]), lungimeDer(interior.length), interior,
  ]);
  const corp = Buffer.concat([VERSIUNE_PKCS8, ALGORITM_RSA, octetString]);
  return pemDinDer(
    Buffer.concat([Buffer.from([0x30]), lungimeDer(corp.length), corp]),
    "PRIVATE KEY",
  );
}

export function decripteazaDeLaNetopia({ envKey, data, cipher, iv }, cheiePrivataPem) {
  if (cipher !== "aes-256-cbc") {
    throw new Error(`Cifru neasteptat de la NETOPIA: ${cipher}`);
  }
  const cheieAes = privateDecrypt(
    { key: cheiePrivataPkcs8(cheiePrivataPem), padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(envKey, "base64"),
  );
  const decifru = createDecipheriv("aes-256-cbc", cheieAes, Buffer.from(iv, "base64"));
  const xml = Buffer.concat([decifru.update(Buffer.from(data, "base64")), decifru.final()]);
  return xml.toString("utf8");
}

function extrage(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/* Interpretează IPN-ul decriptat (structura din NETOPIA API v1 —
   Payment Response Structure). Extragere cu regex, nu parser XML: doar
   patru câmpuri fixe, cunoscute dinainte — un parser complet ar fi
   greutate pentru nimic. */
export function interpreteazaRaspunsIpn(xml) {
  const orderIdM = xml.match(/<order[^>]*\bid="([^"]*)"/);
  const eroareM = xml.match(/<error\s+code="([^"]*)"[^>]*>([\s\S]*?)<\/error>/);
  const sumaText = extrage(xml, "processed_amount");
  return {
    orderId: orderIdM ? orderIdM[1] : null,
    actiune: extrage(xml, "action"),
    codEroare: eroareM ? eroareM[1] : null,
    mesajEroare: eroareM ? eroareM[2] : null,
    ntpId: extrage(xml, "purchase"),
    sumaProcesata: sumaText ? Number(sumaText) : null,
  };
}

/* Răspunsul cerut de NETOPIA la fiecare IPN (Merchant's Response). Fără
   `eroare`, doar mesajul — cu `eroare`, atributele error_type/error_code
   care le spun dacă să reîncerce trimiterea. */
export function raspunsAckXml(mesaj, eroare) {
  const atribute = eroare ? ` error_type="${eroare.tip}" error_code="${eroare.cod}"` : "";
  return `<?xml version="1.0" encoding="utf-8" ?>\n<crc${atribute}>${escXml(mesaj)}</crc>`;
}
