import Link from "next/link";
import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { SubmitButton } from "@/components/submit-button";
import { requireActorPage } from "@/lib/auth/current";
import { getCase } from "@/lib/domain/cases";
import { formatStamp } from "@/lib/format";
import { canViewClinicIdentity } from "@/lib/privacy";
import { deliveryAction, dispatchAction, holdCaseAction, missingInfoAction, releaseCaseAction, resumeCaseAction } from "@/server/actions";

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getCase(actor.id, id);
  if (!detail) return <p>Case not found.</p>;
  const record = detail.case;
  const desk = actor.role === "front_desk" || actor.role === "administrator" || actor.role === "production_manager";
  return (
    <div className="grid gap-4">
      {query.notice ? <p className="rounded-md bg-amber-50 p-3 text-sm">{query.notice}</p> : null}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{record.caseNumber}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">{record.patientName} · {record.dentistCode} · <PanMark value={record.panNumber} status={record.overallStatus} /></p>
        </div>
        <div className="flex gap-2">
          <StatusPill value={record.overallStatus} trackerStatus={record.trackerStatus} />
          <StatusPill value={record.deadlineIndicator} kind="indicator" />
        </div>
      </header>
      {record.scheduleNote ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">{record.scheduleNote}</p> : null}
      <section className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-3">
        <p className="flex items-center gap-2">Type: <ProductMark name={record.caseType} /></p>
        <p>Received: {formatStamp(record.receivedAt)}</p>
        <p>Requested delivery: {formatStamp(record.requestedDeliveryAt)}</p>
        <p>Projected completion: {formatStamp(record.projectedCompletionAt)}</p>
        <p>Stage: {record.currentStage ?? "—"}</p>
        <p>Department: {record.currentDepartment ?? "—"}</p>
        <p className="md:col-span-3">Prescription: {record.prescription || "—"}</p>
      </section>
      {canViewClinicIdentity(actor) && record.clinic ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">Clinic account</h2>
          <p className="mt-2 text-sm">{record.clinic.dentistName} · {record.clinic.clinicName}</p>
          <p className="text-sm">{record.clinic.email} · {record.clinic.phone}</p>
          <p className="text-sm text-zinc-600">{record.clinic.billingNotes}</p>
        </section>
      ) : null}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Units</h2>
        <ul className="mt-2 text-sm">
          {detail.units.map((unit) => <li key={unit.id}>Tooth {unit.tooth_number || "—"} · {unit.material} · {unit.shade}</li>)}
        </ul>
      </section>
      <section className="lab-card lab-sheet p-4">
        <h2 className="font-semibold">Production timeline</h2>
        <table className="mt-2">
          <thead><tr><th>Task</th><th>Department</th><th>Assignee</th><th>Deadline</th><th>Status</th></tr></thead>
          <tbody>
            {detail.tasks.map((task) => (
              <tr key={task.id}>
                <td data-label="Task"><Link className="text-teal-800" href={`/tasks/${task.id}`}>{task.title}</Link></td>
                <td data-label="Department">{task.department_name}</td>
                <td data-label="Assignee">{task.assignee_name ?? "Unassigned"}</td>
                <td data-label="Deadline">{formatStamp(task.labor_due_at)}</td>
                <td data-label="Status"><StatusPill value={task.task_status} kind="task" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Case history</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {detail.events.map((event) => (
            <li key={event.id}>{formatStamp(event.event_timestamp)} · {event.event_type.replaceAll("_", " ")} · {event.actor_name ?? "System"}</li>
          ))}
        </ul>
      </section>
      {desk ? (
        <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4">
          {detail.tasks.length === 0 ? (
            <form action={releaseCaseAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="case_id" value={record.id} />
              <label className="flex items-center gap-2"><input className="h-4 w-4" type="checkbox" name="acknowledge" />Acknowledge an infeasible date</label>
              <SubmitButton>Release to production</SubmitButton>
            </form>
          ) : null}
          <form action={deliveryAction} className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="case_id" value={record.id} />
            <label>Change requested delivery<input type="datetime-local" name="requested_delivery_at" required /></label>
            <div className="flex items-end"><SubmitButton tone="ghost">Update delivery date</SubmitButton></div>
          </form>
          <form action={missingInfoAction} className="grid gap-2">
            <input type="hidden" name="case_id" value={record.id} />
            <label>Missing information<textarea name="note" defaultValue={record.missingInformation} /></label>
            <SubmitButton tone="ghost">Save note</SubmitButton>
          </form>
          <form action={holdCaseAction} className="flex gap-2">
            <input type="hidden" name="case_id" value={record.id} />
            <input name="reason" placeholder="Hold reason" />
            <SubmitButton tone="ghost">Hold</SubmitButton>
          </form>
          <form action={resumeCaseAction}>
            <input type="hidden" name="case_id" value={record.id} />
            <SubmitButton tone="ghost">Resume</SubmitButton>
          </form>
          <form action={dispatchAction} className="grid gap-2 md:grid-cols-2">
            <input type="hidden" name="case_id" value={record.id} />
            <label>Courier<input name="courier" /></label>
            <label>Tracking<input name="tracking_number" /></label>
            <label className="md:col-span-2">Notes<textarea name="notes" rows={2} /></label>
            <button name="intent" value="dispatch" className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Mark dispatched</button>
            <button name="intent" value="deliver" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Mark delivered</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
