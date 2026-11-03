import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { migrateDatabase } = await import("../src/lib/db/migrate");
  await migrateDatabase();
  const { getSql, closeSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  const [row] = await sql<{ total: number; chat: number }[]>`
    select count(*)::int as total,
           count(*) filter (where notification_type = 'chat_message')::int as chat
    from notifications
  `;
  console.log(`notifications total=${row?.total ?? 0} chat=${row?.chat ?? 0}`);
  await closeSql();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
