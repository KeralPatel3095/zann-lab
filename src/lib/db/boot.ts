import { seedDemo } from "./demo";
import { migrateDatabase } from "./migrate";
import { seedReferenceData } from "./reference";

const state = globalThis as unknown as { __zannBoot?: Promise<void>; __zannTimer?: NodeJS.Timeout };

export function bootDatabase() {
  if (!state.__zannBoot) {
    state.__zannBoot = start();
  }
  return state.__zannBoot;
}

async function start() {
  await migrateDatabase();
  await seedReferenceData();
  await seedDemo();
  if (!state.__zannTimer) {
    const { runReminderJob } = await import("../domain/jobs");
    const run = () => {
      runReminderJob().catch(() => {
        console.error("Reminder job failed");
      });
    };
    run();
    state.__zannTimer = setInterval(run, 15 * 60 * 1000);
    const syncTracker = () => {
      import("../domain/tracker-sync").then(({ syncConfiguredTracker }) => syncConfiguredTracker()).catch(() => {
        console.error("Case tracker sync failed");
      });
    };
    setTimeout(syncTracker, 20_000);
    setInterval(syncTracker, 5 * 60 * 1000);
  }
}
