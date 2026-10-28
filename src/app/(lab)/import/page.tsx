import { requireActorPage } from "@/lib/auth/current";
import { trackerStatus } from "@/lib/domain/tracker-sync";
import { syncTrackerAction } from "@/server/actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  if (actor.role !== "administrator" && actor.role !== "front_desk") return <p>Front desk access is required.</p>;
  const notice = (await searchParams).notice;
  const status = await trackerStatus(actor.id);
  return (
    <div className="grid gap-4">
      <header>
        <p className="lab-kicker">Case tracker</p>
        <h1 className="mt-1 text-3xl">Google Sheet</h1>
        <p className="mt-1 text-sm">Cases are added in the connected Google Sheet. They are not typed in here.</p>
      </header>
      <form action={syncTrackerAction} className="lab-card grid gap-3 p-5">
        <h2 className="text-lg">Case tracker Google Sheet</h2>
        <p className="text-sm">Paste the sheet link. New and changed rows are pulled in about every 5 minutes, and again when you click Save and sync. Share the sheet as anyone with the link can view, or this computer cannot see new rows.</p>
        <label>Google Sheet link<input name="sheet_url" defaultValue={status.url} placeholder="https://docs.google.com/spreadsheets/d/..." /></label>
        {notice ? <p className="text-sm">{notice}</p> : null}
        {status.message ? <p className="text-sm">{status.message}</p> : null}
        <button className="w-fit rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Save and sync</button>
      </form>
    </div>
  );
}
