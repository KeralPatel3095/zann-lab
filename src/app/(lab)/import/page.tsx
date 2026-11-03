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
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "";
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Import cases</h1>
        <p className="mt-1 text-sm">
          For day-to-day live updates, connect the Google Sheet with a service account. The site re-syncs about every 15 minutes, and whenever you click Save and sync.
        </p>
      </header>
      {feedback ? <p className="lab-card p-4 text-sm">{feedback}</p> : null}

      <section className="lab-card grid gap-2 p-5 text-sm">
        <h2 className="text-lg">Live Google Sheet (recommended)</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>In Google Cloud, create a service account and download its JSON key.</li>
          <li>Enable the <strong>Google Drive API</strong> for that project.</li>
          <li>
            In Netlify env vars set <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and{" "}
            <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> (paste the private_key value; keep the{" "}
            <code>\n</code> characters).
          </li>
          <li>
            Share your tracker sheet with that service account email as <strong>Viewer</strong>
            {serviceEmail ? (
              <>
                {" "}
                (currently: <strong>{serviceEmail}</strong>)
              </>
            ) : null}
            .
          </li>
          <li>Paste the sheet link below → Save and sync.</li>
        </ol>
        {!serviceEmail ? (
          <p className="text-amber-800">
            Service account is not configured on this host yet — link sync may fail until those Netlify env vars are set.
          </p>
        ) : (
          <p className="text-teal-900">Service account email is configured on this host.</p>
        )}
      </section>

      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Google Sheet link</h2>
        <label>
          Google Sheet link
          <input name="sheet_url" defaultValue={status.url} placeholder="https://docs.google.com/spreadsheets/d/..." />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>

      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">One-time Excel upload (backup)</h2>
        <p className="text-sm">
          File → Download → Microsoft Excel (.xlsx), then upload here. This does <strong>not</strong> stay live — use the service
          account link above for daily updates.
        </p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Upload once</button>
      </form>
    </div>
  );
}
