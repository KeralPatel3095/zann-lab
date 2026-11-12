import { requireActorPage } from "@/lib/auth/current";
import { getSql } from "@/lib/db/sql";
import { hasBackendAccess } from "@/lib/domain/common";
import { trackerStatus } from "@/lib/domain/tracker-sync";
import { LAB_ZONE } from "@/lib/scheduling/calendar";
import { syncTrackerAction, uploadTrackerAction } from "@/server/actions";
import { DateTime } from "luxon";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  if (!hasBackendAccess(actor)) return <p>Backend access is required.</p>;
  const notice = (await searchParams).notice;
  const status = await trackerStatus(actor.id);
  const feedback = notice || status.message;
  const checked = status.checkedAt ? DateTime.fromISO(status.checkedAt).setZone(LAB_ZONE) : null;
  const checkedLabel = checked?.isValid ? checked.toFormat("h:mm a") : "";
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "";
  const hasServiceAccount = Boolean(serviceEmail && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim());
  const sql = await getSql();
  const [counts] = await sql<{ total: number; open: number }[]>`
    select
      count(*)::int as total,
      count(*) filter (where overall_status = 'in_production' and not historical)::int as open
    from cases
  `;
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Live Google Sheet</h1>
        <p className="mt-1 text-sm">Today only fills after a successful sync below.</p>
      </header>

      <section className="lab-card grid gap-1 p-5 text-sm">
        <h2 className="text-lg">Connection status</h2>
        <p>
          Service account on this host:{" "}
          {hasServiceAccount ? (
            <span className="text-teal-800">yes ({serviceEmail})</span>
          ) : (
            <span className="text-red-700">missing — add GOOGLE_SERVICE_ACCOUNT_EMAIL and PRIVATE_KEY in Netlify, then redeploy</span>
          )}
        </p>
        <p>
          Saved sheet link:{" "}
          {status.url ? <span className="break-all">{status.url}</span> : <span className="text-red-700">none</span>}
        </p>
        <p>
          Cases in database: <strong>{counts?.total ?? 0}</strong> total, <strong>{counts?.open ?? 0}</strong> in production
        </p>
        {feedback ? <p className="mt-2 border border-amber-300 bg-amber-50 p-3 text-amber-950">{feedback}</p> : null}
      </section>

      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">1. Connect Google Sheet (live)</h2>
        <p className="text-sm">
          Share the sheet with the service account email as Viewer, then paste the sheet link.
          The lab checks that sheet every 2 minutes and updates the cases on its own.
          {checkedLabel ? ` Last check ${checkedLabel}.` : ""}
        </p>
        <label>
          Google Sheet link
          <input
            name="sheet_url"
            defaultValue={status.url}
            placeholder="https://docs.google.com/spreadsheets/d/..../edit"
            required
          />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>

      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">2. Or upload Excel now</h2>
        <p className="text-sm">
          File → Download → Excel (.xlsx) from Google Sheets, then upload here to fill Today immediately.
        </p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Upload Excel</button>
      </form>
    </div>
  );
}
