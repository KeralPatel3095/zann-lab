import { loadEnvFiles } from "../src/lib/env";

async function main() {
  loadEnvFiles();
  const { seedLabEmployees } = await import("../src/lib/db/employees");
  await seedLabEmployees();
  console.log("ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
