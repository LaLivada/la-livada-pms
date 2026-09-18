/* Paznicii plății cu cardul (NETOPIA).
 *
 * Funcțiile edge și SQL-ul nu se pot rula în vitest — se verifică pe viu, cu
 * `execute_sql` și cu o plată de probă. Dar câteva dintre greșelile găsite la
 * revizia finală au fost greșeli de FORMĂ, vizibile în sursă, și fiecare
 * dintre ele costa bani sau încredere:
 *
 *   · emailul de confirmare spunea „plata se face la sosire" cuiva care
 *     plătise deja online;
 *   · `paid` (pre-autorizare, încă necapturată) era tratat drept plată
 *     încasată;
 *   · notificările plecau cu `fetch(...).catch(...)` neaşteptat, deci
 *     izolatul Deno putea fi oprit înainte ca ele să apuce să plece;
 *   · auditul brut se scria pentru orice cerere, de la oricine;
 *   · suma încasată nu era comparată niciodată cu cea datorată.
 *
 * Testul citește sursele ca text, exact ca src/cors-functii.test.js: nu
 * dovedește că funcția merge, dar oprește întoarcerea fiecărei greșeli.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sursa = (...p) => readFileSync(join(...p), "utf8");
const ipn = sursa("supabase", "functions", "netopia-ipn", "index.ts");
const email = sursa("supabase", "functions", "booking-email", "index.ts");
const aviz = sursa("supabase", "functions", "netopia-refund-notice", "index.ts");
const schema = sursa("schema.sql");
const app = sursa("src", "booking", "App.jsx");

describe("netopia-ipn", () => {
  it("nu confirmă pe `paid` — aia e doar o pre-autorizare", () => {
    const m = ipn.match(/const ACTIUNI_SUCCES = new Set\(\[([^\]]*)\]\)/);
    expect(m, "ACTIUNI_SUCCES nu mai există în sursă").toBeTruthy();
    expect(m[1]).toContain('"confirmed"');
    expect(m[1]).not.toContain('"paid"');
  });

  it("nu lasă nicio notificare pe drum: fiecare fetch e așteptat", () => {
    const toate = ipn.match(/fetch\(/g) || [];
    const asteptate = ipn.match(/await fetch\(/g) || [];
    expect(toate.length).toBeGreaterThan(0);
    expect(asteptate.length).toBe(toate.length);
    expect(ipn).not.toMatch(/\)\s*\.catch\(/);
  });

  it("scrie în audit doar cererile care au forma unui plic NETOPIA", () => {
    const poarta = ipn.search(/!campuri\.env_key[\s\S]{0,120}!campuri\.cipher/);
    const insert = ipn.search(/from\("netopia_ipn_log"\)\s*\n?\s*\.insert\(/);
    expect(poarta).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(poarta).toBeLessThan(insert);
  });

  it("taie rândurile vechi din audit, ca tabela să nu crească la nesfârșit", () => {
    expect(ipn).toMatch(/from\("netopia_ipn_log"\)\s*\.delete\(\)/);
    expect(ipn).toContain("ZILE_AUDIT");
  });

  it("consemnează o sumă nepotrivită ca EROARE, nu ca „ok”", () => {
    expect(ipn).toMatch(/status === "suma_incorecta"/);
    expect(ipn).toMatch(/incheie\(\s*"eroare",\s*\n?\s*`Sumă incorectă/);
  });
});

describe("booking-email", () => {
  it("nu-i spune „plata la sosire” cuiva care a plătit cu cardul", () => {
    /* O dată în șablonul HTML, o dată în cel text — ambele propoziții despre
       plată trebuie să depindă de metoda de plată. */
    const ramuri = email.match(/d\.metodaPlata === "card"/g) || [];
    expect(ramuri.length).toBe(2);
    /* Textul vechi mai există, dar numai ca ramura de cash/transfer a unei
       condiții — nu singur, cum era. Fiecare apariție are un
       `d.metodaPlata === "card"` la câteva rânduri înaintea ei. */
    for (const bucata of ["Plata se face la sosire", "(plata la sosire)"]) {
      const i = email.indexOf(bucata);
      expect(i, `${bucata} a dispărut de tot`).toBeGreaterThan(-1);
      const vecinatate = email.slice(Math.max(0, i - 300), i);
      expect(vecinatate, `${bucata} nu mai stă pe o ramură după metoda de plată`)
        .toContain('d.metodaPlata === "card"');
    }
  });
});

describe("netopia-refund-notice", () => {
  it("dă suma cu bani — cifra o tastează un om în formularul de rambursare", () => {
    expect(aviz).toContain("maximumFractionDigits: 2");
    expect(aviz).not.toContain("maximumFractionDigits: 0");
  });

  it("nu scrie „minus prima noapte” la o rambursare integrală", () => {
    expect(aviz).toMatch(/d\.status === "expired"/);
    expect(aviz).toContain("De rambursat (integral");
    expect(aviz).toContain("De rambursat (minus prima noapte");
  });
});

describe("App.jsx (ecranul de confirmare)", () => {
  it("nu-i spune „plata la sosire” cuiva a cărui plată cu cardul s-a confirmat", () => {
    /* Găsit pe viu, la primul test complet în sandbox: rezervarea ajunsese
       "confirmed" prin card, dar ecranul cădea pe ramura implicită, scrisă
       pentru cash/transfer, și spunea unui oaspete care tocmai plătise că
       "plata se face la sosire". */
    const i = app.indexOf("Plata se face la sosire");
    expect(i, "textul a dispărut de tot").toBeGreaterThan(-1);
    const vecinatate = app.slice(Math.max(0, i - 900), i);
    expect(vecinatate, "textul nu mai stă pe o ramură după metoda de plată")
      .toContain('confirmare.metodaPlata === "card"');
  });
});

describe("confirm_card_payment (schema.sql)", () => {
  it("refuză să confirme o sumă care nu e cea datorată", () => {
    expect(schema).toMatch(/abs\(v_b\.total_amount - p_amount\) > 0\.01/);
    expect(schema).toContain("'suma_incorecta'");
  });

  it("nu mai pomenește un câmp care nu există (`already_paid_but`)", () => {
    expect(schema).not.toContain("already_paid_but");
    expect(schema).toContain("platitDupaAnulare");
  });
});
