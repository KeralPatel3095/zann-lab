import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { getSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  await sql.unsafe("GRANT zann_app TO postgres");
  console.log("GRANT zann_app TO postgres — done");
  const row = await sql.begin(async (tx) => {
    await tx.unsafe("set local role zann_app");
    const [who] = await tx<{ current_user: string }[]>`select current_user`;
    return who;
  });
  console.log("SET ROLE check", row);
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
