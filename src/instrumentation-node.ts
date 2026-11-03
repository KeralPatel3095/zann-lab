export async function registerNode() {
  const { loadEnvFiles } = await import("./lib/env");
  loadEnvFiles();
  // Hosted Netlify/serverless: never migrate/seed/spawn embedded Postgres here.
  // Schema + staff are applied once via Supabase SQL + `npm run setup`.
  if (process.env.DATABASE_URL || process.env.NETLIFY === "true") {
    return;
  }
  try {
    const { bootDatabase } = await import("./lib/db/boot");
    await bootDatabase();
  } catch (error) {
    console.error("Local database boot failed", error);
  }
}
