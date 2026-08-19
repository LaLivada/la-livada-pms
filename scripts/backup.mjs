#!/usr/bin/env node
/* Backup al bazei de date, fără Docker și fără PostgreSQL instalat local.
 *
 * De ce există: `supabase db dump` rulează pg_dump într-un container, deci
 * cere Docker Desktop. Pe planul Free nu există niciun backup automat, iar
 * a instala Docker doar pentru asta e disproporționat. Scriptul se
 * conectează direct și scrie un fișier SQL de restaurare.
 *
 * Ce produce: INSERT-uri pentru toate datele, în ordinea dependențelor
 * (cheile străine cer ca părinții să existe înainte). Structura NU e
 * inclusă — ea trăiește în schema.sql, ținut sincronizat cu baza. La o
 * restaurare completă se rulează întâi schema.sql, apoi acest fișier.
 *
 * FOLOSIRE
 *
 *   node scripts/backup.mjs "postgresql://postgres.<ref>:<parola>@<host>:5432/postgres"
 *
 * sau, ca parola să nu rămână în istoricul terminalului:
 *
 *   $env:DATABASE_URL="postgresql://..."   (PowerShell)
 *   node scripts/backup.mjs
 *
 * Fișierul rezultat conține nume, telefoane și adrese de clienți. NU îl
 * lăsa în folderul proiectului și nu îl urca nicăieri public.
 */
import { writeFileSync, readFileSync } from "node:fs";
import pg from "pg";

/* Ordinea contează la restaurare: un rând nu poate referi ceva ce încă nu
   există. Tabelele fără dependențe vin primele.

   Lista e scrisă de mână fiindcă ordinea nu se poate deduce automat fără
   a sorta topologic cheile străine. Riscul: un tabel adăugat mai târziu
   ar lipsi din backup fără ca nimic să se plângă — exact genul de eșec
   care se descoperă abia la restaurare. De aceea `verificaAcoperirea()`
   compară lista cu ce e în bază la fiecare rulare. */
const TABELE = [
  "rooms", "guests", "res_groups",
  "rates", "seasons", "online_pricing_tiers", "app_state", "staff",
  "vat_rates", "products", "payment_methods",
  "billing_customers", "billing_permissions",
  "reservations",
  "folios", "folio_items",
  "invoice_series", "receipt_series",
  "invoices", "invoice_items", "invoice_item_links", "payments",
  "accounting_exports", "accounting_export_items",
  "public_bookings", "booking_attempts",
];

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error(`
Lipsește adresa bazei de date.

  node scripts/backup.mjs "postgresql://postgres.<ref>:<parola>@<host>:5432/postgres"

Adresa se ia din Supabase Dashboard → Project Settings → Database,
secțiunea "Connection string" (varianta cu pooler, portul 5432).
`);
  process.exit(1);
}

/* Transformă o valoare JS în literal SQL. Cazurile speciale contează:
   NULL, ghilimelele din text, array-urile Postgres și obiectele JSONB. */
function literal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) {
    // text[] — se scrie ca ARRAY[...] ca să nu depindem de sintaxa {..}
    if (!v.length) return "'{}'";
    return `ARRAY[${v.map((x) => literal(x)).join(",")}]`;
  }
  if (typeof v === "object") return `${literal(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/* TLS cu verificarea certificatului PORNITĂ, mereu.
 *
 * Prin conexiunea asta trec toate datele clienților. Dezactivarea
 * verificării (`rejectUnauthorized: false`, cum se vede prin multe
 * exemple de pe internet) ar permite cuiva aflat pe traseu să se dea
 * drept baza de date și să le citească. Scriptul nu oferă deloc acea
 * opțiune — nici măcar ca ultimă soluție.
 *
 * Poolerul Supabase prezintă un certificat emis de autoritatea proprie,
 * care nu e în lista implicită a lui Node. Soluția e să-i dăm acel
 * certificat, nu să nu mai verificăm nimic:
 *
 *   Dashboard → Project Settings → Database → SSL Configuration
 *   → Download certificate   (prod-ca-2021.crt)
 *
 * apoi:
 *   node scripts/backup.mjs "<url>" --ca C:\\cale\\prod-ca-2021.crt
 *   sau: $env:SUPABASE_CA_CERT="C:\\cale\\prod-ca-2021.crt"
 */
const idxCa = process.argv.indexOf("--ca");
const caleCa = (idxCa > -1 ? process.argv[idxCa + 1] : null) || process.env.SUPABASE_CA_CERT;

const ssl = { rejectUnauthorized: true };
if (caleCa) {
  try {
    ssl.ca = readFileSync(caleCa, "utf8");
    console.log(`Folosesc certificatul din ${caleCa}\n`);
  } catch {
    console.error(`Nu am putut citi certificatul de la: ${caleCa}`);
    process.exit(1);
  }
}

const client = new pg.Client({ connectionString: url, ssl });

const acum = new Date().toISOString();
const bucati = [
  `-- Backup date La Livada PMS`,
  `-- Generat: ${acum}`,
  `--`,
  `-- Conține DOAR datele. Structura e în schema.sql.`,
  `-- Restaurare pe un proiect gol:`,
  `--   1. rulează schema.sql`,
  `--   2. rulează acest fișier`,
  `--   3. recreează conturile de personal (nu sunt incluse aici)`,
  `--`,
  `-- ATENȚIE: conține date personale ale clienților.`,
  ``,
  `begin;`,
  `set session_replication_role = replica;  -- amână verificarea cheilor străine`,
  ``,
];

/* Un backup care omite tăcut un tabel e mai rău decât niciun backup: dă
   încredere nemeritată, iar lipsa se descoperă abia când e nevoie de el.
   Comparăm lista de mai sus cu ce există în bază și ne oprim dacă apare
   ceva neacoperit — adăugarea în TABELE cere gândire (unde intră în
   ordinea dependențelor?), deci nu o putem face automat. */
async function verificaAcoperirea(client) {
  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`);
  const inBaza = rows.map((r) => r.table_name);
  const lipsa = inBaza.filter((t) => !TABELE.includes(t));

  if (lipsa.length) {
    console.error(`\n✗ Tabele existente în bază dar absente din backup:\n`);
    for (const t of lipsa) console.error(`    ${t}`);
    console.error(`
Backup-ul ar fi fost incomplet, așa că m-am oprit înainte să scriu ceva.
Adaugă-le în lista TABELE din acest script, la poziția corectă față de
cheile lor străine (părinții înaintea copiilor), apoi rulează din nou.`);
    process.exit(1);
  }

  const inPlus = TABELE.filter((t) => !inBaza.includes(t));
  if (inPlus.length) {
    console.log(`Notă: ${inPlus.join(", ")} — în listă, dar nu în bază. Le sar.\n`);
  }
}

let total = 0;
try {
  await client.connect();
  console.log("Conectat. Verific acoperirea…");
  await verificaAcoperirea(client);
  console.log("Toate tabelele sunt acoperite. Citesc…\n");

  for (const tabel of TABELE) {
    let rezultat;
    try {
      rezultat = await client.query(`select * from ${tabel}`);
    } catch (e) {
      // Un tabel care nu există (schemă mai veche) nu trebuie să oprească tot
      console.log(`  ${tabel.padEnd(26)} — sărit (${e.message.split("\n")[0]})`);
      continue;
    }
    const randuri = rezultat.rows;
    console.log(`  ${tabel.padEnd(26)} ${String(randuri.length).padStart(5)} rânduri`);
    total += randuri.length;
    if (!randuri.length) continue;

    const coloane = rezultat.fields.map((f) => f.name);
    bucati.push(`-- ${tabel} (${randuri.length})`);
    for (const r of randuri) {
      const valori = coloane.map((c) => literal(r[c])).join(", ");
      bucati.push(`insert into ${tabel} (${coloane.join(", ")}) values (${valori});`);
    }
    bucati.push("");
  }

  bucati.push(`set session_replication_role = default;`);
  bucati.push(`commit;`);

  const nume = `backup-date-${acum.slice(0, 10)}.sql`;
  writeFileSync(nume, bucati.join("\n"), "utf8");

  console.log(`\n✓ ${total} rânduri salvate în ${nume}`);
  console.log(`\nMUTĂ fișierul în afara proiectului — conține date personale.`);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (/password|authentication/i.test(e.message)) {
    console.error(`\nParola pare greșită. Ia-o din Dashboard → Project Settings → Database.`);
    console.error(`Dacă are caractere ca @ # / : ? &, trebuie codificate în URL.`);
  } else if (/certificate|self.signed|CERT_/i.test(e.message)) {
    console.error(`
Certificatul serverului nu a putut fi verificat.

Poolerul Supabase folosește un certificat emis de autoritatea proprie,
care nu e în lista implicită a lui Node. Nu e semn de atac — dar nici nu
dezactivăm verificarea, fiindcă prin conexiune trec datele clienților.

REZOLVARE — descarcă certificatul Supabase:

  Dashboard -> Project Settings -> Database -> SSL Configuration
  -> Download certificate           (fișierul prod-ca-2021.crt)

apoi rulează din nou, indicând fișierul:

  node scripts/backup.mjs "<url>" --ca "C:\\Users\\...\\prod-ca-2021.crt"

Dacă eroarea persistă CU certificatul dat, atunci conexiunea chiar e
interceptată — de obicei un antivirus sau un proxy de firmă care
inspectează traficul TLS. Atunci se adaugă certificatul acelui program,
nu se ocolește verificarea.`);
  } else if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(e.message)) {
    console.error(`\nNu am ajuns la server. Verifică adresa și conexiunea la internet.`);
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
