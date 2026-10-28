import fs from "fs";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

export type EmbeddedConfig = {
  port: number;
  password: string;
  databaseDir: string;
  database: string;
  user: string;
};

let instance: EmbeddedPostgres | null = null;
let starting: Promise<void> | null = null;

export function embeddedConfig(): EmbeddedConfig {
  return {
    port: Number(process.env.PG_PORT ?? 54329),
    password: process.env.PG_PASSWORD ?? "zann-local-postgres",
    databaseDir: process.env.PG_DATA_DIR ?? path.join(process.cwd(), ".pgdata"),
    database: process.env.PG_DATABASE ?? "zann_lab",
    user: process.env.PG_USER ?? "postgres",
  };
}

export function usesEmbeddedDatabase() {
  return !process.env.DATABASE_URL;
}

export async function ensureEmbeddedPostgres() {
  if (!usesEmbeddedDatabase()) return;
  if (!starting) starting = startEmbedded();
  await starting;
}

async function startEmbedded() {
  const config = embeddedConfig();
  fs.mkdirSync(config.databaseDir, { recursive: true });
  const initialized = fs.existsSync(path.join(config.databaseDir, "PG_VERSION"));
  instance = new EmbeddedPostgres({
    databaseDir: config.databaseDir,
    user: config.user,
    password: config.password,
    port: config.port,
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  });
  if (!initialized) {
    await instance.initialise();
  }
  try {
    await instance.start();
  } catch {
    // The cluster may already be running in another process.
  }
  try {
    await instance.createDatabase(config.database);
  } catch {
    // The application database already exists.
  }
}
