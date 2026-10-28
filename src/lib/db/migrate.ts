import fs from "fs";
import path from "path";
import { getSql } from "./sql";

export async function migrateDatabase() {
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
    const [existing] = await sql<{ version: string }[]>`
      select version from schema_migrations where version = ${file}
    `;
    if (existing) continue;
    const body = fs.readFileSync(path.join(directory, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (version) values (${file})`;
    });
  }
}
