/* Exporta migratiile APLICATE pe proiectul live (tabela
 * supabase_migrations.schema_migrations) in supabase/migrations/, cate un
 * fisier <version>_<name>.sql — conventia CLI-ului Supabase, deci
 * `supabase db push` le poate reda pe un proiect nou, in aceeasi ordine.
 *
 * De ce: pana pe 13 septembrie 2026 repo-ul avea doar schema.sql (oglinda
 * intretinuta de mana), iar istoricul real statea doar in baza — vezi
 * docs/audit-2026-09.md, B2, si docs/faza1.md, 2.7. Fisierele se scriu
 * byte cu byte cum sunt in tabela (fara newline adaugat la final), ca
 * md5-ul lor sa se poata compara cu md5(array_to_string(statements, E'\n'))
 * din baza — asa s-a verificat si primul export.
 *
 *   DATABASE_URL='postgresql://...' node scripts/export-migratii.mjs
 *
 * DATABASE_URL e sirul de conectare din Supabase (Settings → Database); nu
 * se pune in repo si nu se scrie in niciun fisier — doar in mediul
 * comenzii, ca la backup (.github/workflows/backup.yml). Conexiunea e TLS
 * VERIFICATA cu certificatul autoritatii Supabase, acelasi fisier ca la
 * backup (scripts/prod-ca-2021.crt, sau calea din SUPABASE_CA_CERT) — fara
 * el scriptul se opreste, nu sare peste verificare. Nu modifica nimic in
 * baza: un singur SELECT.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Lipseste DATABASE_URL."); process.exit(2); }
const caCale = process.env.SUPABASE_CA_CERT || new URL("./prod-ca-2021.crt", import.meta.url);
if (!existsSync(caCale)) {
  console.error("Lipseste certificatul CA Supabase (scripts/prod-ca-2021.crt sau SUPABASE_CA_CERT) — vezi .github/workflows/backup.yml.");
  process.exit(2);
}
const dir = new URL("../supabase/migrations/", import.meta.url);
mkdirSync(dir, { recursive: true });

const client = new pg.Client({ connectionString: url, ssl: { ca: readFileSync(caCale, "utf8"), rejectUnauthorized: true } });
await client.connect();
try {
  const { rows } = await client.query(
    "select version, name, array_to_string(statements, E'\\n') as sql from supabase_migrations.schema_migrations order by version");
  let noi = 0;
  for (const r of rows) {
    const cale = new URL(`${r.version}_${r.name}.sql`, dir);
    if (!existsSync(cale)) noi++;
    writeFileSync(cale, r.sql);
  }
  console.log(`${rows.length} migratii in supabase/migrations/ (${noi} noi)`);
} finally {
  await client.end();
}
