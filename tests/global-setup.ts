import path from "path";

export async function setup() {
  process.env.PG_PORT = "54340";
  process.env.PG_PASSWORD = "zann-test-pg";
  process.env.PG_DATABASE = "zann_lab";
  process.env.PG_DATA_DIR = path.join(process.cwd(), ".pgdata-test");
  process.env.PG_USER = "postgres";
  process.env.SEED_DEMO = "false";
  process.env.SESSION_SECRET = "test-session-secret-value";
  delete process.env.DATABASE_URL;
  const { migrateDatabase } = await import("../src/lib/db/migrate");
  const { seedReferenceData } = await import("../src/lib/db/reference");
  await migrateDatabase();
  await seedReferenceData();
}
