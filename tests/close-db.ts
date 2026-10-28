import { afterAll } from "vitest";

afterAll(async () => {
  const { closeSql } = await import("../src/lib/db/sql");
  await closeSql();
});
