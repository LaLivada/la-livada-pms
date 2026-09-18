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
   a serverului, formatul YYYYMMDDHHiiss cerut de ei. */
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

export function decripteazaDeLaNetopia({ envKey, data, cipher, iv }, cheiePrivataPem) {
  if (cipher !== "aes-256-cbc") {
    throw new Error(`Cifru neasteptat de la NETOPIA: ${cipher}`);
  }
  const cheieAes = privateDecrypt(
    { key: cheiePrivataPem, padding: constants.RSA_PKCS1_PADDING },
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
