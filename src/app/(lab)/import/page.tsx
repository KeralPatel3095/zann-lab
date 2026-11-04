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
  const urlLooksWrong = /docs\.google\.com\/spreadsheets/i.test(status.url);
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Live Google Sheet</h1>
        <p className="mt-1 text-sm">Today stays empty until sync succeeds. Use the checklist below.</p>
      </header>

      {feedback ? <p className="lab-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{feedback}</p> : null}
      {urlLooksWrong ? (
        <p className="lab-card border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          The saved link is a normal Google Sheet URL. That will never sync. Replace it with your Apps Script{" "}
          <strong>/exec?key=…</strong> URL.
        </p>
      ) : null}

      <section className="lab-card grid gap-2 p-5 text-sm">
        <h2 className="text-lg">Working path (required)</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            In Apps Script, paste <code>docs/google-apps-script-bridge.js</code>, then click <strong>Run → testBridge</strong> and
            authorize. Execution log must show <code>{`{"ok":true`}</code>.
          </li>
          <li>
            <strong>Deploy → Manage deployments → Edit → New version</strong>. Who has access: <strong>Anyone</strong>. Deploy.
          </li>
          <li>
            Open the deployment URL in a private/incognito window. It must show JSON like <code>{`{"ok":true,"sheets":...}`}</code> —
            not a Google login page.
          </li>
          <li>
            Paste <strong>only that</strong> URL below (starts with <code>script.google.com</code>), then Save and sync.
          </li>
        </ol>
      </section>

      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Apps Script /exec URL only</h2>
        <p className="text-sm text-red-800">Do not paste docs.google.com links here.</p>
        <label>
          Web app URL
          <input
            name="sheet_url"
            defaultValue={urlLooksWrong ? "" : status.url}
            placeholder="https://script.google.com/macros/s/XXXX/exec?key=K5vxmVhWwLJOfy7iAdTazN8Q6cpn3jCE1GZeRsI9XHtPMo4k"
          />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>

      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Get cases on screen right now</h2>
        <p className="text-sm">
          Google Sheet → <strong>File → Download → Excel (.xlsx)</strong> → choose the file → Upload. This fills Today
          immediately while you finish the live bridge.
        </p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Upload Excel now</button>
      </form>
    </div>
  );
}
