import Link from "next/link";
import { DateTime } from "luxon";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listFinishToday } from "@/lib/domain/reports";
import { canViewClinicIdentity } from "@/lib/privacy";
import { dueSheetLabel, LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function DueTomorrowPage() {
  const actor = await requireActorPage();
  const rows = await listFinishToday(actor.id);
  const showOffice = canViewClinicIdentity(actor);
  const tomorrow = DateTime.now().setZone(LAB_ZONE).plus({ days: 1 }).toISODate() ?? "";
  const when = tomorrow ? DateTime.fromISO(tomorrow, { zone: LAB_ZONE }).toFormat("cccc d LLLL") : "tomorrow";
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Finish today</p>
        <h1 className="mt-1 text-3xl">Due tomorrow</h1>
        <p className="mt-1 text-sm">{rows.length} in-lab cases · due today or {when}</p>
      </header>
      <div className="lab-card lab-sheet">
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Case"><Link className="text-teal-800" href={`/cases/${row.id}`}>{row.case_number}</Link></td>
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
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">No open cases are due tomorrow.</p> : null}
      </div>
    </div>
  );
}
