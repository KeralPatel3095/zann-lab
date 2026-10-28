import { DateTime } from "luxon";
import { getSql, withUser } from "../db/sql";
import { composeEmailNotification } from "../notifications/compose";
import { overdueKey, reminderIsDue, reminderKey, summaryKey } from "../scheduling/risk";
import { appHref, loadCalendar, postNotice, setting } from "./common";

async function schedulerId() {
  const sql = await getSql();
  const [row] = await sql<{ setting_value: string }[]>`
    select setting_value from production_settings where setting_key = 'scheduler_user_id'
  `;
  if (!row?.setting_value) throw new Error("Scheduler is not configured");
  return row.setting_value;
}

export async function runReminderJob(now = new Date()) {
  const userId = await schedulerId();
  return withUser(userId, async (tx) => {
    const locked = await tx<{ job_name: string }[]>`
      insert into job_locks (job_name, locked_until, locked_by)
      values ('reminders', now() + interval '10 minutes', 'scheduler')
      on conflict (job_name) do update
        set locked_until = excluded.locked_until, locked_by = excluded.locked_by
        where job_locks.locked_until < now()
      returning job_name
    `;
    if (!locked.length) return { created: 0, skipped: true };
    const calendar = await loadCalendar(tx);
    const reminderTime = await setting(tx, "reminder_local_time");
    const includePatient = (await setting(tx, "email_include_patient_details")) === "true";
    const current = DateTime.fromJSDate(now).setZone(calendar.zone);
    const tasks = await tx<{
      id: string;
      labor_due_at: Date;
      task_status: string;
      assigned_user_id: string;
      title: string;
      priority: string;
      technical_instructions: string;
      case_id: string;
      case_number: string;
      dentist_code: string;
      patient_name: string;
      pan_number: string;
      case_type: string;
      department_name: string;
    }[]>`
      select t.id, t.labor_due_at, t.task_status::text as task_status, t.assigned_user_id, t.title,
             t.priority::text as priority, t.technical_instructions, c.id as case_id, c.case_number,
             c.dentist_code, c.patient_name, c.pan_number, c.case_type, d.name as department_name
      from production_tasks t
      join cases c on c.id = t.case_id
      join departments d on d.id = t.department_id
      where t.assigned_user_id is not null
        and t.task_status not in ('completed', 'cancelled')
        and t.labor_due_at is not null
        and c.historical = false
    `;
    let created = 0;
    const dueByUser = new Map<string, number>();
    for (const task of tasks) {
      const due = DateTime.fromJSDate(task.labor_due_at).setZone(calendar.zone);
      const notice = {
        dentistCode: task.dentist_code,
        patientName: task.patient_name,
        panNumber: task.pan_number,
        caseNumber: task.case_number,
        caseType: task.case_type,
        department: task.department_name,
        task: task.title,
        deadline: task.labor_due_at,
        priority: task.priority,
        status: task.task_status,
        instructions: task.technical_instructions,
        href: appHref(`/tasks/${task.id}`),
      };
      if (reminderIsDue(due, current, calendar, reminderTime || "08:00")) {
        const before = await tx<{ id: string }[]>`select notification_id as id from notification_keys where idempotency_key = ${reminderKey(task.id, due)}`;
        await postNotice(tx, {
          recipientId: task.assigned_user_id,
          caseId: task.case_id,
          taskId: task.id,
          type: "upcoming_task",
          key: reminderKey(task.id, due),
          notice,
          clinic: null,
        });
        const after = await tx<{ id: string }[]>`select notification_id as id from notification_keys where idempotency_key = ${reminderKey(task.id, due)}`;
        if (!before.length && after.length) created += 1;
      }
      if (due < current) {
        const before = await tx<{ id: string }[]>`select notification_id as id from notification_keys where idempotency_key = ${overdueKey(task.id, due)}`;
        await postNotice(tx, {
          recipientId: task.assigned_user_id,
          caseId: task.case_id,
          taskId: task.id,
          type: "overdue",
          key: overdueKey(task.id, due),
          title: "Overdue production task",
          notice,
          clinic: null,
        });
        const after = await tx<{ id: string }[]>`select notification_id as id from notification_keys where idempotency_key = ${overdueKey(task.id, due)}`;
        if (!before.length && after.length) created += 1;
      }
      if (due.toISODate() === current.toISODate() || due.toISODate() === current.plus({ days: 1 }).toISODate()) {
        dueByUser.set(task.assigned_user_id, (dueByUser.get(task.assigned_user_id) ?? 0) + 1);
      }
    }
    for (const [user, count] of dueByUser) {
      const day = current.toISODate() ?? "";
      await tx`
        select app.post_notification(
          ${user}::uuid, null::uuid, null::uuid, 'daily_summary', 'Daily production summary',
          ${`You have ${count} production task${count === 1 ? "" : "s"} due today or tomorrow. Sign in to view them: ${appHref("/tasks")}`},
          ${summaryKey(user, day)}
        )
      `;
    }
    await deliverPendingEmails(tx, includePatient);
    await tx`update job_locks set locked_until = now() where job_name = 'reminders'`;
    return { created, skipped: false };
  });
}

async function deliverPendingEmails(tx: Parameters<Parameters<typeof withUser>[1]>[0], includePatient: boolean) {
  const pending = await tx<{ id: string; notification_id: string; email: string; title: string; body: string }[]>`
    select d.id, d.notification_id, p.email, n.title, n.body
    from notification_deliveries d
    join notifications n on n.id = d.notification_id
    join profiles p on p.id = n.recipient_user_id
    where d.channel = 'email' and d.delivery_status = 'pending' and d.attempt_count < 5
    limit 50
  `;
  for (const delivery of pending) {
    const message = composeEmailNotification(appHref("/tasks"), includePatient ? delivery.body : null);
    const result = await sendEmail(delivery.email, message.title, message.body);
    await tx`
      update notification_deliveries
      set attempt_count = attempt_count + 1,
          last_attempt_at = now(),
          delivery_status = ${result.ok ? "sent" : "failed"},
          delivered_at = case when ${result.ok} then now() else delivered_at end,
          last_error = ${result.ok ? "" : result.error}
      where id = ${delivery.id}
    `;
  }
}

async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST) return { ok: false, error: "SMTP is not configured" };
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
    return { ok: true, error: "" };
  } catch {
    return { ok: false, error: "Email delivery failed" };
  }
}
