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
          Permanent free sync: an Apps Script inside your sheet pushes data to the lab every ~15 minutes. No Google Cloud
          billing.
        </p>
      </header>
      {feedback ? <p className="lab-card p-4 text-sm">{feedback}</p> : null}

      <section className="lab-card grid gap-2 p-5 text-sm">
        <h2 className="text-lg">Permanent setup (do once)</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Open the tracker Google Sheet → <strong>Extensions → Apps Script</strong>.</li>
          <li>
            Delete old code. Paste everything from <code>docs/google-apps-script-bridge.js</code> (secret is already filled).
          </li>
          <li>
            <strong>Deploy → New deployment → Web app</strong> (or Manage deployments → pencil → <strong>New version</strong>).
          </li>
          <li>
            Execute as: <strong>Me</strong>. Who has access: <strong>Anyone</strong>. Deploy and allow permissions.
          </li>
          <li>
            Test the URL in a browser — you must see JSON starting with <code>{`{"ok":true`}</code>.
          </li>
          <li>Paste that full URL (with <code>?key=…</code>) below → <strong>Save and sync</strong>.</li>
        </ol>
      </section>

      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Apps Script URL</h2>
        <label>
          Web app URL
          <input
            name="sheet_url"
            defaultValue={status.url}
            placeholder="https://script.google.com/macros/s/.../exec?key=..."
          />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>

      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Emergency Excel upload</h2>
        <p className="text-sm">Only if the bridge is down. Not the permanent day-to-day path.</p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Upload once</button>
      </form>
    </div>
  );
}
