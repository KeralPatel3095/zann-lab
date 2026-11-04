import { requireActorPage } from "@/lib/auth/current";
import { hasBackendAccess } from "@/lib/domain/common";
import { trackerStatus } from "@/lib/domain/tracker-sync";
import { syncTrackerAction, uploadTrackerAction } from "@/server/actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  if (!hasBackendAccess(actor)) return <p>Backend access is required.</p>;
  const notice = (await searchParams).notice;
  const status = await trackerStatus(actor.id);
  const feedback = notice || status.message;
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Live Google Sheet</h1>
        <p className="mt-1 text-sm">
          Your Workspace sheet blocks direct download. Use the free Apps Script bridge below (no Google Cloud billing). The site re-syncs about every 15 minutes.
        </p>
      </header>
      {feedback ? <p className="lab-card p-4 text-sm">{feedback}</p> : null}

      <section className="lab-card grid gap-2 p-5 text-sm">
        <h2 className="text-lg">Setup once (free)</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Open your tracker Google Sheet → <strong>Extensions → Apps Script</strong>.</li>
          <li>
            Delete any sample code. Paste the script from the lab repo file{" "}
            <code>docs/google-apps-script-bridge.js</code>.
          </li>
          <li>
            Change <code>YOUR_SECRET</code> to your Netlify <code>CRON_SECRET</code> value (already set), or any long
            password — then also set Netlify <code>TRACKER_BRIDGE_SECRET</code> to the same value.
          </li>
          <li>
            Click <strong>Deploy → New deployment → Web app</strong>. Execute as: <strong>Me</strong>. Who has access:{" "}
            <strong>Anyone</strong>. Deploy.
          </li>
          <li>Copy the Web app URL. It looks like <code>https://script.google.com/macros/s/…/exec</code>.</li>
          <li>
            Paste below: <code>https://script.google.com/macros/s/…/exec?key=YOUR_SECRET</code> → Save and sync.
          </li>
        </ol>
        <p>
          The sheet itself can stay <strong>Restricted</strong>. Only callers who know the secret key can pull data.
        </p>
      </section>

      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Bridge / sheet link</h2>
        <label>
          Apps Script web app URL (with ?key=…)
          <input
            name="sheet_url"
            defaultValue={status.url}
            placeholder="https://script.google.com/macros/s/.../exec?key=..."
          />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>

      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Backup: upload Excel once</h2>
        <p className="text-sm">Only if the bridge is not ready yet. Not live day-to-day.</p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Upload once</button>
      </form>
    </div>
  );
}
