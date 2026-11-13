import { addDailyReportItemAction, removeDailyReportItemAction, saveDailyReportAction } from "@/server/actions";
import type { DailyReport } from "@/lib/domain/daily-production";

function kindLabel(kind: DailyReport["items"][number]["kind"]) {
  return kind === "started" ? "Started" : "Worked on";
}

export function DailyReportCard({ report, editing }: { report: DailyReport; editing: boolean }) {
  return (
    <section id="daily-report" className="lab-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl">Daily report</h2>
          <p className="mt-1 text-sm">
            {report.items.length === 0 && !report.note ? "Add cases you worked on or started." : `${report.items.length} added today`}
          </p>
        </div>
        {editing ? (
          <a className="lab-btn" href="/#daily-report">Done</a>
        ) : (
          <a className="lab-btn" href="/?report=edit#daily-report">Edit</a>
        )}
      </div>
      {report.note ? <p className="mt-4 whitespace-pre-wrap text-sm">{report.note}</p> : null}
      {report.items.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm">
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
              {editing ? (
                <form action={removeDailyReportItemAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <button className="text-sm text-teal-800" type="submit">Remove</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <div className="mt-4 grid gap-4">
          <form action={saveDailyReportAction} className="grid gap-2">
            <label>
              Note
              <textarea name="note" rows={4} defaultValue={report.note} placeholder="What you did today" />
            </label>
            <button className="lab-btn w-fit" type="submit">Save note</button>
          </form>
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
              Detail
              <input name="item_note" placeholder="Optional" />
            </label>
            <div className="md:col-span-4">
              <button className="lab-btn" type="submit">Add case</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
