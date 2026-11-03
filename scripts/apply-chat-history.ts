import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { migrateDatabase } = await import("../src/lib/db/migrate");
  await migrateDatabase();
  const { getSql, closeSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  const [row] = await sql<{ has_name: number; fn: string | null }[]>`
    select
      (select count(*)::int from information_schema.columns where table_name = 'chat_messages' and column_name = 'sender_name') as has_name,
      (select proname from pg_proc where proname = 'list_team_chat' limit 1) as fn
  `;
  console.log(`sender_name_column=${row?.has_name ?? 0} list_fn=${row?.fn ?? "missing"}`);
  await closeSql();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
