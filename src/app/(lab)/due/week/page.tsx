import Link from "next/link";
import { DateTime } from "luxon";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listCasesDueBetween } from "@/lib/domain/reports";
import { EARLY_FINISH_DAYS, operationalDueAt } from "@/lib/office-rules";
import { canViewClinicIdentity } from "@/lib/privacy";
import { belongsOnFinishToday, dueSheetLabel, LAB_ZONE, weekAheadWindow, workDayBeforeDue } from "@/lib/scheduling/calendar";

export default async function DueWeekPage() {
  const actor = await requireActorPage();
  const showOffice = canViewClinicIdentity(actor);
  const now = DateTime.now().setZone(LAB_ZONE);
  const { start, end } = weekAheadWindow(now);
  const dueStart = start.plus({ days: 1 }).toISODate() ?? "";
  const dueEnd = end.plus({ days: 4 + EARLY_FINISH_DAYS }).toISODate() ?? "";
  const found = await listCasesDueBetween(actor.id, dueStart, dueEnd);
  const rows = found.filter((row) => {
    if (!row.requested_delivery_at) return false;
    const opDue = operationalDueAt(row.requested_delivery_at, row.dentist_code);
    if (!opDue) return false;
    // Finish today already owns this case — do not also list it under week ahead.
    if (
      belongsOnFinishToday({
        dueAt: row.requested_delivery_at,
        sheetSectionAt: row.received_at,
        trackerDue: row.tracker_due,
        operationalDue: opDue,
        now,
      })
    ) {
      return false;
    }
    const workDay = workDayBeforeDue(opDue, row.tracker_due);
    return workDay >= start && workDay <= end;
  });
  const groups = new Map<string, Array<(typeof rows)[number]>>();
  for (const row of rows) {
    const opDue = row.requested_delivery_at ? operationalDueAt(row.requested_delivery_at, row.dentist_code) : null;
    const workDay = opDue ? workDayBeforeDue(opDue, row.tracker_due) : null;
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
              <thead>
                <tr>
                  <th>Case</th>
                  {showOffice ? <th>Office</th> : null}
                  <th>Patient</th>
                  <th>PAN</th>
                  <th>Type</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Case"><Link href={`/cases/${row.id}`}>{row.case_number}</Link></td>
                    {showOffice ? <td data-label="Office">{row.clinic_name || "—"}</td> : null}
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
