import { loadEnvFiles } from "../env";

async function main() {
  loadEnvFiles();
  const { migrateDatabase } = await import("./migrate");
  const { getSql } = await import("./sql");
  await migrateDatabase();
  const { seedReferenceData } = await import("./reference");
  const { seedDemo } = await import("./demo");
  await seedReferenceData();
  await seedDemo();
  const sql = await getSql();
  const [row] = await sql<{ version: string }[]>`select version()`;
  console.log(`Database ready: ${row?.version ?? "unknown"}`);
  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});