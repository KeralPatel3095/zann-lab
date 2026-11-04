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
  const hasServiceAccount = Boolean(serviceEmail && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim());
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Live Google Sheet</h1>
        <p className="mt-1 text-sm">
          Permanent sync uses a Google service account. Paste the normal sheet link after Netlify has the two Google env
          vars.
        </p>
      </header>

      {feedback ? <p className="lab-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{feedback}</p> : null}

      <section className="lab-card grid gap-2 p-5 text-sm">
        <h2 className="text-lg">Service account status</h2>
        {hasServiceAccount ? (
          <p className="text-teal-900">
            Configured. Share the sheet with <strong>{serviceEmail}</strong> as Viewer, paste the sheet link below, then
            Save and sync.
          </p>
        ) : (
          <p className="text-amber-900">
            Not configured yet. In Netlify add <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and{" "}
            <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>, share the sheet with that email as Viewer, redeploy, then
            return here.
          </p>
        )}
      </section>

      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Google Sheet link</h2>
        <label>
          Sheet URL
          <input
            name="sheet_url"
            defaultValue={status.url}
            placeholder="https://docs.google.com/spreadsheets/d/..../edit"
          />
        </label>
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>

      <form action={uploadTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Backup Excel upload</h2>
        <p className="text-sm">Use only if service account sync is not ready yet.</p>
        <label>
          Tracker Excel file
          <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="w-fit rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-900">Upload once</button>
      </form>
    </div>
  );
}
