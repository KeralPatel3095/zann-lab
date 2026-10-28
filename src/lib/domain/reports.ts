import { DateTime } from "luxon";
import { LAB_ZONE, weekAheadWindow, workDayBeforeDue } from "../scheduling/calendar";
import { hasRole, runAs } from "./common";

export async function dashboard(userId: string) {
  return runAs(userId, async (tx, actor) => {
    const zone = "America/Toronto";
    const [counts] = await tx<{
      active_cases: number;
      received_today: number;
      waiting_validation: number;
      in_production: number;
      due_today: number;
      due_tomorrow: number;
      overdue: number;
      at_risk: number;
      blocked: number;
      awaiting_qc: number;
      ready_dispatch: number;
      dispatched_today: number;
    }[]>`
      select
        count(*) filter (where overall_status not in ('dispatched', 'delivered', 'cancelled'))::int as active_cases,
        count(*) filter (where (received_at at time zone ${zone})::date = (now() at time zone ${zone})::date)::int as received_today,
        count(*) filter (where overall_status in ('draft', 'awaiting_validation'))::int as waiting_validation,
        count(*) filter (where overall_status = 'in_production')::int as in_production,
        count(*) filter (where (requested_delivery_at at time zone ${zone})::date = (now() at time zone ${zone})::date and overall_status not in ('dispatched', 'delivered', 'cancelled'))::int as due_today,
        count(*) filter (where (requested_delivery_at at time zone ${zone})::date = ((now() at time zone ${zone})::date + 1) and overall_status not in ('dispatched', 'delivered', 'cancelled'))::int as due_tomorrow,
        count(*) filter (where deadline_indicator = 'overdue' and overall_status not in ('dispatched', 'delivered', 'cancelled'))::int as overdue,
        count(*) filter (where deadline_indicator = 'at_risk' and overall_status not in ('dispatched', 'delivered', 'cancelled'))::int as at_risk,
        count(*) filter (where exists (select 1 from production_tasks t where t.case_id = cases.id and t.task_status = 'blocked'))::int as blocked,
        count(*) filter (where overall_status = 'awaiting_quality_control')::int as awaiting_qc,
        count(*) filter (where overall_status = 'ready_for_dispatch')::int as ready_dispatch,
        count(*) filter (where exists (
          select 1 from dispatch_records d
          where d.case_id = cases.id and (d.dispatched_at at time zone ${zone})::date = (now() at time zone ${zone})::date
        ))::int as dispatched_today
      from cases
    `;
    const departments = await tx<{ name: string; open_tasks: number; blocked_tasks: number }[]>`
      select d.name,
             count(t.id) filter (where t.task_status not in ('completed', 'cancelled'))::int as open_tasks,
             count(t.id) filter (where t.task_status = 'blocked')::int as blocked_tasks
      from departments d
      left join production_tasks t on t.department_id = d.id
      where d.active
      group by d.name, d.sort_order
      order by d.sort_order
    `;
    const technicians = await tx<{ full_name: string; open_tasks: number; work_minutes: number; capacity: number }[]>`
      select p.full_name,
             count(t.id) filter (where t.task_status not in ('completed', 'cancelled'))::int as open_tasks,
             coalesce(sum(t.work_minutes) filter (where t.task_status not in ('completed', 'cancelled')), 0)::int as work_minutes,
             p.daily_capacity_minutes as capacity
      from profiles p
      left join production_tasks t on t.assigned_user_id = p.id
      where p.role = 'technician' and p.active
      group by p.id, p.full_name, p.daily_capacity_minutes
      order by p.full_name
    `;
    const turnaround = await tx<{ case_type: string; average_hours: number; cases: number }[]>`
      select c.case_type,
             coalesce(round(avg(extract(epoch from (d.dispatched_at - c.received_at)) / 3600)::numeric, 1), 0)::float as average_hours,
             count(*)::int as cases
      from cases c
      join dispatch_records d on d.case_id = c.id
      where d.dispatched_at is not null and c.received_at is not null
      group by c.case_type
      order by c.case_type
    `;
    const [delivery] = await tx<{ on_time: number; total: number }[]>`
      select
        count(*) filter (where d.dispatched_at <= c.requested_delivery_at)::int as on_time,
        count(*)::int as total
      from cases c
      join dispatch_records d on d.case_id = c.id
      where d.dispatched_at is not null and c.requested_delivery_at is not null
    `;
    const bottlenecks = await tx<{ title: string; open_tasks: number }[]>`
      select title, count(*)::int as open_tasks
      from production_tasks
      where task_status not in ('completed', 'cancelled')
      group by title
      order by count(*) desc
      limit 8
    `;
    const [quality] = await tx<{ failures: number; reworks: number; completed_tasks: number; completed_cases: number; dispatched_cases: number }[]>`
      select
        (select count(*) from quality_checks where outcome <> 'approved')::int as failures,
        (select count(*) from rework_orders)::int as reworks,
        (select count(*) from production_tasks where task_status = 'completed')::int as completed_tasks,
        (select count(*) from cases where overall_status in ('ready_for_dispatch', 'dispatched', 'delivered'))::int as completed_cases,
        (select count(*) from cases where overall_status in ('dispatched', 'delivered'))::int as dispatched_cases
    `;
    const today = DateTime.now().setZone(LAB_ZONE).toISODate();
    const tomorrow = DateTime.now().setZone(LAB_ZONE).plus({ days: 1 }).toISODate();
    const ahead = weekAheadWindow();
    const finishToday = await tx<{
      id: string;
      case_number: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      requested_delivery_at: Date | null;
      overall_status: string;
      tracker_status: string;
      tracker_due: string;
    }[]>`
      select id, case_number, patient_name, pan_number, case_type, requested_delivery_at, overall_status, tracker_status, tracker_due
      from app.cases_due_between(${today}::date, ${tomorrow}::date)
    `;
    const finishWeek = await tx<{
      id: string;
      case_number: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      requested_delivery_at: Date | null;
      overall_status: string;
      tracker_status: string;
      tracker_due: string;
    }[]>`
      select id, case_number, patient_name, pan_number, case_type, requested_delivery_at, overall_status, tracker_status, tracker_due
      from app.cases_due_between(${ahead.start.plus({ days: 1 }).toISODate()}::date, ${ahead.end.plus({ days: 4 }).toISODate()}::date)
    `;
    const weekdayWeek = finishWeek.filter((row) => {
      if (!row.requested_delivery_at) return false;
      const workDay = workDayBeforeDue(DateTime.fromJSDate(row.requested_delivery_at), row.tracker_due);
      return workDay >= ahead.start && workDay <= ahead.end;
    });
    const myTasks = await tx<{ task_status: string; total: number }[]>`
      select task_status::text as task_status, count(*)::int as total
      from production_tasks
      where assigned_user_id = ${actor.id}
      group by task_status
    `;
    return { actor, counts: counts ?? null, departments, technicians, turnaround, delivery: delivery ?? { on_time: 0, total: 0 }, bottlenecks, quality: quality ?? null, myTasks, finishToday, finishWeek: weekdayWeek, finishOn: tomorrow };
  });
}

export async function listCasesDueBetween(userId: string, start: string, end: string) {
  return runAs(userId, async (tx) => tx<{
    id: string;
    case_number: string;
    patient_name: string;
    pan_number: string;
    case_type: string;
    requested_delivery_at: Date | null;
    overall_status: string;
    tracker_status: string;
    tracker_due: string;
  }[]>`
    select id, case_number, patient_name, pan_number, case_type, requested_delivery_at, overall_status, tracker_status, tracker_due
    from app.cases_due_between(${start}::date, ${end}::date)
  `);
}

export async function managementSummary(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (!hasRole(actor, ["administrator", "production_manager"])) return null;
    const [totals] = await tx<{ in_lab: number; ready_to_pack: number; finished: number; late: number }[]>`
      select
        count(*) filter (where overall_status = 'in_production' and not historical)::int as in_lab,
        count(*) filter (where overall_status = 'ready_for_dispatch')::int as ready_to_pack,
        count(*) filter (where overall_status in ('delivered', 'dispatched') or tracker_status ilike 'scheduled')::int as finished,
        count(*) filter (where overall_status = 'in_production' and not historical and deadline_indicator = 'overdue')::int as late
      from cases
    `;
    const products = await tx<{ case_type: string; total: number }[]>`
      select case_type, count(*)::int as total
      from cases
      where overall_status = 'in_production' and not historical
      group by case_type
      order by count(*) desc, case_type
    `;
    const ahead = weekAheadWindow();
    const weekRows = await tx<{ requested_delivery_at: Date | null; tracker_due: string }[]>`
      select requested_delivery_at, tracker_due
      from app.cases_due_between(${ahead.start.plus({ days: 1 }).toISODate()}::date, ${ahead.end.plus({ days: 4 }).toISODate()}::date)
    `;
    const thisWeek = weekRows.filter((row) => {
      if (!row.requested_delivery_at) return false;
      const workDay = workDayBeforeDue(DateTime.fromJSDate(row.requested_delivery_at), row.tracker_due);
      return workDay >= ahead.start && workDay <= ahead.end;
    }).length;
    return { totals: totals ?? { in_lab: 0, ready_to_pack: 0, finished: 0, late: 0 }, products, thisWeek };
  });
}

export async function listNotifications(userId: string) {
  return runAs(userId, async (tx) => tx<{ id: string; title: string; body: string; created_at: Date; read_at: Date | null; task_id: string | null }[]>`
    select id, title, body, created_at, read_at, task_id
    from notifications
    order by created_at desc
    limit 50
  `);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return runAs(userId, async (tx) => {
    await tx`update notifications set read_at = coalesce(read_at, now()) where id = ${notificationId} and recipient_user_id = ${userId}`;
    return { ok: true as const };
  });
}

export async function auditLog(userId: string) {
  return runAs(userId, async (tx, actor) => {
    if (actor.role !== "administrator" && actor.role !== "production_manager") return [];
    return tx<{ id: string; action: string; entity_type: string; created_at: Date; actor_name: string | null }[]>`
      select a.id, a.action, a.entity_type, a.created_at, s.full_name as actor_name
      from audit_logs a
      left join staff_directory s on s.id = a.actor_id
      order by a.created_at desc
      limit 100
    `;
  });
}
