import Link from "next/link";
import { DateTime } from "luxon";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { todayBoard } from "@/lib/domain/reports";
import { canViewClinicIdentity } from "@/lib/privacy";
import { dueSheetLabel, LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function HomePage() {
  const actor = await requireActorPage();
  const data = await todayBoard(actor.id);
  const showOffice = canViewClinicIdentity(actor);
  const today = DateTime.now().setZone(LAB_ZONE);
  const openTasks = data.myTasks.reduce((sum, row) => sum + row.total, 0);
  return (
    <div className="grid gap-5">
      <header>
        <p className="lab-kicker">Operations</p>
        <h1 className="mt-1 text-3xl">Today</h1>
        <p className="mt-1 text-sm">{today.toFormat("cccc, d LLLL yyyy")} · Toronto</p>
      </header>
      <section className="lab-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl">Finish today</h2>
            <p className="mt-1 text-sm">{data.finishToday.length} {data.finishToday.length === 1 ? "case" : "cases"} in production</p>
          </div>
          <div className="lab-actions">
            <Link href="/due/tomorrow" className="lab-btn">Full list</Link>
            <Link href="/due/week" className="lab-btn">Week ahead · {data.finishWeek.length}</Link>
          </div>
        </div>
        <div className="lab-sheet mt-4">
          <table>
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
              {data.finishToday.map((row) => {
                return (
                  <tr key={row.id}>
                    <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.case_number}</Link></td>
                    {showOffice ? <td data-label="Office">{row.clinic_name || "—"}</td> : null}
                    <td data-label="Patient">{row.patient_name}</td>
                    <td data-label="PAN"><PanMark value={row.pan_number} status={row.overall_status} /></td>
                    <td data-label="Type"><ProductMark name={row.case_type} /></td>
                    <td data-label="Due">{dueSheetLabel(row.tracker_due, row.requested_delivery_at)}</td>
                    <td data-label="Status"><StatusPill value={row.overall_status} trackerStatus={row.tracker_status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.finishToday.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No open cases are due tomorrow.</p> : null}
        </div>
      </section>
      {openTasks > 0 ? (
        <p className="text-sm"><Link href="/tasks">My tasks · {openTasks}</Link></p>
      ) : null}
    </div>
  );
}
