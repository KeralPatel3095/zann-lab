import { removeDailyReportItemAction, submitDailyReportAction } from "@/server/actions";
import type { DailyReport } from "@/lib/domain/daily-production";

function kindLabel(kind: DailyReport["items"][number]["kind"]) {
  return kind === "started" ? "Started" : "Finished";
}

function lineText(item: DailyReport["items"][number]) {
  return [
    kindLabel(item.kind),
    item.caseNumber,
    item.patientName,
    item.caseType,
  ].filter(Boolean).join(" · ") + (item.note ? ` — ${item.note}` : "");
}

export function SubmittedReport({ report }: { report: DailyReport }) {
  if (!report.note && report.items.length === 0) return null;
  return (
    <div className="grid gap-2 px-4 pb-4 text-sm">
      <h3 className="font-semibold">{report.technicianName}</h3>
      {report.note ? <p className="whitespace-pre-wrap">{report.note}</p> : null}
      {report.items.length > 0 ? (
        <ul className="grid gap-1">
          {report.items.map((item) => <li key={item.id}>{lineText(item)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function DailyReportCard({ report }: { report: DailyReport }) {
  return (
    <div id="daily-report" className="grid gap-4 p-5">
      <div>
        <h3 className="text-lg">Add what you finished</h3>
        <p className="mt-1 text-sm">Submit it here. Ana and Keral can see it.</p>
      </div>
      {report.items.length > 0 ? (
        <ul className="grid gap-2 text-sm">
          {report.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
              <span>{lineText(item)}</span>
              <form action={removeDailyReportItemAction}>
                <input type="hidden" name="item_id" value={item.id} />
                <button className="text-sm text-teal-800" type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={submitDailyReportAction} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-4">
          <label>
            Case number
            <input name="case_number" placeholder="43445" />
          </label>
          <label>
            Work
            <select name="kind" defaultValue="worked">
              <option value="worked">Finished</option>
              <option value="started">Started</option>
            </select>
          </label>
          <label className="md:col-span-2">
            What you finished
            <input name="item_note" placeholder="Write it here" />
          </label>
        </div>
        <label>
          Note
          <textarea name="note" rows={3} defaultValue={report.note} placeholder="Anything else you finished today" />
        </label>
        <button className="lab-btn w-fit" type="submit">Submit</button>
      </form>
    </div>
  );
}
