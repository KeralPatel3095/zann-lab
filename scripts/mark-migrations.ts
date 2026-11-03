import fs from "fs";
import path from "path";
import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { getSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  await sql.unsafe(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await sql`
      insert into schema_migrations (version) values (${file})
      on conflict (version) do nothing
    `;
  }
  const rows = await sql<{ version: string }[]>`select version from schema_migrations order by version`;
  console.log(`Marked migrations: ${rows.length}`);
  for (const row of rows) console.log(` - ${row.version}`);
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
