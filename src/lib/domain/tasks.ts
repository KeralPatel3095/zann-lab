import { blockerLabels, taskStatusLabels } from "../labels";
import type { Tx } from "../db/sql";
import { addCaseEvent, addTaskEvent, appHref, clinicForCase, fail, hasRole, postNotice, runAs, type ActionResult } from "./common";
import { rescheduleCase } from "./schedule";

const blockerKeys = new Set(Object.keys(blockerLabels));
const frontDeskBlockers = new Set([
  "missing_prescription",
  "missing_scan_or_impression",
  "incomplete_records",
  "awaiting_dentist_clarification",
]);

type TaskRow = {
  id: string;
  case_id: string;
  title: string;
  task_status: string;
  version: number;
  assigned_user_id: string | null;
  department_id: string;
  requires_approval: boolean;
  is_quality_gate: boolean;
  is_dispatch_stage: boolean;
  auto_release_next: boolean;
  actual_started_at: Date | null;
  last_active_at: Date | null;
  active_seconds: number;
  blocked_seconds: number;
  paused_seconds: number;
  labor_due_at: Date | null;
  technical_instructions: string;
  priority: string;
  sort_order: number;
  workflow_stage_id: string | null;
  work_minutes: number;
  elapsed_minutes: number;
};

async function loadTask(tx: Tx, taskId: string) {
  const [task] = await tx<TaskRow[]>`
    select id, case_id, title, task_status::text as task_status, version, assigned_user_id, department_id,
           requires_approval, is_quality_gate, is_dispatch_stage, auto_release_next, actual_started_at, last_active_at,
           active_seconds, blocked_seconds, paused_seconds, labor_due_at, technical_instructions, priority::text as priority,
           sort_order, workflow_stage_id, work_minutes, elapsed_minutes
    from production_tasks where id = ${taskId}
  `;
  return task ?? null;
}

function accrue(task: TaskRow, now: Date) {
  const anchor = task.last_active_at ?? task.actual_started_at;
  const delta = anchor ? Math.max(0, Math.round((now.getTime() - anchor.getTime()) / 1000)) : 0;
  return {
    active: task.active_seconds + (task.task_status === "in_progress" ? delta : 0),
    blocked: task.blocked_seconds + (task.task_status === "blocked" ? delta : 0),
    paused: task.paused_seconds + (task.task_status === "paused" ? delta : 0),
  };
}

async function refreshCaseStatus(tx: Tx, caseId: string) {
  const tasks = await tx<{ task_status: string; is_quality_gate: boolean; is_dispatch_stage: boolean; sort_order: number; title: string }[]>`
    select task_status::text as task_status, is_quality_gate, is_dispatch_stage, sort_order, title
    from production_tasks where case_id = ${caseId}
  `;
  const [current] = await tx<{ overall_status: string; dispatch_status: string }[]>`
    select overall_status::text as overall_status, dispatch_status::text as dispatch_status from cases where id = ${caseId}
  `;
  if (!current || ["cancelled", "on_hold", "dispatched", "delivered", "draft"].includes(current.overall_status)) return;
  const open = tasks.filter((task) => !["completed", "cancelled"].includes(task.task_status));
  let status = "in_production";
  if (open.some((task) => task.title.startsWith("Rework:"))) status = "rework_required";
  else if (open.length === 0) status = "ready_for_dispatch";
  else {
    const qc = open.find((task) => task.is_quality_gate);
    if (qc && !open.some((task) => task.sort_order < qc.sort_order)) status = "awaiting_quality_control";
  }
  let dispatchStatus = current.dispatch_status;
  const packaging = tasks.find((task) => task.is_dispatch_stage);
  if (packaging?.task_status === "completed" && dispatchStatus === "not_ready") dispatchStatus = "ready";
  if (status === "ready_for_dispatch" && dispatchStatus === "not_ready") dispatchStatus = "ready";
  await tx`
    update cases
    set overall_status = ${status}::case_status, dispatch_status = ${dispatchStatus}::dispatch_state
    where id = ${caseId}
  `;
}

async function asScheduler(tx: Tx) {
  const [row] = await tx<{ setting_value: string }[]>`
    select setting_value from production_settings where setting_key = 'scheduler_user_id'
  `;
  if (!row?.setting_value) return;
  await tx`select set_config('app.user_id', ${row.setting_value}, true)`;
  await tx`select set_config('app.scheduling', 'on', true)`;
}

async function releaseNext(tx: Tx, task: TaskRow, actorId: string) {
  if (!task.auto_release_next) return;
  await asScheduler(tx);
  const [caseRow] = await tx<{
    case_number: string;
    dentist_code: string;
    patient_name: string;
    pan_number: string;
    case_type: string;
    prescription: string;
    priority: string;
  }[]>`
    select case_number, dentist_code, patient_name, pan_number, case_type, prescription, priority::text as priority
    from cases where id = ${task.case_id}
  `;
  if (!caseRow) return;
  const clinic = await clinicForCase(tx, { id: actorId, fullName: "", role: "administrator", canViewClinicIdentity: true, active: true }, task.case_id);
  const successors = await tx<{ successor_task_id: string }[]>`
    select successor_task_id from task_dependencies where predecessor_task_id = ${task.id}
  `;
  for (const successor of successors) {
    const predecessors = await tx<{ task_status: string }[]>`
      select p.task_status::text as task_status
      from task_dependencies d
      join production_tasks p on p.id = d.predecessor_task_id
      where d.successor_task_id = ${successor.successor_task_id}
    `;
    if (!predecessors.every((item) => item.task_status === "completed" || item.task_status === "cancelled")) continue;
    const [ready] = await tx<{ id: string; assigned_user_id: string | null; title: string; labor_due_at: Date | null; department_id: string }[]>`
      update production_tasks set task_status = 'ready_to_start'
      where id = ${successor.successor_task_id} and task_status = 'waiting'
      returning id, assigned_user_id, title, labor_due_at, department_id
    `;
    if (!ready) continue;
    await addTaskEvent(tx, ready.id, task.case_id, actorId, "task_ready", {});
    if (!ready.assigned_user_id || !ready.labor_due_at) continue;
    const [department] = await tx<{ name: string }[]>`select name from departments where id = ${ready.department_id}`;
    await postNotice(tx, {
      recipientId: ready.assigned_user_id,
      caseId: task.case_id,
      taskId: ready.id,
      type: "handoff",
      key: `ready:${ready.id}`,
      title: "Next production task is ready",
      clinic,
      notice: {
        dentistCode: caseRow.dentist_code,
        patientName: caseRow.patient_name,
        panNumber: caseRow.pan_number,
        caseNumber: caseRow.case_number,
        caseType: caseRow.case_type,
        department: department?.name ?? "",
        task: ready.title,
        deadline: ready.labor_due_at,
        priority: caseRow.priority,
        status: "Ready to Start",
        instructions: caseRow.prescription,
        href: appHref(`/tasks/${ready.id}`),
      },
    });
  }
}

export async function transitionTask(
  userId: string,
  taskId: string,
  action: "start" | "pause" | "resume" | "block" | "resolve" | "complete" | "approve" | "clarify",
  payload: { reason?: string; category?: string; checkedIds?: string[]; version: number },
): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      const task = await loadTask(tx, taskId);
      if (!task) return { ok: false, message: "Task not found." };
      if (task.version !== payload.version) return { ok: false, message: "This task was updated by someone else. Refresh and try again." };
      const now = new Date();
      const times = accrue(task, now);
      const reason = payload.reason?.trim() ?? "";
      if (action === "clarify") {
        if (reason.length < 3) return { ok: false, message: "Describe the clarification you need." };
        await addCaseEvent(tx, task.case_id, actor.id, "clarification_requested", { task: task.title, note: reason.slice(0, 500) });
        const recipients = await tx<{ id: string }[]>`select id from staff_directory where role = 'front_desk'`;
        const [caseRow] = await tx<{ case_number: string; dentist_code: string; patient_name: string; pan_number: string; case_type: string; priority: string }[]>`
          select case_number, dentist_code, patient_name, pan_number, case_type, priority::text as priority from cases where id = ${task.case_id}
        `;
        const [department] = await tx<{ name: string }[]>`select name from departments where id = ${task.department_id}`;
        for (const recipient of recipients) {
          if (!caseRow) break;
          await postNotice(tx, {
            recipientId: recipient.id,
            caseId: task.case_id,
            taskId: task.id,
            type: "clarification",
            key: null,
            title: "Clarification requested",
            clinic: await clinicForCase(tx, actor, task.case_id),
            notice: {
              dentistCode: caseRow.dentist_code,
              patientName: caseRow.patient_name,
              panNumber: caseRow.pan_number,
              caseNumber: caseRow.case_number,
              caseType: caseRow.case_type,
              department: department?.name ?? "",
              task: task.title,
              deadline: task.labor_due_at ?? now,
              priority: caseRow.priority,
              status: taskStatusLabels[task.task_status] ?? task.task_status,
              instructions: reason.slice(0, 500),
              href: appHref(`/cases/${task.case_id}`),
            },
          });
        }
        return { ok: true as const };
      }
      let status = task.task_status;
      if (action === "start" && task.task_status === "ready_to_start") status = "in_progress";
      else if (action === "resume" && task.task_status === "paused") status = "in_progress";
      else if (action === "pause" && task.task_status === "in_progress") {
        if (reason.length < 3) return { ok: false, message: "A pause reason is required." };
        status = "paused";
      } else if (action === "block" && ["ready_to_start", "in_progress", "paused"].includes(task.task_status)) {
        if (!payload.category || !blockerKeys.has(payload.category)) return { ok: false, message: "Choose a blocker category." };
        if (reason.length < 3) return { ok: false, message: "A blocker reason is required." };
        status = "blocked";
      } else if (action === "resolve" && task.task_status === "blocked") status = task.actual_started_at ? "in_progress" : "ready_to_start";
      else if (action === "approve" && task.task_status === "awaiting_approval") {
        if (!hasRole(actor, ["administrator", "department_lead", "production_manager"])) return { ok: false, message: "Not allowed" };
        status = "completed";
      } else if (action === "complete" && task.task_status === "in_progress") {
        if (task.is_quality_gate) return { ok: false, message: "Record the quality-control result instead of completing this task directly." };
        status = task.requires_approval ? "awaiting_approval" : "completed";
      } else return { ok: false, message: "That status change is not available." };

      if (payload.checkedIds) {
        await tx`update task_checklist_items set checked = false, checked_at = null, checked_by = null where task_id = ${task.id}`;
        for (const itemId of payload.checkedIds) {
          await tx`
            update task_checklist_items
            set checked = true, checked_at = now(), checked_by = ${actor.id}
            where id = ${itemId} and task_id = ${task.id}
          `;
        }
      }
      if (status === "completed" || status === "awaiting_approval") {
        const [missing] = await tx<{ id: string }[]>`
          select id from task_checklist_items where task_id = ${task.id} and required and not checked limit 1
        `;
        if (missing) return { ok: false, message: "Required checklist items are incomplete" };
      }
      const updated = await tx<{ id: string }[]>`
        update production_tasks
        set task_status = ${status}::task_status,
            actual_started_at = coalesce(actual_started_at, case when ${status} = 'in_progress' then now() else null end),
            actual_completed_at = case when ${status} = 'completed' then now() else actual_completed_at end,
            last_active_at = now(),
            active_seconds = ${times.active},
            blocked_seconds = ${times.blocked},
            paused_seconds = ${times.paused},
            pause_reason = case when ${action} = 'pause' then ${reason.slice(0, 500)} else pause_reason end,
            blocked_reason = case when ${action} = 'block' then ${reason.slice(0, 500)} else blocked_reason end,
            blocker_category = case when ${action} = 'block' then ${payload.category ?? null}::blocker_category else blocker_category end,
            blocked_at = case when ${action} = 'block' then now() when ${action} = 'resolve' then null else blocked_at end,
            version = version + 1
        where id = ${task.id} and version = ${task.version}
        returning id
      `;
      if (!updated.length) return { ok: false, message: "This task was updated by someone else. Refresh and try again." };
      await addTaskEvent(tx, task.id, task.case_id, actor.id, `task_${action}`, { status, category: payload.category ?? "" });
      if (status === "completed") await releaseNext(tx, task, actor.id);
      await refreshCaseStatus(tx, task.case_id);
      if (action === "block") {
        const clinic = await clinicForCase(tx, actor, task.case_id);
        const [caseRow] = await tx<{ case_number: string; dentist_code: string; patient_name: string; pan_number: string; case_type: string; priority: string }[]>`
          select case_number, dentist_code, patient_name, pan_number, case_type, priority::text as priority from cases where id = ${task.case_id}
        `;
        const [department] = await tx<{ name: string }[]>`select name from departments where id = ${task.department_id}`;
        const leads = await tx<{ user_id: string }[]>`
          select user_id from department_members
          where department_id = ${task.department_id} and active and membership_role = 'lead'
        `;
        const extra = frontDeskBlockers.has(payload.category ?? "")
          ? await tx<{ id: string }[]>`select id from staff_directory where role in ('front_desk', 'production_manager')`
          : await tx<{ id: string }[]>`select id from staff_directory where role = 'production_manager'`;
        const recipients = new Set<string>([...leads.map((lead) => lead.user_id), ...extra.map((person) => person.id)]);
        for (const recipientId of recipients) {
          if (!caseRow) break;
          await postNotice(tx, {
            recipientId,
            caseId: task.case_id,
            taskId: task.id,
            type: "blocked",
            key: `blocked:${task.id}:${recipientId}:${now.toISOString().slice(0, 16)}`,
            title: "Production task blocked",
            clinic,
            notice: {
              dentistCode: caseRow.dentist_code,
              patientName: caseRow.patient_name,
              panNumber: caseRow.pan_number,
              caseNumber: caseRow.case_number,
              caseType: caseRow.case_type,
              department: department?.name ?? "",
              task: task.title,
              deadline: task.labor_due_at ?? now,
              priority: caseRow.priority,
              status: "Blocked",
              instructions: `${blockerLabels[payload.category ?? "other"]}. ${reason.slice(0, 300)}`,
              href: appHref(`/tasks/${task.id}`),
            },
          });
        }
      }
      if (action === "block" || action === "complete" || action === "approve") await rescheduleCase(tx, task.case_id);
      return { ok: true as const };
    }, { scheduling: true });
  } catch (error) {
    return fail(error);
  }
}

export async function recordQuality(
  userId: string,
  taskId: string,
  input: { outcome: "approved" | "rejected" | "rework"; notes: string; failedTaskId?: string; results: { label: string; passed: boolean }[]; version: number },
): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (actor.role === "front_desk") return { ok: false, message: "Not allowed" };
      const task = await loadTask(tx, taskId);
      if (!task?.is_quality_gate) return { ok: false, message: "This task is not a quality-control gate." };
      if (task.version !== input.version) return { ok: false, message: "This task was updated by someone else. Refresh and try again." };
      if (!input.notes.trim() && input.outcome !== "approved") return { ok: false, message: "A quality-control reason is required." };
      const [check] = await tx<{ id: string }[]>`
        insert into quality_checks (case_id, task_id, reviewer_id, outcome, notes, failed_task_id)
        values (${task.case_id}, ${task.id}, ${actor.id}, ${input.outcome}::qc_outcome, ${input.notes.trim().slice(0, 1000)}, ${input.failedTaskId ?? null})
        returning id
      `;
      for (const result of input.results) {
        await tx`
          insert into quality_check_results (quality_check_id, item_label, passed, note)
          values (${check.id}, ${result.label.slice(0, 240)}, ${result.passed}, '')
        `;
        if (result.passed) {
          await tx`
            update task_checklist_items set checked = true, checked_at = now(), checked_by = ${actor.id}
            where task_id = ${task.id} and label = ${result.label}
          `;
        }
      }
      if (input.outcome === "approved") {
        const [missing] = await tx<{ id: string }[]>`
          select id from task_checklist_items where task_id = ${task.id} and required and not checked limit 1
        `;
        if (missing) return { ok: false, message: "Required checklist items are incomplete" };
        await tx`
          update production_tasks
          set task_status = 'completed', actual_completed_at = now(), version = version + 1
          where id = ${task.id} and version = ${task.version}
        `;
        await addTaskEvent(tx, task.id, task.case_id, actor.id, "quality_approved", {});
        await releaseNext(tx, task, actor.id);
      } else {
        const [source] = input.failedTaskId
          ? await tx<TaskRow[]>`
              select id, case_id, title, task_status::text as task_status, version, assigned_user_id, department_id,
                     requires_approval, is_quality_gate, is_dispatch_stage, auto_release_next, actual_started_at, last_active_at,
                     active_seconds, blocked_seconds, paused_seconds, labor_due_at, technical_instructions, priority::text as priority,
                     sort_order, workflow_stage_id, work_minutes, elapsed_minutes
              from production_tasks where id = ${input.failedTaskId} and case_id = ${task.case_id}
            `
          : await tx<TaskRow[]>`
              select id, case_id, title, task_status::text as task_status, version, assigned_user_id, department_id,
                     requires_approval, is_quality_gate, is_dispatch_stage, auto_release_next, actual_started_at, last_active_at,
                     active_seconds, blocked_seconds, paused_seconds, labor_due_at, technical_instructions, priority::text as priority,
                     sort_order, workflow_stage_id, work_minutes, elapsed_minutes
              from production_tasks
              where case_id = ${task.case_id} and sort_order < ${task.sort_order} and not is_quality_gate and not is_dispatch_stage
              order by sort_order desc
              limit 1
            `;
        if (!source) return { ok: false, message: "Choose the stage that needs rework." };
        const schedulerId = (await tx<{ setting_value: string }[]>`select setting_value from production_settings where setting_key = 'scheduler_user_id'`)[0]?.setting_value;
        if (schedulerId) await tx`select set_config('app.user_id', ${schedulerId}, true)`;
        const [rework] = await tx<{ id: string }[]>`
          insert into production_tasks (
            case_id, workflow_stage_id, assigned_user_id, department_id, title, task_status, priority,
            work_minutes, elapsed_minutes, requires_approval, sort_order, technical_instructions
          ) values (
            ${task.case_id}, ${source.workflow_stage_id}, ${source.assigned_user_id}, ${source.department_id},
            ${`Rework: ${source.title}`}, 'ready_to_start', ${source.priority}::priority_level,
            ${source.work_minutes}, ${source.elapsed_minutes}, false, ${task.sort_order}, ${input.notes.trim().slice(0, 1000)}
          ) returning id
        `;
        await tx`
          insert into task_dependencies (predecessor_task_id, successor_task_id)
          values (${rework.id}, ${task.id})
        `;
        await tx`
          insert into rework_orders (case_id, quality_check_id, source_task_id, rework_task_id, reason, created_by)
          values (${task.case_id}, ${check.id}, ${source.id}, ${rework.id}, ${input.notes.trim().slice(0, 1000)}, ${actor.id})
        `;
        await tx`
          update production_tasks set task_status = 'waiting', version = version + 1
          where id = ${task.id}
        `;
        await tx`update cases set overall_status = 'rework_required' where id = ${task.case_id}`;
        await addCaseEvent(tx, task.case_id, actor.id, "quality_rework", { stage: source.title, outcome: input.outcome });
      }
      await refreshCaseStatus(tx, task.case_id);
      await rescheduleCase(tx, task.case_id);
      return { ok: true as const };
    }, { scheduling: true });
  } catch (error) {
    return fail(error);
  }
}

export async function getTask(userId: string, taskId: string) {
  return runAs(userId, async (tx, actor) => {
    const task = await loadTask(tx, taskId);
    if (!task) return null;
    const checklist = await tx<{ id: string; label: string; required: boolean; checked: boolean; sequence: number }[]>`
      select id, label, required, checked, sequence from task_checklist_items where task_id = ${taskId} order by sequence
    `;
    const [caseRow] = await tx<{
      case_number: string;
      dentist_code: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      prescription: string;
      priority: string;
      overall_status: string;
    }[]>`
      select case_number, dentist_code, patient_name, pan_number, case_type, prescription, priority::text as priority, overall_status::text as overall_status
      from cases where id = ${task.case_id}
    `;
    const [department] = await tx<{ name: string }[]>`select name from departments where id = ${task.department_id}`;
    const events = await tx<{ event_type: string; event_timestamp: Date; event_details: unknown }[]>`
      select event_type, event_timestamp, event_details from task_events where task_id = ${taskId} order by event_timestamp
    `;
    const clinic = await clinicForCase(tx, actor, task.case_id);
    return { actor, task, checklist, case: caseRow, department: department?.name ?? "", events, clinic };
  });
}

export async function listMyTasks(userId: string, filters: { status?: string; priority?: string; q?: string }) {
  return runAs(userId, async (tx) => {
    const term = filters.q?.trim() ? `%${filters.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
    return tx<{
      id: string;
      title: string;
      task_status: string;
      priority: string;
      labor_due_at: Date | null;
      case_number: string;
      dentist_code: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      overall_status: string;
      department_name: string;
      blocker_category: string | null;
    }[]>`
      select t.id, t.title, t.task_status::text as task_status, t.priority::text as priority, t.labor_due_at,
             c.case_number, c.dentist_code, c.patient_name, c.pan_number, c.case_type, c.overall_status::text as overall_status, d.name as department_name,
             t.blocker_category::text as blocker_category
      from production_tasks t
      join cases c on c.id = t.case_id
      join departments d on d.id = t.department_id
      where (${term}::text is null or c.case_number ilike ${term} or c.pan_number ilike ${term} or c.dentist_code ilike ${term}
             or c.patient_name ilike ${term} or t.title ilike ${term})
        and (${filters.status ?? null}::text is null or t.task_status::text = ${filters.status ?? null})
        and (${filters.priority ?? null}::text is null or t.priority::text = ${filters.priority ?? null})
      order by t.labor_due_at nulls last
    `;
  });
}

export async function assignTask(userId: string, taskId: string, assigneeId: string, version: number): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "department_lead", "production_manager"])) return { ok: false, message: "Not allowed" };
      const task = await loadTask(tx, taskId);
      if (!task) return { ok: false, message: "Task not found." };
      if (task.version !== version) return { ok: false, message: "This task was updated by someone else. Refresh and try again." };
      const updated = await tx<{ id: string }[]>`
        update production_tasks set assigned_user_id = ${assigneeId}, version = version + 1
        where id = ${taskId} and version = ${version}
        returning id
      `;
      if (!updated.length) return { ok: false, message: "The task could not be reassigned." };
      await addTaskEvent(tx, taskId, task.case_id, actor.id, "task_reassigned", {});
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function departmentQueue(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (!hasRole(actor, ["department_lead", "administrator", "production_manager"])) return { actor, tasks: [], members: [] };
    const tasks = await tx<{
      id: string;
      title: string;
      task_status: string;
      priority: string;
      labor_due_at: Date | null;
      case_number: string;
      dentist_code: string;
      patient_name: string;
      pan_number: string;
      department_name: string;
      assignee_name: string | null;
      assigned_user_id: string | null;
      version: number;
      department_id: string;
    }[]>`
      select t.id, t.title, t.task_status::text as task_status, t.priority::text as priority, t.labor_due_at,
             c.case_number, c.dentist_code, c.patient_name, c.pan_number, d.name as department_name,
             s.full_name as assignee_name, t.assigned_user_id, t.version, t.department_id
      from production_tasks t
      join cases c on c.id = t.case_id
      join departments d on d.id = t.department_id
      left join staff_directory s on s.id = t.assigned_user_id
      where t.task_status not in ('completed', 'cancelled')
      order by t.labor_due_at nulls last
    `;
    const members = await tx<{ id: string; full_name: string; department_id: string }[]>`
      select p.id, p.full_name, m.department_id
      from department_members m
      join staff_directory p on p.id = m.user_id
      where m.active and p.role = 'technician'
    `;
    return { actor, tasks, members };
  });
}
