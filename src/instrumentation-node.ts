export async function registerNode() {
  const { loadEnvFiles } = await import("./lib/env");
  loadEnvFiles();
  const { bootDatabase } = await import("./lib/db/boot");
  await bootDatabase();
}
