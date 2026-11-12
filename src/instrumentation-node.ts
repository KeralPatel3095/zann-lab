export async function registerNode() {
  const { loadEnvFiles } = await import("./lib/env");
  loadEnvFiles();
  // Hosted Netlify/serverless: never migrate/seed/spawn embedded Postgres here.
  // Schema + staff are applied once via Supabase SQL + `npm run setup`.
  // A long-running host with DATABASE_URL still pulls the Google Sheet on a timer.
  if (process.env.NETLIFY === "true") return;
  if (process.env.DATABASE_URL) {
    const { startTrackerSync } = await import("./lib/db/boot");
    startTrackerSync();
    return;
  }
  try {
    const { bootDatabase } = await import("./lib/db/boot");
    await bootDatabase();
  } catch (error) {
    console.error("Local database boot failed", error);
  }
}
