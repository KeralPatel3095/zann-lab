import { addDailyReportItemAction, removeDailyReportItemAction, saveDailyReportAction } from "@/server/actions";
import type { DailyReport } from "@/lib/domain/daily-production";

function kindLabel(kind: DailyReport["items"][number]["kind"]) {
  return kind === "started" ? "Started" : "Worked on";
}

export function DailyReportCard({ report }: { report: DailyReport }) {
  return (
    <div id="daily-report" className="grid gap-4 border-t border-zinc-200 px-4 py-4">
      <div>
        <h3 className="text-lg">Write today's report</h3>
        <p className="mt-1 text-sm">Add other cases you worked on or started, and a note.</p>
      </div>
      {report.items.length > 0 ? (
        <ul className="grid gap-2 text-sm">
          {report.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2">
              <span>
                <strong>{kindLabel(item.kind)}</strong>
                {" · "}
                {item.caseNumber}
                {item.patientName ? ` · ${item.patientName}` : ""}
                {item.caseType ? ` · ${item.caseType}` : ""}
                {item.note ? ` — ${item.note}` : ""}
              </span>
              <form action={removeDailyReportItemAction}>
                <input type="hidden" name="item_id" value={item.id} />
                <button className="text-sm text-teal-800" type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={addDailyReportItemAction} className="grid gap-3 md:grid-cols-4">
        <label>
          Case number
          <input name="case_number" required placeholder="43556" />
        </label>
        <label>
          Work
          <select name="kind" defaultValue="worked">
            <option value="worked">Worked on</option>
            <option value="started">Started</option>
          </select>
        </label>
        <label className="md:col-span-2">
          What you did
          <input name="item_note" placeholder="Write it here" />
        </label>
        <div className="md:col-span-4">
          <button className="lab-btn" type="submit">Add case</button>
        </div>
      </form>
      <form action={saveDailyReportAction} className="grid gap-2">
        <label>
          Note
          <textarea name="note" rows={3} defaultValue={report.note} placeholder="Write what else you did today" />
        </label>
        <button className="lab-btn w-fit" type="submit">Save note</button>
      </form>
    </div>
  );
}
