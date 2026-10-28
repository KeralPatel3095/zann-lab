import Link from "next/link";
import { DateTime } from "luxon";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listCasesDueBetween } from "@/lib/domain/reports";
import { dueSheetLabel, LAB_ZONE, weekAheadWindow, workDayBeforeDue } from "@/lib/scheduling/calendar";

export default async function DueWeekPage() {
  const actor = await requireActorPage();
  const { start, end } = weekAheadWindow();
  const dueStart = start.plus({ days: 1 }).toISODate() ?? "";
  const dueEnd = end.plus({ days: 4 }).toISODate() ?? "";
  const found = await listCasesDueBetween(actor.id, dueStart, dueEnd);
  const rows = found.filter((row) => {
    if (!row.requested_delivery_at) return false;
    const workDay = workDayBeforeDue(DateTime.fromJSDate(row.requested_delivery_at), row.tracker_due);
    return workDay >= start && workDay <= end;
  });
  const canOpen = actor.role === "administrator" || actor.role === "front_desk" || actor.role === "production_manager";
  const groups = new Map<string, Array<(typeof rows)[number]>>();
  for (const row of rows) {
    const workDay = row.requested_delivery_at ? workDayBeforeDue(DateTime.fromJSDate(row.requested_delivery_at), row.tracker_due) : null;
    if (!workDay || workDay.weekday > 5) continue;
    const day = workDay.toISODate() ?? "none";
    const bucket = groups.get(day);
    if (bucket) bucket.push(row);
    else groups.set(day, [row]);
  }
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Start early</p>
        <h1 className="mt-1 text-3xl">Week ahead</h1>
        <p className="mt-1 text-sm">
          {rows.length} in-lab cases are listed on a Monday to Friday only, from {start.toFormat("cccc d LLLL")} through {end.toFormat("cccc d LLLL")}.
          A case due 3 Nov is listed on 2 Nov. A case due by 10am, or earlier, is listed one more weekday before that. Saturday and Sunday are not listed. The due date still shows what the sheet says. Office names stay off this list.
        </p>
      </header>
      {[...groups.entries()].map(([day, cases]) => {
        const heading = day === "none" ? "No due date" : DateTime.fromISO(day, { zone: LAB_ZONE }).toFormat("cccc d LLLL");
        return (
          <section key={day} className="lab-card lab-sheet">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <h2 className="text-lg">{heading}</h2>
              <p className="text-sm">{cases.length} {cases.length === 1 ? "case" : "cases"}</p>
            </div>
            <table className="mt-2">
              <thead><tr><th>Case</th><th>Patient</th><th>PAN</th><th>Type</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {cases.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Case">{canOpen ? <Link href={`/cases/${row.id}`}>{row.case_number}</Link> : row.case_number}</td>
                    <td data-label="Patient">{row.patient_name}</td>
                    <td data-label="PAN"><PanMark value={row.pan_number} status={row.overall_status} /></td>
                    <td data-label="Type"><ProductMark name={row.case_type} /></td>
                    <td data-label="Due">{dueSheetLabel(row.tracker_due, row.requested_delivery_at)}</td>
                    <td data-label="Status"><StatusPill value={row.overall_status} trackerStatus={row.tracker_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {rows.length === 0 ? <p className="lab-card p-4 text-sm">No in-lab cases are due on those weekdays.</p> : null}
    </div>
  );
}
