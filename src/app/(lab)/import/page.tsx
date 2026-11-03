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
        <h1 className="mt-1 text-3xl">Import cases</h1>
        <p className="mt-1 text-sm">Pull cases from the Google Sheet link, or upload an Excel export if Google blocks the link.</p>
      </header>
      {feedback ? <p className="lab-card p-4 text-sm">{feedback}</p> : null}
      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Upload Excel (recommended if link fails)</h2>
        <p className="text-sm">
          In Google Sheets: <strong>File → Download → Microsoft Excel (.xlsx)</strong>. Then choose that file here and upload.
        </p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Upload and sync</button>
      </form>
      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Google Sheet link</h2>
        <p className="text-sm">
          General access must be <strong>Anyone with the link → Viewer</strong>. Test the link in a private/incognito window while logged out of Google — if you cannot open it there, the app cannot either.
        </p>
        <label>
          Google Sheet link
          <input name="sheet_url" defaultValue={status.url} placeholder="https://docs.google.com/spreadsheets/d/..." />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Save and sync link</button>
      </form>
    </div>
  );
}
