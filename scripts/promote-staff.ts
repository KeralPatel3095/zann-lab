import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { migrateDatabase } = await import("../src/lib/db/migrate");
  await migrateDatabase();
  const { seedLabEmployees } = await import("../src/lib/db/employees");
  await seedLabEmployees();
  const { getSql, closeSql } = await import("../src/lib/db/sql");
  const sql = await getSql();
  const people = await sql<{ email: string; role: string; title: string }[]>`
    select email, role::text as role, job_title as title
    from profiles
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
  for (const person of people) {
    console.log(`${person.email} role=${person.role} title=${person.title}`);
  }
  await closeSql();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
