import { DateTime } from "luxon";
import { assessDeadline } from "../scheduling/risk";
import { scheduleBackward, scheduleForward, type StageNode } from "../scheduling/engine";
import type { Tx } from "../db/sql";
import { loadCalendar, setting } from "./common";

type OpenTask = {
  id: string;
  title: string;
  department_id: string;
  assigned_user_id: string | null;
  work_minutes: number;
  elapsed_minutes: number;
  task_status: string;
  sort_order: number;
};

export async function rescheduleCase(tx: Tx, caseId: string) {
  const schedulerId = await setting(tx, "scheduler_user_id");
  if (schedulerId) await tx`select set_config('app.user_id', ${schedulerId}, true)`;
  await tx`select set_config('app.scheduling', 'on', true)`;
  const calendar = await loadCalendar(tx);
  const now = DateTime.now().setZone(calendar.zone);
  const [caseRow] = await tx<{
    requested_delivery_at: Date | null;
    production_ready_at: Date | null;
    overall_status: string;
  }[]>`
    select requested_delivery_at, production_ready_at, overall_status::text as overall_status
    from cases where id = ${caseId}
  `;
  if (!caseRow) return;
  const tasks = await tx<OpenTask[]>`
    select id, title, department_id, assigned_user_id, work_minutes, elapsed_minutes, task_status::text as task_status, sort_order
    from production_tasks
    where case_id = ${caseId}
    order by sort_order
  `;
  const open = tasks.filter((task) => !["completed", "cancelled"].includes(task.task_status));
  if (open.length === 0 || !caseRow.requested_delivery_at) return;
  const dependencies = await tx<{ predecessor_task_id: string; successor_task_id: string }[]>`
    select d.predecessor_task_id, d.successor_task_id
    from task_dependencies d
    join production_tasks t on t.id = d.successor_task_id
    where t.case_id = ${caseId}
  `;
  const openIds = new Set(open.map((task) => task.id));
  const nodes: StageNode[] = open.map((task) => ({
    id: task.id,
    name: task.title,
    workMinutes: task.work_minutes,
    elapsedMinutes: task.elapsed_minutes,
    departmentId: task.department_id,
    predecessors: dependencies
      .filter((row) => row.successor_task_id === task.id && openIds.has(row.predecessor_task_id))
      .map((row) => row.predecessor_task_id),
  }));
  const delivery = DateTime.fromJSDate(caseRow.requested_delivery_at).setZone(calendar.zone);
  const buffer = Number(await setting(tx, "dispatch_buffer_minutes")) || 0;
  const backward = scheduleBackward(nodes, delivery, now, calendar, buffer);
  const forward = scheduleForward(nodes, now, calendar);
  const planned = backward.feasible ? backward : forward;
  if (planned.stages.length === 0) {
    await tx`
      update cases
      set schedule_feasible = false,
          schedule_note = ${planned.reasons.join(" ") || backward.reasons.join(" ")},
          deadline_indicator = 'at_risk'
      where id = ${caseId}
    `;
    return;
  }
  const technicians = await loadTechnicians(tx, caseId);
  const conflicts: string[] = [];
  for (const stage of planned.stages) {
    const current = open.find((task) => task.id === stage.id);
    let assignee = current?.assigned_user_id ?? null;
    const technician = assignee ? technicians.find((item) => item.id === assignee) : undefined;
    const overlaps = technician?.commitments.some((item) => stage.plannedStart < item.end && item.start < stage.laborDue) ?? false;
    if (overlaps) {
      conflicts.push(`${stage.name} was left unassigned because the current technician has overlapping work.`);
      assignee = null;
    }
    if (technician && assignee) {
      technician.commitments.push({ start: stage.plannedStart, end: stage.laborDue });
    }
    await tx`
      update production_tasks
      set planned_start_at = ${stage.plannedStart.toJSDate()},
          labor_due_at = ${stage.laborDue.toJSDate()},
          planned_due_at = ${stage.plannedDue.toJSDate()},
          assigned_user_id = ${assignee},
          version = version + 1
      where id = ${stage.id}
    `;
  }
  const finish = planned.stages[planned.stages.length - 1]?.plannedDue ?? forward.stages.at(-1)?.plannedDue ?? null;
  const nextDue = planned.stages
    .map((stage) => stage.laborDue)
    .sort((a, b) => a.toMillis() - b.toMillis())[0] ?? null;
  const remaining = open.reduce((sum, task) => sum + task.work_minutes, 0);
  const reasons = [...backward.reasons, ...conflicts];
  const indicator = assessDeadline({
    now,
    requestedDelivery: delivery,
    projectedFinish: finish,
    feasible: backward.feasible && conflicts.length === 0,
    remainingWorkMinutes: remaining,
    nextLaborDue: nextDue,
    calendar,
    terminal: false,
  });
  await tx`
    update cases
    set projected_completion_at = ${finish ? finish.toJSDate() : null},
        schedule_feasible = ${backward.feasible && conflicts.length === 0},
        schedule_note = ${reasons.join(" ")},
        deadline_indicator = ${indicator}::deadline_indicator
    where id = ${caseId}
  `;
}

async function loadTechnicians(tx: Tx, excludeCaseId?: string) {
  const rows = await tx<{ id: string; department_id: string; daily_capacity_minutes: number }[]>`
    select p.id, m.department_id, p.daily_capacity_minutes
    from profiles p
    join department_members m on m.user_id = p.id and m.active
    where p.active and p.role = 'technician'
  `;
  const commitments = excludeCaseId
    ? await tx<{ assigned_user_id: string; planned_start_at: Date; labor_due_at: Date }[]>`
        select assigned_user_id, planned_start_at, labor_due_at
        from production_tasks
        where assigned_user_id is not null
          and task_status not in ('completed', 'cancelled')
          and planned_start_at is not null
          and labor_due_at is not null
          and case_id <> ${excludeCaseId}
      `
    : await tx<{ assigned_user_id: string; planned_start_at: Date; labor_due_at: Date }[]>`
        select assigned_user_id, planned_start_at, labor_due_at
        from production_tasks
        where assigned_user_id is not null
          and task_status not in ('completed', 'cancelled')
          and planned_start_at is not null
          and labor_due_at is not null
      `;
  const grouped = new Map<string, { id: string; departmentIds: string[]; capacityMinutes: number; commitments: { start: DateTime; end: DateTime }[] }>();
  for (const row of rows) {
    const current = grouped.get(row.id) ?? {
      id: row.id,
      departmentIds: [],
      capacityMinutes: row.daily_capacity_minutes,
      commitments: commitments
        .filter((item) => item.assigned_user_id === row.id)
        .map((item) => ({ start: DateTime.fromJSDate(item.planned_start_at), end: DateTime.fromJSDate(item.labor_due_at) })),
    };
    current.departmentIds.push(row.department_id);
    grouped.set(row.id, current);
  }
  return [...grouped.values()];
}

export { loadTechnicians };
