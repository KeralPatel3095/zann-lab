import postgres from "postgres";
import { embeddedConfig, ensureEmbeddedPostgres, usesEmbeddedDatabase } from "./embedded";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql<Record<string, never>>;

const dateType = {
  to: 1082,
  from: [1082],
  serialize: (value: string) => value,
  parse: (value: string) => value,
};

const globalSql = globalThis as unknown as { __zannSql?: Sql };

export async function closeSql() {
  const sql = globalSql.__zannSql;
  if (!sql) return;
  globalSql.__zannSql = undefined;
  await sql.end({ timeout: 1 });
}

export async function getSql(): Promise<Sql> {
  await ensureEmbeddedPostgres();
  if (!globalSql.__zannSql) {
    const options = {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      prepare: false,
      types: { date: dateType },
      onnotice: () => undefined,
    };
    globalSql.__zannSql = usesEmbeddedDatabase()
      ? postgres({
          ...options,
          host: "127.0.0.1",
          port: embeddedConfig().port,
          database: embeddedConfig().database,
          username: embeddedConfig().user,
          password: embeddedConfig().password,
        })
      : postgres(process.env.DATABASE_URL as string, options);
    await waitForConnection(globalSql.__zannSql);
  }
  return globalSql.__zannSql;
}

async function waitForConnection(sql: Sql) {
  let last: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await sql`select 1 as ok`;
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw last instanceof Error ? last : new Error("PostgreSQL did not accept connections");
}

export async function withUser<T>(
  userId: string,
  run: (tx: Tx) => Promise<T>,
  options?: { scheduling?: boolean },
): Promise<T> {
  const sql = await getSql();
  return sql.begin(async (tx) => {
    await tx.unsafe("set local role zann_app");
    await tx.unsafe("set local search_path = public, app");
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.scheduling', ${options?.scheduling ? "on" : "off"}, true)`;
    const [row] = await tx<{ current_user: string }[]>`select current_user`;
    if (row?.current_user !== "zann_app") {
      throw new Error("Database role was not restricted");
    }
    return run(tx as unknown as Tx);
  }) as Promise<T>;
}

export function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known = [
    "Not allowed",
    "Required checklist",
    "Quality control",
    "Case cannot be marked dispatched",
    "Assignee is outside",
    "Front desk cannot",
    "Technicians cannot",
    "Restricted clinic identity",
    "Notifications cannot be rewritten",
    "Invalid notification",
    "duplicate key",
  ];
  if (known.some((prefix) => message.includes(prefix))) {
    if (message.includes("duplicate key") && message.includes("case_number")) {
      return "A case with that case number already exists.";
    }
    if (message.includes("duplicate key")) return "That record already exists.";
    const cleaned = message.split("\n")[0]?.replace(/^.*ERROR:\s*/, "") ?? "The request was rejected.";
    return cleaned;
  }
  if (message.includes("cases_case_number_idx")) return "A case with that case number already exists.";
  return "The request could not be completed.";
}
