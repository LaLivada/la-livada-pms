// @ts-check
// src/netopia.test.js
import { describe, it, expect } from "vitest";
import {
  generateKeyPairSync, randomBytes, createCipheriv, publicEncrypt, constants,
} from "node:crypto";
import {
  escXml, construiesteXmlPlata, cripteazaPentruNetopia, decripteazaDeLaNetopia,
  interpreteazaRaspunsIpn, raspunsAckXml, cheiePrivataPkcs8,
} from "./lib/netopia.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("escXml", () => {
  it("scapă caracterele XML speciale", () => {
    expect(escXml(`Popescu & "Ion" <test>`)).toBe("Popescu &amp; &quot;Ion&quot; &lt;test&gt;");
  });
  it("nu cade pe null/undefined", () => {
    expect(escXml(null)).toBe("");
    expect(escXml(undefined)).toBe("");
  });
});

describe("construiesteXmlPlata", () => {
  it("include toate câmpurile, scăpate corect", () => {
    const xml = construiesteXmlPlata({
      orderId: "pb-123", semnatura: "XXXX-XXXX", suma: 450.5,
      descriere: "Cazare & mic dejun", notifyUrl: "https://x.test/ipn",
      returnUrl: "https://x.test/reveniere",
      client: { email: "ion@test.ro", telefon: "+40722000000", prenume: "Ion", nume: "Popescu" },
    });
    expect(xml).toContain('id="pb-123"');
    expect(xml).toContain("<signature>XXXX-XXXX</signature>");
    expect(xml).toContain('amount="450.50"');
    expect(xml).toContain("Cazare &amp; mic dejun");
    expect(xml).toContain("<first_name>Ion</first_name>");
    expect(xml).toContain("<confirm>https://x.test/ipn</confirm>");
    expect(xml).toContain("<return>https://x.test/reveniere</return>");
  });

  it("cere explicit aes-256-cbc pentru IPN — fără el, NETOPIA alege rc4", () => {
    const xml = construiesteXmlPlata({
      orderId: "pb-123", semnatura: "XXXX-XXXX", suma: 100,
      descriere: "test", notifyUrl: "https://x.test/ipn", returnUrl: "https://x.test/reveniere",
      client: { email: "ion@test.ro", telefon: "+40722000000", prenume: "Ion", nume: "Popescu" },
    });
    expect(xml).toContain("<ipn_cipher>aes-256-cbc</ipn_cipher>");
  });
});

describe("cripteazaPentruNetopia / decripteazaDeLaNetopia", () => {
  it("fac dus-întors: ce se criptează cu cheia publică se decriptează cu cea privată", () => {
    const xmlOriginal = "<order><test>măr, țărână, cameră</test></order>";
    const plic = cripteazaPentruNetopia(xmlOriginal, publicKey);
    expect(plic.cipher).toBe("aes-256-cbc");
    expect(typeof plic.envKey).toBe("string");
    expect(typeof plic.iv).toBe("string");
    const decriptat = decripteazaDeLaNetopia(plic, privateKey);
    expect(decriptat).toBe(xmlOriginal);
  });

  it("respinge un cifru neașteptat", () => {
    expect(() => decripteazaDeLaNetopia({ envKey: "x", data: "y", cipher: "rc4", iv: "z" }, privateKey))
      .toThrow(/Cifru neasteptat/);
  });
});

describe("interpreteazaRaspunsIpn", () => {
  it("extrage acțiunea, eroarea și identificatorul NETOPIA dintr-un IPN reușit", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<order type="card" id="pb-123" timestamp="20260918120000">
<mobilpay timestamp="20260918120005" crc="ABCDE">
<action>confirmed</action>
<purchase>7788990011</purchase>
<original_amount>450.50</original_amount>
<processed_amount>450.50</processed_amount>
<error code="0">Approved</error>
</mobilpay>
</order>`;
    expect(interpreteazaRaspunsIpn(xml)).toEqual({
      orderId: "pb-123", actiune: "confirmed", codEroare: "0", mesajEroare: "Approved",
      ntpId: "7788990011", sumaProcesata: 450.5,
    });
  });

  it("recunoaște o anulare, fără câmpurile opționale", () => {
    const xml = `<order id="pb-999"><mobilpay><action>canceled</action><error code="17">Card incorect</error></mobilpay></order>`;
    const r = interpreteazaRaspunsIpn(xml);
    expect(r.actiune).toBe("canceled");
    expect(r.codEroare).toBe("17");
    expect(r.ntpId).toBeNull();
  });
});

describe("raspunsAckXml", () => {
  it("fără eroare, doar mesajul", () => {
    expect(raspunsAckXml("ok")).toBe('<?xml version="1.0" encoding="utf-8" ?>\n<crc>ok</crc>');
  });
  it("cu eroare, include atributele", () => {
    expect(raspunsAckXml("nu am gasit rezervarea", { tip: 2, cod: 404 }))
      .toBe('<?xml version="1.0" encoding="utf-8" ?>\n<crc error_type="2" error_code="404">nu am gasit rezervarea</crc>');
  });
});

/* Cheia privată a punctului de vânzare vine de la NETOPIA în PKCS#1
   („BEGIN RSA PRIVATE KEY"). Node o citește așa; Deno, unde rulează de
   fapt funcția edge, cere PKCS#8 — vezi comentariul din lib/netopia.js.
   Testele de aici rulează sub Node, deci NU pot reproduce refuzul lui
   Deno; ce pot dovedi, și dovedesc, e că plicul pe care îl construim e
   byte-identic cu PKCS#8-ul pe care l-ar scrie chiar Node. */
describe("cheiePrivataPkcs8 — PKCS#1 → PKCS#8", () => {
  const pereche = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pkcs1 = pereche.privateKey.export({ type: "pkcs1", format: "pem" });
  const pkcs8 = pereche.privateKey.export({ type: "pkcs8", format: "pem" });

  const octeti = (pem) =>
    Buffer.from(String(pem).replace(/-----[^-]*-----/g, "").replace(/\s+/g, ""), "base64");

  it("scoate exact DER-ul pe care îl scrie Node pentru aceeași cheie", () => {
    expect(octeti(cheiePrivataPkcs8(pkcs1)).equals(octeti(pkcs8))).toBe(true);
  });

  it("pune eticheta pe care o cere Deno", () => {
    expect(cheiePrivataPkcs8(pkcs1)).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(cheiePrivataPkcs8(pkcs1)).toMatch(/-----END PRIVATE KEY-----\n$/);
  });

  it("nu atinge o cheie deja în PKCS#8", () => {
    expect(cheiePrivataPkcs8(pkcs8)).toBe(pkcs8);
  });

  it("nu atinge o cheie protejată cu parolă — acolo n-avem ce desface", () => {
    const cuParola = pereche.privateKey.export({
      type: "pkcs1", format: "pem", cipher: "aes-256-cbc", passphrase: "x",
    });
    expect(cheiePrivataPkcs8(cuParola)).toBe(cuParola);
  });

  it("plicul chiar se deschide cu cheia convertită — drumul întreg", () => {
    /* Exact schimbul cu NETOPIA: ei criptează cu certificatul, noi
       descifrăm cu cheia privată. */
    const cheiePublica = pereche.publicKey.export({ type: "spki", format: "pem" });
    const cheieAes = randomBytes(32);
    const iv = randomBytes(16);
    const xml = "<order id=\"proba\"><action>confirmed</action></order>";
    const cifru = createCipheriv("aes-256-cbc", cheieAes, iv);
    const data = Buffer.concat([cifru.update(xml, "utf8"), cifru.final()]);
    const envKey = publicEncrypt(
      { key: cheiePublica, padding: constants.RSA_PKCS1_PADDING }, cheieAes);

    const iesit = decripteazaDeLaNetopia({
      envKey: envKey.toString("base64"), data: data.toString("base64"),
      cipher: "aes-256-cbc", iv: iv.toString("base64"),
    }, pkcs1);            // ← cheia NECONVERTITĂ, așa cum vine de la ei
    expect(iesit).toBe(xml);
  });
});
