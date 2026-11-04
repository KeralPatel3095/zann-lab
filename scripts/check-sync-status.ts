import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { getSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  const settings = await sql<{ setting_key: string; setting_value: string }[]>`
    select setting_key, setting_value from production_settings
    where setting_key in ('tracker_sheet_url', 'tracker_sync_message')
  `;
  console.log("settings:");
  for (const row of settings) {
    console.log(`  ${row.setting_key}=${row.setting_value.slice(0, 240)}`);
  }
  const [cases] = await sql<{ n: number }[]>`select count(*)::int as n from cases`;
  const [open] = await sql<{ n: number }[]>`
    select count(*)::int as n from cases where overall_status = 'in_production' and not historical
  `;
  console.log("cases total:", cases?.n, "in_production:", open?.n);
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
