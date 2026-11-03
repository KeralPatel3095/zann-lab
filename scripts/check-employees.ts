import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { bootDatabase } = await import("../src/lib/db/boot");
  await bootDatabase();
  const { verifyLocalLogin } = await import("../src/lib/auth/login");
  const user = await verifyLocalLogin("keral.patel@zann-lab.test", "KeralPatel@sept");
  console.log(user ? `login ok ${user.fullName}` : "login fail");
  const { getSql, closeSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  const people = await sql<{ email: string }[]>`
    select email from profiles
    where email in (
      'keral.patel@zann-lab.test',
      'ana.bogdanovic@zann-lab.test',
      'ned.bogdanovic@zann-lab.test',
      'zoca.bogdanovic@zann-lab.test',
      'parneet.kaur@zann-lab.test',
      'negar.qureshi@zann-lab.test'
    )
    order by email
  `;
  console.log(`staff=${people.length}`);
  const tables = await sql<{ chat: string | null }[]>`select to_regclass('public.chat_messages')::text as chat`;
  console.log(`chat_messages=${tables[0]?.chat ?? "missing"}`);
  await closeSql();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
