import { DateTime } from "luxon";
import { assignTechnicians, bridgeIncludedStages, scheduleBackward, scheduleForward, type StageNode } from "../scheduling/engine";
import { assessDeadline } from "../scheduling/risk";
import { canViewClinicIdentity, caseViewForActor, redactClinicIdentity, type ProductionCase } from "../privacy";
import type { Tx } from "../db/sql";
import {
  addCaseEvent,
  appHref,
  clinicForCase,
  fail,
  hasRole,
  loadCalendar,
  postNotice,
  runAs,
  setting,
  type ActionResult,
} from "./common";
import { loadTechnicians, rescheduleCase } from "./schedule";

export type UnitInput = {
  toothNumber: string;
  unitIdentifier: string;
  material: string;
  shade: string;
  instructions: string;
};

export type CaseInput = {
  caseNumber?: string;
  dentistCode: string;
  patientName: string;
  panNumber: string;
  workflowTemplateId: string;
  restorationType: string;
  prescription: string;
  requiredRecords: string;
  specialHandling: string;
  receivedAt: string;
  requestedDeliveryAt: string;
  priority: "low" | "normal" | "high" | "rush";
  rush: boolean;
  hold: boolean;
  holdReason: string;
  excludedStageIds: string[];
  units: UnitInput[];
  clinic: { dentistName: string; clinicName: string; email: string; phone: string; billingNotes: string } | null;
};

const priorities = new Set(["low", "normal", "high", "rush"]);

function clean(value: string, max: number) {
  return value.trim().slice(0, max);
}

function parseWhen(value: string, zone: string) {
  if (!value.trim()) return null;
  const parsed = DateTime.fromISO(value, { zone });
  return parsed.isValid ? parsed : null;
}

export function validateRelease(input: CaseInput, zone: string, hasClinic: boolean) {
  const errors: string[] = [];
  if (!input.dentistCode.trim()) errors.push("Dentist code is required.");
  if (!input.patientName.trim()) errors.push("Patient name is required.");
  if (!input.panNumber.trim()) errors.push("PAN number is required.");
  if (!input.workflowTemplateId) errors.push("A workflow template is required.");
  if (!input.prescription.trim()) errors.push("Prescription or technical instructions are required.");
  if (input.units.length === 0 || input.units.every((unit) => !unit.toothNumber.trim() && !unit.unitIdentifier.trim())) {
    errors.push("At least one unit or tooth number is required.");
  }
  const received = parseWhen(input.receivedAt, zone);
  const delivery = parseWhen(input.requestedDeliveryAt, zone);
  if (!received) errors.push("Received date is required.");
  if (!delivery) errors.push("Requested delivery date is required.");
  if (received && delivery && delivery < received) errors.push("Requested delivery cannot be earlier than the received time.");
  if (!hasClinic) errors.push("A clinic account for this dentist code is required before production.");
  return errors;
}

export async function createCase(userId: string, input: CaseInput): Promise<ActionResult<{ id: string; caseNumber: string }>> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk"])) return { ok: false, message: "Not allowed" };
      const calendar = await loadCalendar(tx);
      if (!priorities.has(input.priority)) return { ok: false, message: "Choose a valid priority." };
      const received = parseWhen(input.receivedAt, calendar.zone);
      const delivery = parseWhen(input.requestedDeliveryAt, calendar.zone);
      if (input.receivedAt && !received) return { ok: false, message: "Received date is not valid." };
      if (input.requestedDeliveryAt && !delivery) return { ok: false, message: "Requested delivery date is not valid." };
      const [template] = await tx<{ id: string; case_type: string }[]>`
        select id, case_type from workflow_templates where id = ${input.workflowTemplateId} and active
      `;
      if (!template) return { ok: false, message: "Choose a workflow template." };
      let clinicId: string | null = null;
      if (canViewClinicIdentity(actor) && input.dentistCode.trim()) {
        const [existing] = await tx<{ id: string }[]>`
          select id from clinic_accounts where lower(dentist_code) = lower(${input.dentistCode.trim()})
        `;
        if (existing) clinicId = existing.id;
        else if (input.clinic?.dentistName.trim() && input.clinic.clinicName.trim()) {
          const [created] = await tx<{ id: string }[]>`
            insert into clinic_accounts (dentist_code, dentist_name, clinic_name, email, phone, billing_notes)
            values (
              ${clean(input.dentistCode, 40)}, ${clean(input.clinic.dentistName, 160)}, ${clean(input.clinic.clinicName, 160)},
              ${clean(input.clinic.email, 200)}, ${clean(input.clinic.phone, 40)}, ${clean(input.clinic.billingNotes, 500)}
            )
            returning id
          `;
          clinicId = created.id;
        }
      }
      const releaseErrors = validateRelease(input, calendar.zone, Boolean(clinicId));
      const status = input.hold ? "on_hold" : releaseErrors.length === 0 ? "awaiting_validation" : "draft";
      const caseNumber = input.caseNumber?.trim()
        ? clean(input.caseNumber, 40)
        : (await tx<{ case_number: string }[]>`select app.next_case_number() as case_number`)[0].case_number;
      const [created] = await tx<{ id: string }[]>`
        insert into cases (
          case_number, dentist_code, patient_name, pan_number, case_type, workflow_template_id,
          restoration_type, prescription, required_records, special_handling, received_at, requested_delivery_at,
          priority, rush, overall_status, hold_reason, created_by, excluded_stage_ids
        ) values (
          ${caseNumber}, ${clean(input.dentistCode, 40)}, ${clean(input.patientName, 160)}, ${clean(input.panNumber, 40)},
          ${template.case_type}, ${template.id}, ${clean(input.restorationType, 160)}, ${clean(input.prescription, 4000)},
          ${clean(input.requiredRecords, 1000)}, ${clean(input.specialHandling, 1000)},
          ${received ? received.toJSDate() : null}, ${delivery ? delivery.toJSDate() : null},
          ${input.rush ? "rush" : input.priority}::priority_level, ${input.rush || input.priority === "rush"},
          ${status}::case_status, ${clean(input.holdReason, 500)}, ${actor.id}, ${input.excludedStageIds.join(",")}
        )
        returning id
      `;
      if (clinicId) {
        await tx`insert into case_clinic_links (case_id, clinic_account_id) values (${created.id}, ${clinicId})`;
        const visibleText = [input.patientName, input.prescription, input.specialHandling, input.requiredRecords, ...input.units.map((unit) => `${unit.instructions} ${unit.material}`)].join(" ");
        await tx`select app.assert_no_clinic_identity(${created.id}::uuid, ${visibleText})`;
      }
      for (const unit of input.units) {
        if (!unit.toothNumber.trim() && !unit.unitIdentifier.trim() && !unit.material.trim()) continue;
        await tx`
          insert into case_units (case_id, unit_identifier, tooth_number, material, shade, unit_instructions)
          values (
            ${created.id}, ${clean(unit.unitIdentifier, 40)}, ${clean(unit.toothNumber, 40)},
            ${clean(unit.material, 80)}, ${clean(unit.shade, 40)}, ${clean(unit.instructions, 500)}
          )
        `;
      }
      await addCaseEvent(tx, created.id, actor.id, "case_created", { status });
      return { ok: true as const, id: created.id, caseNumber };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function releaseCase(userId: string, caseId: string, acknowledgeInfeasible: boolean): Promise<ActionResult<{ reasons: string[] }>> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk"])) return { ok: false, message: "Not allowed" };
      const [row] = await tx<{
        id: string;
        case_number: string;
        dentist_code: string;
        patient_name: string;
        pan_number: string;
        case_type: string;
        workflow_template_id: string | null;
        prescription: string;
        received_at: Date | null;
        requested_delivery_at: Date | null;
        priority: string;
        historical: boolean;
        overall_status: string;
        excluded_stage_ids: string;
      }[]>`
        select id, case_number, dentist_code, patient_name, pan_number, case_type, workflow_template_id,
               prescription, received_at, requested_delivery_at, priority::text as priority, historical,
               overall_status::text as overall_status, excluded_stage_ids
        from cases where id = ${caseId}
      `;
      if (!row) return { ok: false, message: "Case not found." };
      if (row.historical) return { ok: false, message: "Historical records are not released into production." };
      if (!["draft", "awaiting_validation", "on_hold", "ready_for_production"].includes(row.overall_status)) {
        return { ok: false, message: "This case is already in production." };
      }
      const [existingTask] = await tx<{ id: string }[]>`select id from production_tasks where case_id = ${caseId} limit 1`;
      if (existingTask) return { ok: false, message: "This case already has production tasks." };
      const units = await tx<{ tooth_number: string; unit_identifier: string }[]>`
        select tooth_number, unit_identifier from case_units where case_id = ${caseId}
      `;
      const clinic = await clinicForCase(tx, actor, caseId);
      const calendar = await loadCalendar(tx);
      const input: CaseInput = {
        dentistCode: row.dentist_code,
        patientName: row.patient_name,
        panNumber: row.pan_number,
        workflowTemplateId: row.workflow_template_id ?? "",
        restorationType: "",
        prescription: row.prescription,
        requiredRecords: "",
        specialHandling: "",
        receivedAt: row.received_at ? DateTime.fromJSDate(row.received_at).setZone(calendar.zone).toISO() ?? "" : "",
        requestedDeliveryAt: row.requested_delivery_at ? DateTime.fromJSDate(row.requested_delivery_at).setZone(calendar.zone).toISO() ?? "" : "",
        priority: "normal",
        rush: false,
        hold: false,
        holdReason: "",
        excludedStageIds: [],
        units: units.map((unit) => ({ toothNumber: unit.tooth_number, unitIdentifier: unit.unit_identifier, material: "", shade: "", instructions: "" })),
        clinic: null,
      };
      const errors = validateRelease(input, calendar.zone, Boolean(clinic));
      if (errors.length > 0) return { ok: false, message: errors.join(" ") };
      const stages = await tx<{
        id: string;
        stage_name: string;
        department_id: string;
        sequence: number;
        estimated_work_minutes: number;
        elapsed_minutes: number;
        required: boolean;
        skippable: boolean;
        requires_approval: boolean;
        auto_release_next: boolean;
        is_quality_gate: boolean;
        is_dispatch_stage: boolean;
      }[]>`
        select id, stage_name, department_id, sequence, estimated_work_minutes, elapsed_minutes, required,
               skippable, requires_approval, auto_release_next, is_quality_gate, is_dispatch_stage
        from workflow_stages
        where workflow_template_id = ${row.workflow_template_id} and active
        order by sequence
      `;
      const dependencies = await tx<{ predecessor_stage_id: string; successor_stage_id: string }[]>`
        select predecessor_stage_id, successor_stage_id
        from stage_dependencies d
        join workflow_stages s on s.id = d.successor_stage_id
        where s.workflow_template_id = ${row.workflow_template_id}
      `;
      const excluded = new Set(row.excluded_stage_ids.split(",").map((id) => id.trim()).filter(Boolean));
      const nodes: StageNode[] = stages.map((stage) => ({
        id: stage.id,
        name: stage.stage_name,
        workMinutes: stage.estimated_work_minutes,
        elapsedMinutes: stage.elapsed_minutes,
        departmentId: stage.department_id,
        predecessors: dependencies.filter((item) => item.successor_stage_id === stage.id).map((item) => item.predecessor_stage_id),
      }));
      const included = new Set(stages.filter((stage) => !excluded.has(stage.id) || (stage.required && !stage.skippable)).map((stage) => stage.id));
      const bridged = bridgeIncludedStages(nodes, included);
      const delivery = DateTime.fromJSDate(row.requested_delivery_at as Date).setZone(calendar.zone);
      const readyAt = DateTime.now().setZone(calendar.zone);
      const buffer = Number(await setting(tx, "dispatch_buffer_minutes")) || 0;
      const backward = scheduleBackward(bridged, delivery, readyAt, calendar, buffer);
      const forward = scheduleForward(bridged, readyAt, calendar);
      const reasons = [...backward.reasons];
      if (!backward.feasible && !acknowledgeInfeasible) {
        return { ok: false, message: "The requested delivery date does not fit the remaining production stages.", reasons };
      }
      const technicians = await loadTechnicians(tx);
      const planned = backward.stages.length > 0 ? backward.stages : forward.stages;
      const assignment = assignTechnicians(
        planned.map((stage) => ({
          id: stage.id,
          name: stage.name,
          departmentId: stage.departmentId,
          plannedStart: stage.plannedStart,
          laborDue: stage.laborDue,
          workMinutes: stage.workMinutes,
        })),
        technicians,
        calendar,
      );
      reasons.push(...assignment.conflicts);
      const stageById = new Map(stages.map((stage) => [stage.id, stage]));
      const taskIds = new Map<string, string>();
      for (const stage of planned) {
        const source = stageById.get(stage.id);
        if (!source) continue;
        const predecessors = bridged.find((item) => item.id === stage.id)?.predecessors ?? [];
        const [task] = await tx<{ id: string }[]>`
          insert into production_tasks (
            case_id, workflow_stage_id, assigned_user_id, department_id, title, task_status, priority,
            planned_start_at, planned_due_at, labor_due_at, work_minutes, elapsed_minutes, requires_approval,
            is_quality_gate, is_dispatch_stage, auto_release_next, sort_order, technical_instructions
          ) values (
            ${caseId}, ${stage.id}, ${assignment.assignments[stage.id] ?? null}, ${stage.departmentId}, ${stage.name},
            ${predecessors.length === 0 ? "ready_to_start" : "waiting"}::task_status, ${row.priority}::priority_level,
            ${stage.plannedStart.toJSDate()}, ${stage.plannedDue.toJSDate()}, ${stage.laborDue.toJSDate()},
            ${stage.workMinutes}, ${stage.elapsedMinutes}, ${source.requires_approval}, ${source.is_quality_gate},
            ${source.is_dispatch_stage}, ${source.auto_release_next}, ${source.sequence}, ${redactClinicIdentity(row.prescription, clinic)}
          ) returning id
        `;
        taskIds.set(stage.id, task.id);
      }
      for (const stage of bridged) {
        const successor = taskIds.get(stage.id);
        if (!successor) continue;
        for (const predecessorId of stage.predecessors) {
          const predecessor = taskIds.get(predecessorId);
          if (!predecessor) continue;
          await tx`
            insert into task_dependencies (predecessor_task_id, successor_task_id)
            values (${predecessor}, ${successor})
          `;
        }
      }
      const finish = forward.stages.at(-1)?.plannedDue ?? planned.at(-1)?.plannedDue ?? null;
      const nextDue = planned.map((stage) => stage.laborDue).sort((a, b) => a.toMillis() - b.toMillis())[0] ?? null;
      const indicator = assessDeadline({
        now: readyAt,
        requestedDelivery: delivery,
        projectedFinish: finish,
        feasible: backward.feasible && assignment.conflicts.length === 0,
        remainingWorkMinutes: planned.reduce((sum, stage) => sum + stage.workMinutes, 0),
        nextLaborDue: nextDue,
        calendar,
        terminal: false,
      });
      await tx`
        update cases
        set overall_status = 'in_production',
            production_ready_at = now(),
            projected_completion_at = ${finish ? finish.toJSDate() : null},
            deadline_indicator = ${indicator}::deadline_indicator,
            schedule_feasible = ${backward.feasible && assignment.conflicts.length === 0},
            schedule_note = ${reasons.join(" ")},
            acknowledged_infeasible = ${acknowledgeInfeasible},
            initial_department_id = ${planned[0]?.departmentId ?? null}
        where id = ${caseId}
      `;
      await addCaseEvent(tx, caseId, actor.id, "case_released", { feasible: backward.feasible && assignment.conflicts.length === 0 });
      for (const stage of planned) {
        const taskId = taskIds.get(stage.id);
        const assignee = assignment.assignments[stage.id];
        if (!taskId) continue;
        const department = (await tx<{ name: string }[]>`select name from departments where id = ${stage.departmentId}`)[0]?.name ?? "";
        const notice = {
          dentistCode: row.dentist_code,
          patientName: row.patient_name,
          panNumber: row.pan_number,
          caseNumber: row.case_number,
          caseType: row.case_type,
          department,
          task: stage.name,
          deadline: stage.laborDue.toJSDate(),
          priority: row.priority,
          status: (bridged.find((item) => item.id === stage.id)?.predecessors.length ?? 0) === 0 ? "Ready to Start" : "Waiting",
          instructions: row.prescription,
          href: appHref(`/tasks/${taskId}`),
        };
        if (assignee) {
          await postNotice(tx, {
            recipientId: assignee,
            caseId,
            taskId,
            type: "handoff",
            key: `assigned:${taskId}`,
            notice,
            title: "Production task assigned",
            clinic,
          });
        } else {
          const leads = await tx<{ user_id: string }[]>`
            select user_id from department_members
            where department_id = ${stage.departmentId} and active and membership_role = 'lead'
          `;
          for (const lead of leads) {
            await postNotice(tx, {
              recipientId: lead.user_id,
              caseId,
              taskId,
              type: "handoff",
              key: `unassigned:${taskId}:${lead.user_id}`,
              notice,
              title: "Unassigned production task",
              clinic,
            });
          }
        }
      }
      return { ok: true as const, reasons };
    }, { scheduling: true });
  } catch (error) {
    return fail(error);
  }
}

export async function listCases(userId: string, filters: { q?: string; status?: string; caseType?: string; indicator?: string; page?: number }) {
  return runAs(userId, async (tx, actor) => {
    const page = Math.max(1, filters.page ?? 1);
    const limit = 25;
    const offset = (page - 1) * limit;
    const term = filters.q?.trim() ? `%${filters.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
    const rows = await tx<{
      id: string;
      case_number: string;
      dentist_code: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      received_at: Date | null;
      requested_delivery_at: Date | null;
      projected_completion_at: Date | null;
      priority: string;
      overall_status: string;
      dispatch_status: string;
      deadline_indicator: string;
      schedule_feasible: boolean;
      tracker_status: string;
      clinic_name: string | null;
      dentist_name: string | null;
    }[]>`
      select cases.id, cases.case_number, cases.dentist_code, cases.patient_name, cases.pan_number, cases.case_type,
             cases.received_at, cases.requested_delivery_at, cases.projected_completion_at, cases.priority::text as priority,
             cases.overall_status::text as overall_status, cases.dispatch_status::text as dispatch_status,
             cases.deadline_indicator::text as deadline_indicator, cases.schedule_feasible, cases.tracker_status,
             clinic_account.clinic_name, clinic_account.dentist_name
      from cases
      left join case_clinic_links clinic_link on clinic_link.case_id = cases.id
      left join clinic_accounts clinic_account on clinic_account.id = clinic_link.clinic_account_id
      where (${term}::text is null or cases.case_number ilike ${term} or cases.pan_number ilike ${term} or cases.dentist_code ilike ${term}
             or cases.patient_name ilike ${term} or cases.case_type ilike ${term} or clinic_account.clinic_name ilike ${term})
        and (${filters.status ?? null}::text is null or cases.overall_status::text = ${filters.status ?? null})
        and (${filters.caseType ?? null}::text is null or cases.case_type = ${filters.caseType ?? null})
        and (${filters.indicator ?? null}::text is null or cases.deadline_indicator::text = ${filters.indicator ?? null})
      order by cases.requested_delivery_at nulls last, cases.created_at desc
      limit ${limit} offset ${offset}
    `;
    const [count] = await tx<{ total: number }[]>`
      select count(*)::int as total
      from cases
      left join case_clinic_links clinic_link on clinic_link.case_id = cases.id
      left join clinic_accounts clinic_account on clinic_account.id = clinic_link.clinic_account_id
      where (${term}::text is null or cases.case_number ilike ${term} or cases.pan_number ilike ${term} or cases.dentist_code ilike ${term}
             or cases.patient_name ilike ${term} or cases.case_type ilike ${term} or clinic_account.clinic_name ilike ${term})
        and (${filters.status ?? null}::text is null or cases.overall_status::text = ${filters.status ?? null})
        and (${filters.caseType ?? null}::text is null or cases.case_type = ${filters.caseType ?? null})
        and (${filters.indicator ?? null}::text is null or cases.deadline_indicator::text = ${filters.indicator ?? null})
    `;
    const taskRows = rows.length
      ? await tx<{ case_id: string; department_name: string; title: string; sort_order: number; task_status: string }[]>`
          select t.case_id, d.name as department_name, t.title, t.sort_order, t.task_status::text as task_status
          from production_tasks t
          join departments d on d.id = t.department_id
          where t.case_id::text in ${tx(rows.map((row) => row.id))}
          order by t.sort_order
        `
      : [];
    const views = rows.map((row) => {
      const open = taskRows.find((task) => task.case_id === row.id && !["completed", "cancelled"].includes(task.task_status));
      const production: ProductionCase = {
        id: row.id,
        caseNumber: row.case_number,
        dentistCode: row.dentist_code,
        patientName: row.patient_name,
        panNumber: row.pan_number,
        caseType: row.case_type,
        restorationType: "",
        prescription: "",
        requiredRecords: "",
        specialHandling: "",
        receivedAt: row.received_at?.toISOString() ?? null,
        productionReadyAt: null,
        requestedDeliveryAt: row.requested_delivery_at?.toISOString() ?? null,
        projectedCompletionAt: row.projected_completion_at?.toISOString() ?? null,
        priority: row.priority,
        rush: row.priority === "rush",
        overallStatus: row.overall_status,
        trackerStatus: row.tracker_status,
        dispatchStatus: row.dispatch_status,
        deadlineIndicator: row.deadline_indicator,
        scheduleFeasible: row.schedule_feasible,
        scheduleNote: "",
        holdReason: "",
        missingInformation: "",
        historical: false,
        currentDepartment: open?.department_name ?? null,
        currentStage: open?.title ?? null,
      };
      const clinic = row.clinic_name && row.dentist_name
        ? { dentistName: row.dentist_name, clinicName: row.clinic_name, email: "", phone: "", billingNotes: "" }
        : null;
      return caseViewForActor(actor, production, clinic);
    });
    return { ok: true as const, rows: views, total: count?.total ?? 0, page, actor };
  });
}

export async function getCase(userId: string, caseId: string) {
  return runAs(userId, async (tx, actor) => {
    const [row] = await tx<{
      id: string;
      case_number: string;
      dentist_code: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      restoration_type: string;
      prescription: string;
      required_records: string;
      special_handling: string;
      received_at: Date | null;
      production_ready_at: Date | null;
      requested_delivery_at: Date | null;
      projected_completion_at: Date | null;
      priority: string;
      rush: boolean;
      overall_status: string;
      dispatch_status: string;
      deadline_indicator: string;
      schedule_feasible: boolean;
      schedule_note: string;
      hold_reason: string;
      missing_information: string;
      historical: boolean;
      tracker_status: string;
      version: number;
    }[]>`
      select id, case_number, dentist_code, patient_name, pan_number, case_type, restoration_type, prescription,
             required_records, special_handling, received_at, production_ready_at, requested_delivery_at,
             projected_completion_at, priority::text as priority, rush, overall_status::text as overall_status,
             dispatch_status::text as dispatch_status, deadline_indicator::text as deadline_indicator,
             schedule_feasible, schedule_note, hold_reason, missing_information, historical, tracker_status, version
      from cases where id = ${caseId}
    `;
    if (!row) return null;
    const clinic = await clinicForCase(tx, actor, caseId);
    const units = await tx<{
      id: string;
      unit_identifier: string;
      tooth_number: string;
      material: string;
      shade: string;
      unit_instructions: string;
      status: string;
    }[]>`
      select id, unit_identifier, tooth_number, material, shade, unit_instructions, status
      from case_units where case_id = ${caseId} order by created_at
    `;
    const tasks = await tx<{
      id: string;
      title: string;
      task_status: string;
      priority: string;
      department_name: string;
      assignee_name: string | null;
      planned_due_at: Date | null;
      labor_due_at: Date | null;
      blocked_reason: string;
      blocker_category: string | null;
      version: number;
      is_quality_gate: boolean;
      is_dispatch_stage: boolean;
      requires_approval: boolean;
      sort_order: number;
      assigned_user_id: string | null;
    }[]>`
      select t.id, t.title, t.task_status::text as task_status, t.priority::text as priority, d.name as department_name,
             s.full_name as assignee_name, t.planned_due_at, t.labor_due_at, t.blocked_reason, t.blocker_category::text as blocker_category,
             t.version, t.is_quality_gate, t.is_dispatch_stage, t.requires_approval, t.sort_order, t.assigned_user_id
      from production_tasks t
      join departments d on d.id = t.department_id
      left join staff_directory s on s.id = t.assigned_user_id
      where t.case_id = ${caseId}
      order by t.sort_order
    `;
    const events = await tx<{ id: string; event_type: string; event_timestamp: Date; event_details: unknown; actor_name: string | null }[]>`
      select e.id, e.event_type, e.event_timestamp, e.event_details, s.full_name as actor_name
      from case_events e
      left join staff_directory s on s.id = e.actor_id
      where e.case_id = ${caseId}
      order by e.event_timestamp
    `;
    const open = tasks.find((task) => !["completed", "cancelled"].includes(task.task_status));
    const production: ProductionCase = {
      id: row.id,
      caseNumber: row.case_number,
      dentistCode: row.dentist_code,
      patientName: row.patient_name,
      panNumber: row.pan_number,
      caseType: row.case_type,
      restorationType: row.restoration_type,
      prescription: row.prescription,
      requiredRecords: row.required_records,
      specialHandling: row.special_handling,
      receivedAt: row.received_at?.toISOString() ?? null,
      productionReadyAt: row.production_ready_at?.toISOString() ?? null,
      requestedDeliveryAt: row.requested_delivery_at?.toISOString() ?? null,
      projectedCompletionAt: row.projected_completion_at?.toISOString() ?? null,
      priority: row.priority,
      rush: row.rush,
      overallStatus: row.overall_status,
      trackerStatus: row.tracker_status,
      dispatchStatus: row.dispatch_status,
      deadlineIndicator: row.deadline_indicator,
      scheduleFeasible: row.schedule_feasible,
      scheduleNote: row.schedule_note,
      holdReason: row.hold_reason,
      missingInformation: row.missing_information,
      historical: row.historical,
      currentDepartment: open?.department_name ?? null,
      currentStage: open?.title ?? null,
    };
    return {
      actor,
      case: caseViewForActor(actor, production, clinic),
      units,
      tasks,
      events,
      version: row.version,
    };
  });
}

export async function holdCase(userId: string, caseId: string, reason: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk"])) return { ok: false, message: "Not allowed" };
      if (reason.trim().length < 3) return { ok: false, message: "A hold reason is required." };
      const updated = await tx<{ id: string }[]>`
        update cases set overall_status = 'on_hold', hold_reason = ${reason.trim().slice(0, 500)}
        where id = ${caseId} and overall_status in ('draft', 'awaiting_validation', 'ready_for_production', 'in_production')
        returning id
      `;
      if (!updated.length) return { ok: false, message: "The case could not be placed on hold." };
      await addCaseEvent(tx, caseId, actor.id, "case_on_hold", { reason: reason.trim().slice(0, 500) });
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function resumeCase(userId: string, caseId: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk"])) return { ok: false, message: "Not allowed" };
      const [task] = await tx<{ id: string }[]>`select id from production_tasks where case_id = ${caseId} limit 1`;
      const status = task ? "in_production" : "awaiting_validation";
      const updated = await tx<{ id: string }[]>`
        update cases set overall_status = ${status}::case_status, hold_reason = ''
        where id = ${caseId} and overall_status = 'on_hold'
        returning id
      `;
      if (!updated.length) return { ok: false, message: "The case is not on hold." };
      await addCaseEvent(tx, caseId, actor.id, "case_resumed", {});
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function changeDeliveryDate(userId: string, caseId: string, requestedDeliveryAt: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk", "production_manager"])) return { ok: false, message: "Not allowed" };
      const calendar = await loadCalendar(tx);
      const delivery = parseWhen(requestedDeliveryAt, calendar.zone);
      if (!delivery) return { ok: false, message: "Enter a valid delivery date." };
      const [current] = await tx<{ requested_delivery_at: Date | null }[]>`
        select requested_delivery_at from cases where id = ${caseId}
      `;
      if (!current) return { ok: false, message: "Case not found." };
      await tx`update cases set requested_delivery_at = ${delivery.toJSDate()} where id = ${caseId}`;
      await addCaseEvent(tx, caseId, actor.id, "deadline_changed", {
        from: current.requested_delivery_at?.toISOString() ?? "",
        to: delivery.toUTC().toISO() ?? "",
      });
      await rescheduleCase(tx, caseId);
      return { ok: true as const };
    }, { scheduling: true });
  } catch (error) {
    return fail(error);
  }
}

export async function recordDispatch(userId: string, caseId: string, input: { courier: string; trackingNumber: string; notes: string; deliver?: boolean }): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk", "production_manager"])) return { ok: false, message: "Not allowed" };
      const [row] = await tx<{ overall_status: string }[]>`select overall_status::text as overall_status from cases where id = ${caseId}`;
      if (!row) return { ok: false, message: "Case not found." };
      if (!["ready_for_dispatch", "dispatched"].includes(row.overall_status) && !input.deliver) {
        return { ok: false, message: "The case is not ready for dispatch." };
      }
      const [existing] = await tx<{ id: string; dispatched_at: Date | null }[]>`
        select id, dispatched_at from dispatch_records where case_id = ${caseId}
      `;
      if (!existing) {
        await tx`
          insert into dispatch_records (case_id, packed_at, packed_by, courier, tracking_number, dispatched_at, dispatched_by, notes)
          values (${caseId}, now(), ${actor.id}, ${input.courier.trim().slice(0, 120)}, ${input.trackingNumber.trim().slice(0, 120)}, now(), ${actor.id}, ${input.notes.trim().slice(0, 500)})
        `;
      } else if (!existing.dispatched_at) {
        await tx`
          update dispatch_records
          set dispatched_at = now(), dispatched_by = ${actor.id}, courier = ${input.courier.trim().slice(0, 120)},
              tracking_number = ${input.trackingNumber.trim().slice(0, 120)}, notes = ${input.notes.trim().slice(0, 500)}
          where case_id = ${caseId}
        `;
      }
      if (input.deliver) {
        await tx`
          update dispatch_records set delivered_at = now() where case_id = ${caseId} and dispatched_at is not null
        `;
        await tx`
          update cases set dispatch_status = 'delivered', overall_status = 'delivered' where id = ${caseId}
        `;
        await addCaseEvent(tx, caseId, actor.id, "case_delivered", {});
      } else {
        await tx`
          update cases set dispatch_status = 'dispatched', overall_status = 'dispatched' where id = ${caseId}
        `;
        await addCaseEvent(tx, caseId, actor.id, "case_dispatched", { courier: input.courier.trim().slice(0, 120) });
      }
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function recordMissingInformation(userId: string, caseId: string, note: string): Promise<ActionResult> {
  try {
    return await runAs(userId, async (tx, actor) => {
      if (!hasRole(actor, ["administrator", "front_desk"])) return { ok: false, message: "Not allowed" };
      await tx`update cases set missing_information = ${note.trim().slice(0, 1000)} where id = ${caseId}`;
      await addCaseEvent(tx, caseId, actor.id, "missing_information", { note: note.trim().slice(0, 300) });
      return { ok: true as const };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function listTemplates(userId: string) {
  return runAs(userId, async (tx) => {
    const templates = await tx<{ id: string; name: string; case_type: string; description: string }[]>`
      select id, name, case_type, description from workflow_templates where active order by name
    `;
    const stages = await tx<{
      id: string;
      workflow_template_id: string;
      stage_name: string;
      sequence: number;
      estimated_work_minutes: number;
      elapsed_minutes: number;
      required: boolean;
      skippable: boolean;
      department_name: string;
    }[]>`
      select s.id, s.workflow_template_id, s.stage_name, s.sequence, s.estimated_work_minutes, s.elapsed_minutes,
             s.required, s.skippable, d.name as department_name
      from workflow_stages s
      join departments d on d.id = s.department_id
      where s.active
      order by s.sequence
    `;
    return templates.map((template) => ({
      ...template,
      stages: stages.filter((stage) => stage.workflow_template_id === template.id),
    }));
  });
}
