import { PanMark, ProductMark } from "@/components/case-marks";
import { StatusPill } from "@/components/status-pill";
import { SubmitButton } from "@/components/submit-button";
import { requireActorPage } from "@/lib/auth/current";
import { blockerLabels } from "@/lib/labels";
import { getTask } from "@/lib/domain/tasks";
import { formatStamp } from "@/lib/format";
import { qualityAction, taskAction } from "@/server/actions";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getTask(actor.id, id);
  if (!detail?.case) return <p>Task not found.</p>;
  const task = detail.task;
  return (
    <div className="grid gap-4">
      {query.notice ? <p className="rounded-md bg-amber-50 p-3 text-sm">{query.notice}</p> : null}
      <header>
        <h1 className="text-2xl font-semibold">{task.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">{detail.case.case_number} · {detail.case.dentist_code} · {detail.case.patient_name} · <PanMark value={detail.case.pan_number} status={detail.case.overall_status} /></p>
        <div className="mt-2 flex gap-2"><StatusPill value={task.task_status} kind="task" /><span className="text-sm">Due {formatStamp(task.labor_due_at)}</span></div>
      </header>
      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <p>Department: {detail.department}</p>
        <p className="flex items-center gap-2">Type: <ProductMark name={detail.case.case_type} /></p>
        <p className="mt-2 whitespace-pre-wrap">Instructions: {task.technical_instructions || detail.case.prescription}</p>
        {detail.clinic ? <p className="mt-2 text-zinc-500">Clinic details are visible because your account was explicitly authorized.</p> : null}
      </section>
      <form action={task.is_quality_gate ? qualityAction : taskAction} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="version" value={task.version} />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Checklist</legend>
          {detail.checklist.map((item) => (
            <label key={item.id} className="flex items-center gap-2">
              <input className="h-4 w-4" type="checkbox" name={task.is_quality_gate ? "qc_passed" : "checked"} value={task.is_quality_gate ? item.label : item.id} defaultChecked={item.checked} />
              {task.is_quality_gate ? <input type="hidden" name="qc_label" value={item.label} /> : null}
              {item.label}{item.required ? " (required)" : ""}
            </label>
          ))}
        </fieldset>
        {task.is_quality_gate ? (
          <>
            <label>Outcome
              <select name="outcome" defaultValue="approved">
                <option value="approved">Approve</option>
                <option value="rework">Request rework</option>
                <option value="rejected">Reject</option>
              </select>
            </label>
            <label>Reason<textarea name="notes" rows={3} /></label>
            <SubmitButton>Record quality result</SubmitButton>
          </>
        ) : (
          <>
            <label>Reason for pause, block, or clarification<textarea name="reason" rows={2} /></label>
            <label>Blocker
              <select name="category" defaultValue="">
                <option value="">Select if blocking</option>
                {Object.entries(blockerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button name="action" value="start" className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Start task</button>
              <button name="action" value="pause" className="rounded-md border px-3 py-2 text-sm">Pause</button>
              <button name="action" value="resume" className="rounded-md border px-3 py-2 text-sm">Resume</button>
              <button name="action" value="complete" className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white">Mark complete</button>
              <button name="action" value="block" className="rounded-md bg-red-700 px-3 py-2 text-sm text-white">Mark blocked</button>
              <button name="action" value="resolve" className="rounded-md border px-3 py-2 text-sm">Resolve block</button>
              <button name="action" value="approve" className="rounded-md border px-3 py-2 text-sm">Approve</button>
              <button name="action" value="clarify" className="rounded-md border px-3 py-2 text-sm">Request clarification</button>
            </div>
          </>
        )}
      </form>
      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">History</h2>
        <ul className="mt-2">
          {detail.events.map((event, index) => <li key={`${event.event_type}-${index}`}>{formatStamp(event.event_timestamp)} · {event.event_type.replaceAll("_", " ")}</li>)}
        </ul>
      </section>
    </div>
  );
}
