import fs from "fs";
import path from "path";
import { loadEnvFiles } from "../src/lib/env";

const intervalMs = Number(process.env.TRACKER_SYNC_INTERVAL_MS ?? 10 * 60 * 1000);

async function syncOnce(label: string) {
  const { syncConfiguredTracker } = await import("../src/lib/domain/tracker-sync");
  const { getSql } = await import("../src/lib/db/sql");
  console.log(`[${new Date().toLocaleString()}] ${label}`);
  await syncConfiguredTracker();
  const sql = await getSql();
  const [row] = await sql<{ setting_value: string }[]>`
    select setting_value from production_settings where setting_key = 'tracker_sync_message'
  `;
  const [count] = await sql<{ n: number }[]>`
    select count(*)::int as n from cases where overall_status = 'in_production' and not historical
  `;
  console.log(`  ${row?.setting_value || "No sync message"}`);
  console.log(`  in_production cases: ${count?.n ?? 0}`);
}

function trackerPath() {
  return process.env.TRACKER_LOCAL_FILE?.trim() || path.join(process.cwd(), "data", "tracker.xlsx");
}

async function main() {
  loadEnvFiles();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point at your live Supabase database in .env.local");
  }

  const filePath = trackerPath();
  console.log("PC → live database tracker sync");
  console.log(`Database: Supabase (DATABASE_URL)`);
  console.log(`Local file: ${filePath}`);
  console.log(`Interval: every ${Math.round(intervalMs / 60000)} minutes (and when the file changes)`);
  console.log("Keep this window open. Ctrl+C to stop.\n");

  if (!fs.existsSync(filePath)) {
    console.log("Waiting for Excel file…");
    console.log("In Google Sheets: File → Download → Microsoft Excel (.xlsx)");
    console.log(`Save/overwrite as: ${filePath}\n`);
  }

  let lastMtime = 0;
  const tick = async (force = false) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`[${new Date().toLocaleString()}] No file yet at ${filePath}`);
        return;
      }
      const mtime = fs.statSync(filePath).mtimeMs;
      if (!force && mtime === lastMtime) return;
      lastMtime = mtime;
      await syncOnce(force ? "Scheduled sync" : "File changed — syncing");
    } catch (error) {
      console.error("Sync failed:", error instanceof Error ? error.message : error);
    }
  };

  await tick(true);
  setInterval(() => {
    void tick(true);
  }, intervalMs);
  setInterval(() => {
    void tick(false);
  }, 15_000);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
