import { StatusPill } from "@/components/status-pill";
import { requireActorPage } from "@/lib/auth/current";
import { departmentQueue } from "@/lib/domain/tasks";
import { formatStamp } from "@/lib/format";
import { assignAction } from "@/server/actions";

export default async function DepartmentPage() {
  const actor = await requireActorPage();
  const queue = await departmentQueue(actor.id);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Department queue</h1>
      <div className="lab-card lab-sheet">
        <table>
          <thead><tr><th>Case</th><th>Task</th><th>Due</th><th>Status</th><th>Assignee</th></tr></thead>
          <tbody>
            {queue.tasks.map((task) => (
              <tr key={task.id}>
                <td data-label="Case">{task.case_number}<br />{task.dentist_code} · {task.patient_name}</td>
                <td data-label="Task">{task.title}<br />{task.department_name}</td>
                <td data-label="Due">{formatStamp(task.labor_due_at)}</td>
                <td data-label="Status"><StatusPill value={task.task_status} kind="task" /></td>
                <td data-label="Assignee">
                  <form action={assignAction} className="flex gap-2">
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="version" value={task.version} />
                    <select name="assignee_id" defaultValue={task.assigned_user_id ?? ""}>
                      <option value="">Unassigned</option>
                      {queue.members.filter((member) => member.department_id === task.department_id).map((member) => (
                        <option key={member.id} value={member.id}>{member.full_name}</option>
                      ))}
                    </select>
                    <button className="rounded-md border px-2 text-sm">Assign</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
