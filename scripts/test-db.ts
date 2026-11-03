import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const postgres = (await import("postgres")).default;
  for (const label of ["ssl-require", "no-ssl"] as const) {
    const sql = postgres(url, {
      max: 1,
      connect_timeout: 15,
      prepare: false,
      ...(label === "ssl-require" ? { ssl: "require" as const } : {}),
    });
    try {
      const rows = await sql`select current_user as u, inet_server_addr()::text as addr`;
      console.log(label, "OK", rows[0]);
    } catch (error) {
      console.log(label, "FAIL", error instanceof Error ? error.message : error);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
