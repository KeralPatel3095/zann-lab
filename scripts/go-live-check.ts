/**
 * Prints a go-live readiness summary for the current environment.
 * Does not print secret values.
 */
import { loadEnvFiles } from "../src/lib/env";

function present(name: string) {
  const value = (process.env[name] ?? "").trim();
  return value.length > 0;
}

function status(ok: boolean, label: string, detail: string) {
  console.log(`${ok ? "OK " : "!! "} ${label} — ${detail}`);
}

async function main() {
  loadEnvFiles();
  const production = process.env.NODE_ENV === "production";
  const hostedDb = present("DATABASE_URL");
  console.log(`NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`);
  status(present("SESSION_SECRET"), "SESSION_SECRET", present("SESSION_SECRET") ? "set" : "missing");
  status(present("CRON_SECRET"), "CRON_SECRET", present("CRON_SECRET") ? "set" : "missing");
  status(present("APP_URL"), "APP_URL", process.env.APP_URL || "missing");
  status(hostedDb || !production, "DATABASE_URL", hostedDb ? "hosted Postgres configured" : "using embedded Postgres (local only)");
  status(process.env.SEED_DEMO === "false" || !production, "SEED_DEMO", process.env.SEED_DEMO ?? "unset");
  status(process.env.SHOW_DEV_LOGINS !== "true" || !production, "SHOW_DEV_LOGINS", process.env.SHOW_DEV_LOGINS ?? "unset");
  status(present("EVIDENT_API_KEY") === present("EVIDENT_API_BASE_URL"), "Evident", present("EVIDENT_API_KEY") ? "configured" : "optional / not set");

  if (!hostedDb) {
    console.log("\nFor any Wi-Fi / always-on: create Supabase, set DATABASE_URL, follow docs/GO_LIVE.md");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
