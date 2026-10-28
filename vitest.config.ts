import path from "path";
import { defineConfig } from "vitest/config";

const dataDir = path.join(process.cwd(), ".pgdata-test");

process.env.PG_PORT = "54340";
process.env.PG_PASSWORD = "zann-test-pg";
process.env.PG_DATABASE = "zann_lab";
process.env.PG_DATA_DIR = dataDir;
process.env.PG_USER = "postgres";
process.env.SEED_DEMO = "false";
process.env.SESSION_SECRET = "test-session-secret-value";
process.env.SEED_PASSWORD = "Test-Password-1";
process.env.APP_URL = "http://localhost:3000";
process.env.CRON_SECRET = "test-cron-secret";
delete process.env.DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/close-db.ts"],
    fileParallelism: false,
    testTimeout: 40000,
    hookTimeout: 120000,
    env: {
      PG_PORT: "54340",
      PG_PASSWORD: "zann-test-pg",
      PG_DATABASE: "zann_lab",
      PG_DATA_DIR: dataDir,
      PG_USER: "postgres",
      SEED_DEMO: "false",
      SESSION_SECRET: "test-session-secret-value",
      SEED_PASSWORD: "Test-Password-1",
      APP_URL: "http://localhost:3000",
      CRON_SECRET: "test-cron-secret",
    },
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "./src") },
  },
});
