import Link from "next/link";
import { DateTime } from "luxon";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { listCasesDueBetween } from "@/lib/domain/reports";
import { LAB_ZONE } from "@/lib/scheduling/calendar";

export default async function DueTomorrowPage() {
  const actor = await requireActorPage();
  const today = DateTime.now().setZone(LAB_ZONE).toISODate() ?? "";
  const tomorrow = DateTime.now().setZone(LAB_ZONE).plus({ days: 1 }).toISODate() ?? "";
  const rows = today && tomorrow ? await listCasesDueBetween(actor.id, today, tomorrow) : [];
  const canOpen = actor.role === "administrator" || actor.role === "front_desk" || actor.role === "production_manager";
  const when = tomorrow ? DateTime.fromISO(tomorrow, { zone: LAB_ZONE }).toFormat("cccc d LLLL") : "tomorrow";
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm"><Link href="/">Today</Link></p>
        <p className="lab-kicker mt-3">Finish today</p>
        <h1 className="mt-1 text-3xl">Due tomorrow</h1>
        <p className="mt-1 text-sm">Finish these {rows.length} in-lab cases today. They are due today or {when}, including cases back from Streamline or Argen. Packing is ready to pack. Scheduled cases are already finished.</p>
      </header>
      <div className="lab-card lab-sheet">
        <table>
          <thead><tr><th>Case</th><th>Patient</th><th>PAN</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Case">{canOpen ? <Link className="text-teal-800" href={`/cases/${row.id}`}>{row.case_number}</Link> : row.case_number}</td>
                <td data-label="Patient">{row.patient_name}</td>
                <td data-label="PAN"><PanMark value={row.pan_number} status={row.overall_status} /></td>
                <td data-label="Type"><ProductMark name={row.case_type} /></td>
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
