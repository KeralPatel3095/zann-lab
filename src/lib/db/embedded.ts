import fs from "fs";
import path from "path";

export type EmbeddedConfig = {
  port: number;
  password: string;
  databaseDir: string;
  database: string;
  user: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instance: any = null;
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

/** Hosted platforms must use DATABASE_URL — never spawn embedded Postgres. */
export function usesEmbeddedDatabase() {
  if (process.env.DATABASE_URL) return false;
  if (process.env.NETLIFY === "true") return false;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return true;
}

export async function ensureEmbeddedPostgres() {
  if (!usesEmbeddedDatabase()) return;
  if (!starting) starting = startEmbedded();
  await starting;
}

async function startEmbedded() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
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
